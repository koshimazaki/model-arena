/**
 * generateFromGuide: a guide bundle through one model, with the reader's own
 * key. Loads the bundle, plans the lane with `planGuideLane` (the composer's
 * prompt, the per-model fitting), refuses a price over `maxPrice`, asks
 * `confirm` with the estimate, then uploads through `mediaStorage`, submits,
 * polls and resolves with the lane of a record. Every request goes through
 * RunwareClient, which talks to api.runware.ai only; the key is never put in
 * an error, an event, a log line or the record.
 */
import type { ArenaRecord, InputSent, Lane } from "../../packages/core/src/record.ts";
import { costRow, resolutionCell, type CostRow } from "../cost-row.ts";
import { laneFromRun, type CostEstimate, type LaneResult } from "../types.ts";
import { RunwareApiError, type FetchLike } from "./client.ts";
import { GuideError, loadGuideBundle, loadImage, typeOf, type BundleEntry, type GuideShot, type LoadedGuide } from "./guide-bundle.ts";
import { planGuideLane, type GuideLanePlan } from "./guide-plan.ts";
import { runwareProvider } from "./index.ts";
import type { PollOptions } from "./poll.ts";
import { PlanError } from "./task.ts";

export type GenerateErrorCode =
  | "bad-bundle"
  | "refused"
  | "over-price"
  | "no-estimate"
  | "not-confirmed"
  | "invalid-key"
  | "timeout"
  | "aborted"
  | "provider";

export class GenerateError extends Error {
  constructor(public code: GenerateErrorCode, message: string, public taskUUID?: string) {
    super(message);
    this.name = "GenerateError";
  }
}

/** A bundle as a FileList or File[] (a folder pick or a drop), name → Blob, or one already loaded. */
export type GuideSource = Iterable<Blob & { name?: string }> | ArrayLike<File> | Record<string, Blob> | LoadedGuide;

/** A reference image as a Blob, or with the URL a record reader can see it at. */
export type ReferenceInput = Blob | { blob: Blob; src?: string; name?: string };

export interface CostQuestion {
  model: string;
  modelName: string;
  usd: number;
  basis: string;
  maxPrice: number;
  inputs: InputSent[];
  prompt: string;
  /**
   * Images only. "bound": `usd` is an upper bound. "estimate": `usd` is an
   * estimate from approximate published token counts plus a stated margin
   * (MiniMax H3 Image), checked against the cap but not a strict bound.
   * "unpriced": a token-priced model with no published figures, run with
   * allowUnpriced; `usd` is then the highest published example, not a bound,
   * and `rates` and `examples` say so.
   */
  priced?: "bound" | "estimate" | "unpriced";
  rates?: string;
  examples?: string;
}

export interface GenerateProgress {
  stage: "plan" | "confirm" | "upload" | "submit" | "poll" | "done";
  message: string;
  progress?: number;
}

export interface GenerateOptions {
  guide: GuideSource;
  /** kling-4, seedance-2.5, h3 or ltx-2.5. */
  model: string;
  /** The neutral shot; defaults to the bundle's recipe.json `shot`. */
  shot?: GuideShot;
  /** Free text that replaces the composed prompt. */
  prompt?: string;
  /** Optional reference images: a character sheet and an environment still. */
  references?: { character?: ReferenceInput; environment?: ReferenceInput };
  /** USD; a plan estimated above it is refused before anything is sent. */
  maxPrice: number;
  /**
   * The key by reference: the key panel itself (anything with getKey()), a
   * getter, or a string. Read only when a request is sent.
   */
  key: string | (() => string | undefined) | { getKey(): string | undefined };
  /** Shown the estimate; nothing is uploaded or submitted unless it resolves true. */
  confirm: (q: CostQuestion) => boolean | Promise<boolean>;
  signal?: AbortSignal;
  onProgress?: (p: GenerateProgress) => void;
  /** For tests and the fake provider; defaults to the page's fetch. */
  fetch?: FetchLike;
  poll?: Omit<PollOptions, "signal" | "onProgress" | "urlField">;
  resolution?: string;
  /** Refuse instead of sending the guide without its separate audio (MiniMax H3 over 15 s together). */
  requireAudio?: boolean;
  laneId?: string;
  /** Fixes the task UUID (tests). */
  taskUUID?: string;
}

export interface GenerateResult {
  videoURL: string;
  costUsd: number | null;
  generationSeconds: number;
  taskUUID: string;
  modelRan: string | null;
  estimate: CostEstimate;
  inputsSent: InputSent[];
  /** The lane, with the composed prompt, inputs sent and shot. */
  lane: Lane;
  /** A one-lane record (guide media named relative to it: ./guide.mp4) for the gallery. */
  record: ArenaRecord;
  /** The docs/costs.md row for this run, as data and as the table line. */
  costRow: CostRow;
  costRowText: string;
  notes: string[];
  /** The task as sent, media ids filled in. */
  task: Record<string, unknown>;
}

const KEY_SHAPE = /^[\x21-\x7e]{16,512}$/;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const isLoaded = (g: GuideSource): g is LoadedGuide => typeof g === "object" && g !== null && "manifest" in g && "video" in g;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX = 30 * 1048576;

/** A reference image checked for type and size, then loaded for upload. */
export async function reference(r: ReferenceInput | undefined, role: "character" | "environment") {
  if (!r) return undefined;
  const blob = r instanceof Blob ? r : r.blob;
  if (!(blob instanceof Blob)) throw new GenerateError("refused", `The ${role} reference must be an image Blob.`);
  if (!IMAGE_TYPES.includes(blob.type)) throw new GenerateError("refused", `The ${role} image must be PNG, JPEG or WebP; got ${blob.type || "an unknown type"}.`);
  if (blob.size > IMAGE_MAX) throw new GenerateError("refused", `The ${role} image is over 30 MB.`);
  const given = r instanceof Blob ? (r as File).name : (r.name ?? (r.blob as File).name);
  let name = (given || role).split(/[\\/]/).pop()!;
  // The file name decides the content type sent; make it agree with the Blob's type.
  if (typeOf(name) !== blob.type) name = `${name.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${EXT[blob.type]}`;
  const src = r instanceof Blob ? undefined : r.src;
  try {
    return await loadImage(blobEntry(blob, name), src && /^https?:\/\//.test(src) ? src : undefined);
  } catch (e) {
    throw new GenerateError("refused", `The ${role} image: ${(e as Error).message}`);
  }
}

export function blobEntry(blob: Blob, name: string): BundleEntry {
  return { name, size: blob.size, bytes: async () => new Uint8Array(await blob.arrayBuffer()) };
}

/** Entries from a FileList, File[] or a name → Blob map. */
export function entriesOf(src: Exclude<GuideSource, LoadedGuide>): BundleEntry[] {
  const list: (Blob & { name?: string })[] =
    typeof (src as Iterable<Blob>)[Symbol.iterator] === "function" || "length" in src
      ? Array.from(src as ArrayLike<File>)
      : [];
  if (list.length) return list.map((f, i) => blobEntry(f, f.name ?? `file-${i}`));
  return Object.entries(src as Record<string, Blob>).map(([name, b]) => blobEntry(b, name));
}

export function classify(e: unknown, signal: AbortSignal | undefined, submitted: string | undefined, redact: (s: string) => string): GenerateError {
  if (e instanceof GenerateError) return e;
  const msg = redact((e as Error)?.message ?? String(e));
  const after = submitted ? ` The task was already submitted and may still finish and be billed (taskUUID ${submitted}); do not resubmit.` : " Nothing was submitted.";
  if (signal?.aborted || (e as Error)?.name === "AbortError" || msg.startsWith("Stopped polling")) return new GenerateError("aborted", `Stopped.${after}`, submitted);
  if (msg.startsWith("Still running after")) return new GenerateError("timeout", msg, submitted);
  if (e instanceof GuideError) return new GenerateError("bad-bundle", msg);
  if (e instanceof PlanError) return new GenerateError("refused", msg);
  const authCode = e instanceof RunwareApiError && (e.status === 401 || e.status === 403 || e.errors.some((x) => /key|auth/i.test(x.code)));
  if (authCode || /No Runware API key|does not look like a Runware API key/.test(msg))
    return new GenerateError("invalid-key", "The key was refused. Check it in the key panel; it is sent only to api.runware.ai.");
  return new GenerateError("provider", msg, submitted);
}

export async function generateFromGuide(o: GenerateOptions): Promise<GenerateResult> {
  const k = o.key;
  const getKey = typeof k === "function" ? k : typeof k === "string" ? () => k : () => k.getKey();
  const provider = runwareProvider({
    getKey,
    fetch: o.fetch,
    poll: { timeoutMs: 20 * 60_000, ...o.poll },
  });
  const redact = (s: string) => provider.client.redact(s);
  const progress = (p: GenerateProgress) => o.onProgress?.(p);
  let submitted: string | undefined;
  try {
    if (!(typeof o.maxPrice === "number" && Number.isFinite(o.maxPrice) && o.maxPrice > 0 && o.maxPrice <= 100))
      throw new GenerateError("refused", "maxPrice must be a positive number of USD up to 100.");
    const key = getKey();
    if (!key || !KEY_SHAPE.test(key)) throw new GenerateError("invalid-key", "Connect a Runware API key first (16-512 characters, no spaces).");
    progress({ stage: "plan", message: "reading the guide" });
    const guide = isLoaded(o.guide) ? o.guide : await loadGuideBundle(entriesOf(o.guide));
    const character = await reference(o.references?.character, "character");
    const environment = await reference(o.references?.environment, "environment");
    const lane: GuideLanePlan = planGuideLane({ guide, model: o.model, shot: o.shot, prompt: o.prompt, character, environment, resolution: o.resolution, requireAudio: o.requireAudio }, o.taskUUID);
    const { plan } = lane;
    if (plan.estimate.usd === null) throw new GenerateError("no-estimate", `No price estimate for ${plan.modelName}; it cannot be checked against maxPrice.`);
    if (plan.estimate.usd > o.maxPrice)
      throw new GenerateError("over-price", `Estimated $${plan.estimate.usd.toFixed(2)} (${plan.estimate.basis}) is over your cap of $${o.maxPrice.toFixed(2)}.`);
    progress({ stage: "confirm", message: `estimated $${plan.estimate.usd.toFixed(2)}` });
    const ok = await o.confirm({
      model: plan.modelId,
      modelName: plan.modelName,
      usd: plan.estimate.usd,
      basis: plan.estimate.basis,
      maxPrice: o.maxPrice,
      inputs: plan.inputsSent,
      prompt: lane.request.prompt,
    });
    if (!ok) throw new GenerateError("not-confirmed", "Not confirmed; nothing was sent.");
    if (o.signal?.aborted) throw new GenerateError("aborted", "Stopped. Nothing was submitted.");

    const result: LaneResult = await provider.run(plan, {
      signal: o.signal,
      onProgress: (p) => {
        // From the submit request on, the task may exist server-side: warn rather than claim nothing was sent.
        if (p.stage === "submit" || p.stage === "poll") submitted = String(plan.task.taskUUID);
        progress(p);
      },
    });
    const out = laneFromRun(o.laneId ?? "lane-1", plan, lane.request, result, result.videoURL);
    if (lane.marker) {
      out.composed = lane.marker;
      out.shot = lane.shot;
    }
    const date = new Date().toISOString();
    const record: ArenaRecord = {
      schemaVersion: 1,
      id: `gen-${result.taskUUID.slice(0, 8).toLowerCase()}`,
      title: `${plan.modelName}: ${(lane.shot.subject || lane.request.prompt).slice(0, 80)}`,
      createdAt: date,
      guide: guide.guide,
      lanes: [out],
      ...(lane.marker ? { shot: lane.shot } : {}),
    };
    const row: CostRow = {
      date: date.slice(0, 10),
      model: plan.modelId,
      modelRan: result.modelRan,
      taskUUID: result.taskUUID,
      duration: String(lane.request.duration ?? "audio length"),
      resolution: resolutionCell(plan.task),
      inputs: plan.inputsSent.map((i) => i.role).join("+"),
      estimateUsd: plan.estimate.usd,
      costUsd: result.costUsd,
      seconds: result.generationSeconds,
      output: result.videoURL,
      status: "ok (browser)",
    };
    const notes = [...lane.notes];
    if (result.costUsd !== null && result.costUsd > o.maxPrice) notes.push(`Reported cost $${result.costUsd} is over the cap of $${o.maxPrice}.`);
    progress({ stage: "done", message: "done" });
    return {
      videoURL: result.videoURL,
      costUsd: result.costUsd,
      generationSeconds: result.generationSeconds,
      taskUUID: result.taskUUID,
      modelRan: result.modelRan,
      estimate: plan.estimate,
      inputsSent: plan.inputsSent,
      lane: out,
      record,
      costRow: row,
      costRowText: costRow(row),
      notes,
      task: result.task,
    };
  } catch (e) {
    throw classify(e, o.signal, submitted, redact);
  }
}
