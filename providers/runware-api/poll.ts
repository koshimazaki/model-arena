/**
 * Async video results: poll `getResponse` by taskUUID with backoff until the
 * task succeeds or fails (docs: models-api/task-polling). Never resubmits;
 * sending the task again would start, and bill, a second generation.
 */
import { RunwareApiError, type RunwareClient } from "./client.ts";

export interface PollOptions {
  initialDelayMs?: number;
  intervalMs?: number;
  maxIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (status: string, progress?: number) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface VideoResult {
  taskUUID: string;
  videoURL: string;
  videoUUID?: string;
  cost: number | null;
  seed?: number;
  /** Present only if the API ever returns it; not in the published response schema. */
  model?: string;
}

/** Cost as a finite non-negative number, or null when absent or malformed. */
export function parseCost(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reads one response for our task: a result, a failure, or still running. */
export function readVideoRow(
  taskUUID: string,
  data: Record<string, unknown>[],
  errors: { code: string; message: string; taskUUID?: string }[],
): { state: "success"; result: VideoResult } | { state: "processing"; progress?: number } | { state: "error"; error: RunwareApiError } | { state: "absent" } {
  const failed = errors.filter((e) => e.taskUUID === taskUUID || !e.taskUUID);
  if (failed.length) return { state: "error", error: new RunwareApiError(200, failed) };
  const rows = data.filter((d) => d.taskUUID === taskUUID);
  const done = rows.find((r) => r.status === "success" || typeof r.videoURL === "string");
  if (done && typeof done.videoURL === "string")
    return {
      state: "success",
      result: {
        taskUUID,
        videoURL: done.videoURL,
        ...(typeof done.videoUUID === "string" ? { videoUUID: done.videoUUID } : {}),
        cost: parseCost(done.cost),
        ...(typeof done.seed === "number" ? { seed: done.seed } : {}),
        ...(typeof done.model === "string" ? { model: done.model } : {}),
      },
    };
  const bad = rows.find((r) => r.status === "error");
  if (bad) {
    const err = (bad.error ?? {}) as { code?: string; message?: string };
    return {
      state: "error",
      error: new RunwareApiError(200, [{ code: err.code ?? "error", message: err.message ?? "Task failed.", taskUUID }]),
    };
  }
  const running = rows.find((r) => r.status === "processing");
  if (running) return { state: "processing", progress: typeof running.progress === "number" ? running.progress : undefined };
  return { state: "absent" };
}

export async function pollVideo(client: RunwareClient, taskUUID: string, opts: PollOptions = {}): Promise<VideoResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const timeout = opts.timeoutMs ?? 45 * 60_000;
  const started = now();
  let interval = opts.intervalMs ?? 2000;
  const maxInterval = opts.maxIntervalMs ?? 15_000;
  await sleep(opts.initialDelayMs ?? 5000);
  for (;;) {
    if (opts.signal?.aborted) throw new Error(`Stopped polling. Resume with taskUUID ${taskUUID}.`);
    const { data, errors } = await client.post([{ taskType: "getResponse", taskUUID }], opts.signal);
    const row = readVideoRow(taskUUID, data, errors);
    if (row.state === "success") return row.result;
    if (row.state === "error") throw row.error;
    opts.onProgress?.(row.state, row.state === "processing" ? row.progress : undefined);
    if (now() - started > timeout)
      throw new Error(`Still running after ${Math.round(timeout / 60000)} min. Resume with taskUUID ${taskUUID}; do not resubmit.`);
    await sleep(interval);
    interval = Math.min(maxInterval, Math.round(interval * 1.5));
  }
}
