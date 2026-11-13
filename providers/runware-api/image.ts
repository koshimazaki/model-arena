/**
 * Image inference for the character still and other reference images. The
 * models and their schema facts live in image-models.ts. `planImage` is pure:
 * it checks the request against the model's schema rules and refuses what the
 * model cannot take with a PlanError; `runImage` uploads, submits and polls.
 */
import type { InputSent } from "../../packages/core/src/record.ts";
import type { CostEstimate, LaneMedia } from "../types.ts";
import { RunwareApiError, type RunwareClient } from "./client.ts";
import { allPairs, findImageModel, IMAGE_MODELS, tierOf, type ImageModel, type SizeRule } from "./image-models.ts";
import { pollImage, type PollOptions } from "./poll.ts";
import { fillUploads, PlanError, uploadPlaceholder } from "./task.ts";

export * from "./image-models.ts";

/** A still is a raster; these are the formats offered where the schema lists them. */
export const STILL_FORMATS = ["PNG", "JPG", "WEBP"] as const;
export type StillFormat = (typeof STILL_FORMATS)[number];

export interface ImageRequest {
  model: string;
  prompt: string;
  /** A pose or edit reference, e.g. the guide's first frame. Shorthand for one `references` entry. */
  reference?: LaneMedia;
  /** Reference images in the order they are sent (the first one sizes the output when no size is given). */
  references?: LaneMedia[];
  width?: number;
  height?: number;
  /** A `resolution` preset, where the schema has one (Kling IMAGE 3.0 and FLUX 3 Image only beside a reference). */
  resolution?: string;
  /** A transparent background, where the schema has `settings.background`. */
  transparent?: boolean;
  /** PNG by default. */
  outputFormat?: StillFormat;
}

export interface ImagePlan {
  modelId: string;
  modelName: string;
  uploads: { placeholder: string; media: LaneMedia }[];
  task: Record<string, unknown>;
  inputsSent: InputSent[];
  estimate: CostEstimate;
  notes: string[];
}

type Grid = Extract<SizeRule, { kind: "grid" }>;
type List = Extract<SizeRule, { kind: "list" }>;
const pct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** The grid rule in words, for refusals and hosts. */
export function describeSize(s: SizeRule): string {
  if (s.kind === "list") {
    const tiers = Object.entries(s.pairs).map(([t, l]) => `${l.length} at ${t}`);
    return `${allPairs(s).length} fixed width×height pairs (${tiers.join(", ")}; default ${s.default.join("×")}); with a reference, resolution ${s.withReference.values.join("/")}${s.pairsWithReference ? " or a listed pair" : ""}`;
  }
  const parts = [`${s.min}-${s.max} px a side${s.multipleOf > 1 ? ` in multiples of ${s.multipleOf}` : ""}`];
  if (s.area) parts.push(`${(s.area.min / 1e6).toFixed(2)}-${(s.area.max / 1e6).toFixed(2)} MP`);
  if (s.ratio) parts.push(`aspect ${pct(s.ratio.min)}-${pct(s.ratio.max)}`);
  if (s.resolution) parts.push(`or resolution ${s.resolution.values.join("/")}`);
  return parts.join(", ");
}

function gridProblem(s: Grid, w: number, h: number): string | undefined {
  if (w < s.min || w > s.max || h < s.min || h > s.max || w % s.multipleOf || h % s.multipleOf)
    return `sizes are ${s.min}-${s.max} px${s.multipleOf > 1 ? ` in multiples of ${s.multipleOf}` : ""}`;
  if (s.area && (w * h < s.area.min || w * h > s.area.max)) return `width × height must be ${s.area.min}-${s.area.max} px`;
  if (s.ratio && (w / h < s.ratio.min - 1e-9 || w / h > s.ratio.max + 1e-9)) return `the aspect must be ${pct(s.ratio.min)}-${pct(s.ratio.max)}`;
  return undefined;
}

/** A reference's size moved onto the grid: scaled into the area range, snapped, clamped. */
function fitGrid(s: Grid, w: number, h: number): [number, number] {
  let k = 1;
  if (s.area && w * h < s.area.min) k = Math.sqrt(s.area.min / (w * h));
  if (s.area && w * h > s.area.max) k = Math.sqrt(s.area.max / (w * h));
  const step = k > 1 ? Math.ceil : k < 1 ? Math.floor : Math.round;
  const snap = (n: number) => Math.min(s.max, Math.max(s.min, step((n * k) / s.multipleOf) * s.multipleOf));
  return [snap(w), snap(h)];
}

function checkReference(m: ImageModel, r: LaneMedia, notes: string[]): void {
  const rule = m.references;
  const { width: w, height: h, bytes } = r.info ?? {};
  if (rule.maxBytes && bytes && bytes > rule.maxBytes)
    throw new PlanError(`${m.name} takes reference images up to ${Math.round(rule.maxBytes / 1048576)} MB; ${r.name} is ${(bytes / 1048576).toFixed(1)} MB. Re-save it smaller.`);
  if (!w || !h) {
    if (rule.minSide || rule.maxSide || rule.minRatio || rule.maxPixels) notes.push(`${r.name}: its size is not known here, so ${m.name}'s reference limits were not checked; Runware checks them.`);
    return;
  }
  if (rule.minSide && Math.min(w, h) < rule.minSide)
    throw new PlanError(`${m.name} takes reference images at least ${rule.minSide} px a side; ${r.name} is ${w}×${h}. Use a larger image.`);
  if (rule.maxSide && Math.max(w, h) > rule.maxSide)
    throw new PlanError(`${m.name} takes reference images up to ${rule.maxSide} px a side; ${r.name} is ${w}×${h}. Resize it.`);
  if (rule.maxPixels && w * h > rule.maxPixels)
    throw new PlanError(`${m.name} takes reference images up to ${rule.maxPixels / 1e6} MP; ${r.name} is ${((w * h) / 1e6).toFixed(1)} MP. Resize it.`);
  if ((rule.minRatio && w / h < rule.minRatio) || (rule.maxRatio && w / h > rule.maxRatio))
    throw new PlanError(`${m.name} takes reference images with aspect ${pct(rule.minRatio ?? 0)}-${pct(rule.maxRatio ?? Infinity)}; ${r.name} is ${(w / h).toFixed(2)}. Crop it.`);
}

export function planImage(req: ImageRequest, taskUUID: string = globalThis.crypto.randomUUID()): ImagePlan {
  const m = findImageModel(req.model);
  const prompt = req.prompt.trim();
  if (prompt.length < m.prompt.min || prompt.length > m.prompt.max)
    throw new PlanError(`${m.name} takes a prompt of ${m.prompt.min}-${m.prompt.max} characters.`);
  const task: Record<string, unknown> = { taskType: "imageInference", taskUUID, model: m.air, positivePrompt: prompt };
  const uploads: ImagePlan["uploads"] = [];
  const inputsSent: InputSent[] = [];
  const notes: string[] = [];
  const refs = [...(req.reference ? [req.reference] : []), ...(req.references ?? [])];

  if (refs.length > m.references.max)
    throw new PlanError(`${m.name} takes ${m.references.max === 1 ? "one reference image" : `up to ${m.references.max} reference images`}; got ${refs.length}.`);
  if (refs.length) {
    const values = refs.map((ref) => {
      checkReference(m, ref, notes);
      inputsSent.push({ role: "referenceImage", src: ref.displaySrc ?? ref.name, label: ref.name });
      if (/^https:\/\//.test(ref.ref)) return ref.ref;
      if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(ref.ref)) throw new PlanError(`${ref.name}: the reference must be an https URL or an image file.`);
      const placeholder = uploadPlaceholder(uploads.length + 1, ref.name);
      uploads.push({ placeholder, media: ref });
      return placeholder;
    });
    task.inputs = { referenceImages: values };
  }

  const first = refs.find((r) => r.info?.width && r.info?.height);
  const size = m.size;
  if (req.width !== undefined && req.resolution) throw new PlanError(`${m.name} takes a resolution or a width and height, not both.`);
  if (size.kind === "grid") planGrid(m, size, req, first, task, notes);
  else planList(m, size, req, refs.length > 0, task, notes);

  const format = req.outputFormat ?? "PNG";
  if (!STILL_FORMATS.includes(format) || !m.outputFormats.includes(format))
    throw new PlanError(`${m.name} still formats: ${m.outputFormats.filter((f) => (STILL_FORMATS as readonly string[]).includes(f)).join(", ")}.`);
  if (req.transparent) {
    if (!m.transparency) throw new PlanError(`${m.name} has no transparent background in its schema; pick one that has (${IMAGE_MODELS.filter((x) => x.transparency).map((x) => x.key).join(", ")}).`);
    if (format === "JPG") throw new PlanError(`${m.name} makes a transparent background only as PNG or WEBP.`);
    task.settings = { background: "transparent" };
  }

  Object.assign(task, { outputType: "URL", outputFormat: format, numberResults: 1, deliveryMethod: "async", includeCost: true });
  const estimate = m.estimate({
    width: task.width as number | undefined,
    height: task.height as number | undefined,
    resolution: task.resolution as string | undefined,
    references: refs.length,
  });
  if (estimate.usd === null) notes.push(`${m.name}: no price estimate (${estimate.basis}). A run with a price cap is refused.`);
  return { modelId: m.air, modelName: m.name, uploads, task, inputsSent, estimate, notes };
}

function planGrid(m: ImageModel, s: Grid, req: ImageRequest, first: LaneMedia | undefined, task: Record<string, unknown>, notes: string[]) {
  if (req.resolution) {
    if (!s.resolution) throw new PlanError(`${m.name} has no resolution preset; give --width and --height (${describeSize(s)}).`);
    if (!s.resolution.values.includes(req.resolution)) throw new PlanError(`${m.name} resolutions: ${s.resolution.values.join(", ")}.`);
    task.resolution = req.resolution;
    return;
  }
  if (req.width !== undefined || req.height !== undefined) {
    const [w, h] = [req.width ?? 0, req.height ?? 0];
    const problem = gridProblem(s, w, h);
    if (problem) throw new PlanError(`${m.name} ${problem}; got ${w}×${h}. Rule: ${describeSize(s)}.`);
    task.width = w;
    task.height = h;
    return;
  }
  let [w, h] = s.default;
  if (first) {
    const [rw, rh] = [first.info!.width!, first.info!.height!];
    const [fw, fh] = fitGrid(s, rw, rh);
    if (gridProblem(s, fw, fh)) notes.push(`${first.name} (${rw}×${rh}) does not fit ${m.name}'s output sizes, so the still is ${w}×${h}; the reference is sent as it is.`);
    else {
      [w, h] = [fw, fh];
      if (fw !== rw || fh !== rh) notes.push(`Output size ${fw}×${fh}, ${s.multipleOf > 1 && !s.area ? `snapped (multiples of ${s.multipleOf})` : "fitted to the model's size rule"} from ${first.name}'s ${rw}×${rh}; the reference is sent as it is.`);
    }
  }
  task.width = w;
  task.height = h;
}

function planList(m: ImageModel, s: List, req: ImageRequest, hasRef: boolean, task: Record<string, unknown>, notes: string[]) {
  const pairs = allPairs(s);
  const listed = (w: number, h: number) => pairs.some(([a, b]) => a === w && b === h);
  if (hasRef && (req.width === undefined || !s.pairsWithReference)) {
    // Schema: `resolution` only with a reference image, and never beside width/height.
    if (req.width !== undefined)
      throw new PlanError(`${m.name} with a reference takes --resolution (${s.withReference.values.join(" or ")}), not a width and height; the output follows the reference's aspect.`);
    const r = req.resolution ?? s.withReference.default;
    if (!s.withReference.values.includes(r)) throw new PlanError(`${m.name} resolutions: ${s.withReference.values.join(", ")}.`);
    task.resolution = r;
    notes.push(`${m.name} matches the reference's aspect ratio at ${r}.`);
    return;
  }
  if (req.resolution) throw new PlanError(`${m.name} takes --resolution only beside a reference image.`);
  const [w, h] = [req.width ?? s.default[0], req.height ?? s.default[1]];
  if (!listed(w, h)) throw new PlanError(`${m.name} sizes: ${pairs.map(([a, b]) => `${a}×${b}`).join(", ")}.`);
  task.width = w;
  task.height = h;
  const tier = tierOf(s, w, h);
  if (tier && Object.keys(s.pairs).length > 1) notes.push(`${w}×${h} is a ${tier} size.`);
}

/** Uploads the references, submits, polls `imageURL`. Never resubmits. */
export async function runImage(client: RunwareClient, plan: ImagePlan, opts: Omit<PollOptions, "urlField"> & { onUpload?: (name: string) => void; onSubmit?: () => void } = {}) {
  const ids = new Map<string, string>();
  for (const u of plan.uploads) {
    opts.onUpload?.(u.media.name);
    ids.set(u.placeholder, (await client.upload(u.media.ref, opts.signal)).mediaUUID);
  }
  const task = fillUploads(plan.task, ids);
  opts.onSubmit?.();
  const { errors } = await client.post([task], opts.signal);
  const mine = errors.filter((e) => !e.taskUUID || e.taskUUID === task.taskUUID);
  if (mine.length) throw new RunwareApiError(400, mine);
  return { task, result: await pollImage(client, String(task.taskUUID), opts) };
}
