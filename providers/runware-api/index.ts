/**
 * The Runware API provider: plan a lane (pure), then run it — upload local
 * media through `mediaStorage`, submit the task, poll, and report cost,
 * seconds and the model that ran.
 */
import type { LanePlan, LaneRequest, LaneResult, Provider, RunProgress } from "../types.ts";
import { RunwareApiError, RunwareClient, type FetchLike } from "./client.ts";
import { pollVideo, type PollOptions } from "./poll.ts";
import { fillUploads, planTask } from "./task.ts";

export { MODELS, findModel } from "./models.ts";
export { planTask, estimateCost, PlanError } from "./task.ts";
export { RunwareClient, RUNWARE_ENDPOINT } from "./client.ts";
export { pollVideo, parseCost } from "./poll.ts";

export interface RunwareProviderOptions {
  getKey: () => string | undefined;
  fetch?: FetchLike;
  poll?: Omit<PollOptions, "signal" | "onProgress">;
}

/** Which model ran. Named models ran as asked; the router's choice is read back. */
async function modelRan(client: RunwareClient, plan: LanePlan, taskUUID: string, fromResult?: string, signal?: AbortSignal) {
  if (fromResult && fromResult !== "auto") return fromResult;
  if (plan.modelId !== "auto") return plan.modelId;
  try {
    const details = await client.taskDetails(taskUUID, signal);
    const request = Array.isArray(details?.request) ? (details.request as Record<string, unknown>[]) : [];
    const model = request.find((r) => r.taskUUID === taskUUID)?.model ?? request[0]?.model;
    return typeof model === "string" && model !== "auto" ? model : null;
  } catch {
    return null;
  }
}

export function runwareProvider(opts: RunwareProviderOptions): Provider & {
  client: RunwareClient;
  resume(plan: LanePlan, taskUUID: string, o?: { onProgress?: (p: RunProgress) => void; signal?: AbortSignal }): Promise<LaneResult>;
} {
  const client = new RunwareClient({ getKey: opts.getKey, fetch: opts.fetch });

  async function finish(plan: LanePlan, task: Record<string, unknown>, started: number, o: { onProgress?: (p: RunProgress) => void; signal?: AbortSignal }) {
    const taskUUID = String(task.taskUUID);
    const result = await pollVideo(client, taskUUID, {
      ...opts.poll,
      signal: o.signal,
      onProgress: (status, progress) => o.onProgress?.({ stage: "poll", message: status, progress }),
    });
    const ran = await modelRan(client, plan, taskUUID, result.model, o.signal);
    o.onProgress?.({ stage: "done", message: "done" });
    return {
      taskUUID,
      videoURL: result.videoURL,
      costUsd: result.cost,
      generationSeconds: (Date.now() - started) / 1000,
      modelRan: ran,
      task,
    } satisfies LaneResult;
  }

  return {
    id: "runware-api",
    client,
    plan: (req: LaneRequest) => planTask(req),
    async run(plan, o = {}) {
      const started = Date.now();
      const ids = new Map<string, string>();
      for (const u of plan.uploads) {
        o.onProgress?.({ stage: "upload", message: `uploading ${u.media.name}` });
        const { mediaUUID } = await client.upload(u.media.ref, o.signal);
        ids.set(u.placeholder, mediaUUID);
      }
      const task = fillUploads(plan.task, ids);
      o.onProgress?.({ stage: "submit", message: "submitting" });
      const { errors } = await client.post([task], o.signal);
      const mine = errors.filter((e) => !e.taskUUID || e.taskUUID === task.taskUUID);
      if (mine.length) throw new RunwareApiError(400, mine);
      return finish(plan, task, started, o);
    },
    /** Polls an already-submitted task without sending it again. */
    resume(plan, taskUUID, o = {}) {
      return finish(plan, { ...plan.task, taskUUID }, Date.now(), o);
    },
  };
}
