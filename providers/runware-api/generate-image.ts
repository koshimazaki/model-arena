/**
 * generateImage: one still through one image model, with the reader's own
 * key, for hosts that make character sheets and environment images and feed
 * them back as references. Mirrors generateFromGuide: the key by reference,
 * a refusal over `maxPrice` or without an estimate, `confirm` before anything
 * is sent, then upload, submit and poll. References are checked against the
 * model's count and size rules before upload and are never resized or dropped;
 * a reference the model cannot take is refused.
 */
import type { InputSent } from "../../packages/core/src/record.ts";
import { costRow, resolutionCell, type CostRow } from "../cost-row.ts";
import type { CostEstimate, LaneMedia } from "../types.ts";
import { RunwareClient, type FetchLike } from "./client.ts";
import { blobEntry, classify, GenerateError, type CostQuestion, type GenerateProgress } from "./generate.ts";
import { loadImage, typeOf } from "./guide-bundle.ts";
import { checkImagePrice, planImage, runImage, type ImagePlan, type StillFormat } from "./image.ts";
import type { PollOptions } from "./poll.ts";

/** A reference as a Blob (a File keeps its name), an https URL, or a Blob with the URL a reader can see it at. */
export type ImageReference = Blob | string | { blob: Blob; src?: string; name?: string };

export interface GenerateImageOptions {
  /** A key from imageModels(), e.g. "flux-3-image" or "seedream-5.5". */
  model: string;
  prompt: string;
  references?: ImageReference[];
  /** Width and height, or a resolution preset where the model has one. Default: the model's default, or sized from the first reference. */
  size?: { width: number; height: number } | { resolution: string };
  transparent?: boolean;
  outputFormat?: StillFormat;
  /** GPT-Image-2.6 `settings.quality`: auto (the default), low, medium, high, xhigh or max. `low` suits cheap drafts. */
  quality?: string;
  maxPrice: number;
  /**
   * Run a token-priced model that has no published upper bound. The cost
   * question then says so, shows the rates and Runware's examples, and
   * maxPrice is compared with the highest published example.
   */
  allowUnpriced?: boolean;
  key: string | (() => string | undefined) | { getKey(): string | undefined };
  confirm: (q: CostQuestion) => boolean | Promise<boolean>;
  signal?: AbortSignal;
  onProgress?: (p: GenerateProgress) => void;
  fetch?: FetchLike;
  poll?: Omit<PollOptions, "signal" | "onProgress" | "urlField">;
  /** Fixes the task UUID (tests). */
  taskUUID?: string;
}

export interface GenerateImageResult {
  imageURL: string;
  costUsd: number | null;
  taskUUID: string;
  modelRan: string;
  estimate: CostEstimate;
  inputsSent: InputSent[];
  notes: string[];
  generationSeconds: number;
  /** The docs/costs.md row for this run, as data and as the table line. */
  costRow: CostRow;
  costRowText: string;
  /** The task as sent, media ids filled in. */
  task: Record<string, unknown>;
}

const KEY_SHAPE = /^[\x21-\x7e]{16,512}$/;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

async function loadReference(r: ImageReference, i: number): Promise<LaneMedia> {
  const label = `reference ${i + 1}`;
  if (typeof r === "string") {
    if (!/^https:\/\//.test(r)) throw new GenerateError("refused", `The ${label} URL must start with https://.`);
    const name = decodeURIComponent(new URL(r).pathname.split("/").pop() || label);
    return { name, contentType: typeOf(name) ?? "image/*", ref: r, displaySrc: r };
  }
  const blob = r instanceof Blob ? r : r.blob;
  if (!(blob instanceof Blob)) throw new GenerateError("refused", `The ${label} must be an image Blob or an https URL.`);
  if (!EXT[blob.type]) throw new GenerateError("refused", `The ${label} must be PNG, JPEG or WebP; got ${blob.type || "an unknown type"}.`);
  const given = r instanceof Blob ? (r as File).name : (r.name ?? (r.blob as File).name);
  let name = (given || `reference-${i + 1}`).split(/[\\/]/).pop()!;
  if (typeOf(name) !== blob.type) name = `${name.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${EXT[blob.type]}`;
  const src = r instanceof Blob ? undefined : r.src;
  try {
    return await loadImage(blobEntry(blob, name), src && /^https?:\/\//.test(src) ? src : undefined);
  } catch (e) {
    throw new GenerateError("refused", `The ${label}: ${(e as Error).message}`);
  }
}

export async function generateImage(o: GenerateImageOptions): Promise<GenerateImageResult> {
  const k = o.key;
  const getKey = typeof k === "function" ? k : typeof k === "string" ? () => k : () => k.getKey();
  const client = new RunwareClient({ getKey, fetch: o.fetch });
  const redact = (s: string) => client.redact(s);
  const progress = (p: GenerateProgress) => o.onProgress?.(p);
  let submitted: string | undefined;
  try {
    if (!(typeof o.maxPrice === "number" && Number.isFinite(o.maxPrice) && o.maxPrice > 0 && o.maxPrice <= 100))
      throw new GenerateError("refused", "maxPrice must be a positive number of USD up to 100.");
    const key = getKey();
    if (!key || !KEY_SHAPE.test(key)) throw new GenerateError("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    progress({ stage: "plan", message: "checking the references" });
    const references = await Promise.all((o.references ?? []).map(loadReference));
    const size: { width?: number; height?: number; resolution?: string } = o.size ?? {};
    const plan: ImagePlan = planImage(
      {
        model: o.model,
        prompt: o.prompt,
        references,
        ...(size.resolution !== undefined ? { resolution: size.resolution } : {}),
        ...(size.width !== undefined || size.height !== undefined ? { width: size.width, height: size.height } : {}),
        ...(o.transparent ? { transparent: true } : {}),
        ...(o.outputFormat ? { outputFormat: o.outputFormat } : {}),
        ...(o.quality !== undefined ? { quality: o.quality } : {}),
      },
      o.taskUUID,
    );
    const price = checkImagePrice(plan, o.maxPrice, o.allowUnpriced === true);
    if (!price.ok) throw new GenerateError(price.code, price.message);
    progress({
      stage: "confirm",
      message: price.priced === "bound" ? `up to $${price.usd.toFixed(4)}` : price.priced === "estimate" ? `about $${price.usd.toFixed(4)} (estimate)` : `no published bound; highest example $${price.usd}`,
    });
    const ok = await o.confirm({
      model: plan.modelId,
      modelName: plan.modelName,
      usd: price.usd,
      basis: price.basis,
      maxPrice: o.maxPrice,
      inputs: plan.inputsSent,
      prompt: String(plan.task.positivePrompt),
      priced: price.priced,
      ...(price.rates ? { rates: price.rates, examples: price.examples } : {}),
    });
    if (!ok) throw new GenerateError("not-confirmed", "Not confirmed; nothing was sent.");
    if (o.signal?.aborted) throw new GenerateError("aborted", "Stopped. Nothing was submitted.");

    const started = Date.now();
    const { task, result } = await runImage(client, plan, {
      timeoutMs: 10 * 60_000,
      ...o.poll,
      signal: o.signal,
      onUpload: (name) => progress({ stage: "upload", message: `uploading ${name}` }),
      onSubmit: () => {
        // From the submit request on, the task may exist server-side.
        submitted = String(plan.task.taskUUID);
        progress({ stage: "submit", message: "submitting" });
      },
      onProgress: (status, p) => progress({ stage: "poll", message: status, progress: p }),
    });
    const generationSeconds = (Date.now() - started) / 1000;
    const row: CostRow = {
      date: new Date().toISOString().slice(0, 10),
      model: plan.modelId,
      modelRan: plan.modelId,
      taskUUID: result.taskUUID,
      duration: "-",
      resolution: resolutionCell(task),
      inputs: plan.inputsSent.length ? plan.inputsSent.map((i) => i.role).join("+") : "prompt",
      estimateUsd: plan.estimate.usd,
      costUsd: result.cost,
      seconds: generationSeconds,
      output: result.imageURL,
      status: "ok (browser)",
    };
    const notes = [...plan.notes];
    if (references.length) notes.push(`${references.length === 1 ? "The reference was" : `All ${references.length} references were`} sent as given: none resized or dropped.`);
    if (price.priced === "unpriced")
      notes.push(`Ran without a published bound (allowUnpriced): the cap was compared with the highest published example, $${price.usd}; the cost Runware reported is ${result.cost === null ? "missing" : `$${result.cost}`}.`);
    if (result.cost !== null && result.cost > o.maxPrice) notes.push(`Reported cost $${result.cost} is over the cap of $${o.maxPrice}.`);
    progress({ stage: "done", message: "done" });
    return {
      imageURL: result.imageURL,
      costUsd: result.cost,
      taskUUID: result.taskUUID,
      // A named model runs as asked; there is no router on this path.
      modelRan: plan.modelId,
      estimate: plan.estimate,
      inputsSent: plan.inputsSent,
      notes,
      generationSeconds,
      costRow: row,
      costRowText: costRow(row),
      task,
    };
  } catch (e) {
    throw classify(e, o.signal, submitted, redact);
  }
}
