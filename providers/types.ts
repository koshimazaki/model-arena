/**
 * The provider interface. A provider turns one lane request into a priced,
 * inspectable plan, then runs it. Runware is the first adapter; others plug
 * in behind the same shape.
 */
import type { FirstFrameVariant, InputSent, Lane } from "../packages/core/src/record.ts";

/** One piece of media a lane may send. */
export interface LaneMedia {
  /** Short name for captions and logs, such as the file name. */
  name: string;
  contentType: string;
  /**
   * How the provider can read it: an https URL, a data URI (uploaded before
   * the run), or a media id the provider already holds.
   */
  ref: string;
  /** Where a reader of the record can see it (local path or URL). */
  displaySrc?: string;
  info?: { width?: number; height?: number; seconds?: number; fps?: number | null; bytes?: number };
}

export interface LaneRequest {
  /** A model key from the provider's catalogue, its full id, or `auto`. */
  model: string;
  prompt: string;
  guideVideo?: LaneMedia;
  firstFrame?: LaneMedia;
  firstFrameVariant?: FirstFrameVariant;
  /** A character still: a reference image beside the guide (never a frame image). */
  character?: LaneMedia;
  /** An environment still: a reference image after the character. */
  environment?: LaneMedia;
  audio?: LaneMedia;
  keyframes?: { media: LaneMedia; frame: number | "first" | "last" }[];
  duration?: number | "auto";
  resolution?: string;
  /** Camera movement, only where the model's schema declares one. */
  camera?: string;
  routing?: { maxPrice: number; requirements?: string; preferences?: { quality?: number; speed?: number; cost?: number } };
}

export interface CostEstimate {
  /** Upper bound in USD for what this plan should cost, or null if unknown. */
  usd: number | null;
  basis: string;
}

export interface LanePlan {
  provider: string;
  modelId: string;
  modelName: string;
  /** The media that must be uploaded before the task can be sent, keyed by placeholder. */
  uploads: { placeholder: string; media: LaneMedia }[];
  /** The task exactly as it will be sent, with upload placeholders in place of media ids. */
  task: Record<string, unknown>;
  inputsSent: InputSent[];
  firstFrameVariant: FirstFrameVariant;
  estimate: CostEstimate;
  notes: string[];
}

export interface RunProgress {
  stage: "upload" | "submit" | "poll" | "done";
  message: string;
  progress?: number;
}

export interface LaneResult {
  taskUUID: string;
  videoURL: string;
  costUsd: number | null;
  generationSeconds: number;
  modelRan: string | null;
  /** The task as finally sent, media ids filled in. */
  task: Record<string, unknown>;
}

export interface Provider {
  id: string;
  plan(req: LaneRequest): LanePlan;
  run(plan: LanePlan, opts?: { onProgress?: (p: RunProgress) => void; signal?: AbortSignal }): Promise<LaneResult>;
}

/** A plan plus its result, as the lane of a record. */
export function laneFromRun(
  id: string,
  plan: LanePlan,
  req: LaneRequest,
  result: LaneResult | null,
  outputSrc: string | null,
): Lane {
  const { inputs: _inputs, taskUUID: _uuid, positivePrompt: _p, ...settings } = (result?.task ??
    plan.task) as Record<string, unknown>;
  return {
    id,
    label: plan.modelName,
    provider: plan.provider,
    model: plan.modelId,
    modelName: plan.modelName,
    modelRan: result?.modelRan ?? null,
    prompt: req.prompt,
    inputsSent: plan.inputsSent,
    firstFrameVariant: plan.firstFrameVariant,
    output: outputSrc ? { src: outputSrc, contentType: "video/mp4", remoteUrl: result?.videoURL } : null,
    costUsd: result?.costUsd ?? null,
    generationSeconds: result ? Math.round(result.generationSeconds * 10) / 10 : null,
    ...(req.duration !== undefined ? { durationSeconds: req.duration } : {}),
    ...(result ? { taskUUID: result.taskUUID } : {}),
    ...(req.routing ? { routing: { maxPrice: req.routing.maxPrice, requirements: req.routing.requirements } } : {}),
    settings,
    status: result ? "ready" : "pending",
  };
}
