/**
 * Image inference for the character still: FLUX.2 [klein] 9B and Kling IMAGE
 * 3.0, each read from its schema on 10 Nov 2026 (fixtures in
 * tests/fixtures/runware-schemas/). Both take text-to-image and a reference
 * image, so the still can be pose-matched to the guide's first frame.
 * `planImage` is pure; `runImage` uploads, submits and polls.
 */
import type { CostEstimate, LaneMedia } from "../types.ts";
import type { RunwareClient } from "./client.ts";
import { pollImage, type PollOptions } from "./poll.ts";
import { fillUploads, PlanError, uploadPlaceholder } from "./task.ts";

const DOCS = "https://runware.ai/docs/models";

export interface ImageModel {
  key: string;
  air: string;
  slug: string;
  name: string;
  prompt: { min: number; max: number };
  maxReferences: number;
  /** Free sizes on a grid (klein) or a fixed list of pairs (Kling). */
  size:
    | { kind: "grid"; min: number; max: number; multipleOf: number; default: [number, number] }
    | { kind: "list"; pairs: [number, number][]; default: [number, number]; withReference: { field: "resolution"; values: string[]; default: string } };
  referenceAspect?: { min: number; max: number };
  estimate: CostEstimate;
  schemaUrl: string;
  pageUrl: string;
}

export const KLEIN_9B: ImageModel = {
  key: "klein-9b",
  air: "runware:400@2",
  slug: "bfl-flux-2-klein-9b",
  name: "FLUX.2 [klein] 9B",
  prompt: { min: 1, max: 10000 },
  maxReferences: 4,
  // Required width and height: 128-2048, multiples of 16. 1280×720 matches a 16:9 guide frame.
  size: { kind: "grid", min: 128, max: 2048, multipleOf: 16, default: [1280, 720] },
  referenceAspect: { min: 0.125, max: 8 },
  // No per-unit rate: "billed by compute time". The bound is the highest published example price.
  estimate: { usd: 0.00338, basis: "no published rate (compute-time billing); bounded by the highest published example, $0.00338" },
  schemaUrl: `${DOCS}/bfl-flux-2-klein-9b/schema.json`,
  pageUrl: `${DOCS}/bfl-flux-2-klein-9b`,
};

export const KLING_IMAGE_3: ImageModel = {
  key: "kling-image-3",
  air: "klingai:kling-image@3",
  slug: "klingai-image-3-0",
  name: "Kling IMAGE 3.0",
  prompt: { min: 1, max: 2500 },
  maxReferences: 1,
  size: {
    kind: "list",
    // Without a reference, width/height must be one of these pairs; with one, `resolution` follows its aspect.
    pairs: [
      [1024, 1024], [1248, 832], [832, 1248], [1168, 880], [880, 1168], [768, 1360], [1360, 768], [1552, 656],
      [2048, 2048], [2496, 1664], [1664, 2496], [2336, 1760], [1760, 2336], [1536, 2720], [2720, 1536], [3104, 1312],
    ],
    default: [1360, 768],
    withReference: { field: "resolution", values: ["1K", "2K"], default: "1K" },
  },
  estimate: { usd: 0.028, basis: "x-pricing: $0.028 per image" },
  schemaUrl: `${DOCS}/klingai-image-3-0/schema.json`,
  pageUrl: `${DOCS}/klingai-image-3-0`,
};

export const IMAGE_MODELS = [KLEIN_9B, KLING_IMAGE_3];

export function findImageModel(key: string): ImageModel {
  const m = IMAGE_MODELS.find((x) => x.key === key || x.air === key || x.slug === key);
  if (!m) throw new PlanError(`Unknown image model "${key}". Use one of: ${IMAGE_MODELS.map((x) => x.key).join(", ")}.`);
  return m;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  /** A pose or edit reference, e.g. the guide's first frame. */
  reference?: LaneMedia;
  width?: number;
  height?: number;
  /** Kling IMAGE 3.0 with a reference: 1K or 2K. */
  resolution?: string;
}

export interface ImagePlan {
  modelId: string;
  modelName: string;
  uploads: { placeholder: string; media: LaneMedia }[];
  task: Record<string, unknown>;
  estimate: CostEstimate;
  notes: string[];
}

export function planImage(req: ImageRequest, taskUUID = globalThis.crypto.randomUUID()): ImagePlan {
  const m = findImageModel(req.model);
  const prompt = req.prompt.trim();
  if (prompt.length < m.prompt.min || prompt.length > m.prompt.max)
    throw new PlanError(`${m.name} takes a prompt of ${m.prompt.min}-${m.prompt.max} characters.`);
  const task: Record<string, unknown> = { taskType: "imageInference", taskUUID, model: m.air, positivePrompt: prompt };
  const uploads: ImagePlan["uploads"] = [];
  const notes: string[] = [];
  const ref = req.reference;

  if (ref) {
    const { width: w, height: h } = ref.info ?? {};
    if (m.referenceAspect && w && h && (w / h < m.referenceAspect.min || w / h > m.referenceAspect.max))
      throw new PlanError(`${m.name} takes reference images with aspect ${m.referenceAspect.min}-${m.referenceAspect.max}; ${ref.name} is ${(w / h).toFixed(2)}.`);
    let value = ref.ref;
    if (!/^https:\/\//.test(ref.ref)) {
      if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(ref.ref)) throw new PlanError(`${ref.name}: the reference must be an https URL or an image file.`);
      value = uploadPlaceholder(1, ref.name);
      uploads.push({ placeholder: value, media: ref });
    }
    task.inputs = { referenceImages: [value] };
  }

  const size = m.size;
  if (size.kind === "grid") {
    const [w, h] = [req.width ?? ref?.info?.width ?? size.default[0], req.height ?? ref?.info?.height ?? size.default[1]];
    const snap = (n: number) => Math.min(size.max, Math.max(size.min, Math.round(n / size.multipleOf) * size.multipleOf));
    const [sw, sh] = [snap(w), snap(h)];
    if (req.width !== undefined && (req.width !== sw || req.height !== sh))
      throw new PlanError(`${m.name} sizes are ${size.min}-${size.max} px in multiples of ${size.multipleOf}; got ${req.width}×${req.height}.`);
    if (sw !== w || sh !== h) notes.push(`Size snapped to ${sw}×${sh} (multiples of ${size.multipleOf}) from the reference's ${w}×${h}.`);
    task.width = sw;
    task.height = sh;
  } else if (ref) {
    // Schema: `resolution` only with a reference image, and never beside width/height.
    if (req.width !== undefined) throw new PlanError(`${m.name} with a reference takes --resolution (1K or 2K), not a width and height; the output follows the reference's aspect.`);
    const r = req.resolution ?? size.withReference.default;
    if (!size.withReference.values.includes(r)) throw new PlanError(`${m.name} resolutions: ${size.withReference.values.join(", ")}.`);
    task.resolution = r;
    notes.push(`${m.name} matches the reference's aspect ratio at ${r}.`);
  } else {
    if (req.resolution) throw new PlanError(`${m.name} takes --resolution only beside a reference image.`);
    const [w, h] = [req.width ?? size.default[0], req.height ?? size.default[1]];
    if (!size.pairs.some(([a, b]) => a === w && b === h))
      throw new PlanError(`${m.name} sizes: ${size.pairs.map(([a, b]) => `${a}×${b}`).join(", ")}.`);
    task.width = w;
    task.height = h;
  }

  Object.assign(task, { outputType: "URL", outputFormat: "PNG", numberResults: 1, deliveryMethod: "async", includeCost: true });
  return { modelId: m.air, modelName: m.name, uploads, task, estimate: m.estimate, notes };
}

/** Uploads the reference, submits, polls `imageURL`. Never resubmits. */
export async function runImage(client: RunwareClient, plan: ImagePlan, opts: Omit<PollOptions, "urlField"> = {}) {
  const ids = new Map<string, string>();
  for (const u of plan.uploads) ids.set(u.placeholder, (await client.upload(u.media.ref, opts.signal)).mediaUUID);
  const task = fillUploads(plan.task, ids);
  const { errors } = await client.post([task], opts.signal);
  const mine = errors.filter((e) => !e.taskUUID || e.taskUUID === task.taskUUID);
  if (mine.length) throw new Error(mine.map((e) => `${e.code}: ${e.message}`).join("; "));
  return { task, result: await pollImage(client, String(task.taskUUID), opts) };
}
