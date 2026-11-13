/** A Beat Path-style guide bundle in memory, and a fake Runware API that answers by task type. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GuideShot } from "../providers/runware-api/guide-bundle.ts";

export const FAKE_KEY = "fake-key-0123456789abcdef-NOT-REAL";
export const SHOT: GuideShot = {
  subject: "A courier in a yellow raincoat",
  environment: "a rain-soaked city crossing at dusk",
  action: "runs along the drawn path and leaps the puddle on the beat",
  legend: "The orange figure is the character",
};

const png = readFileSync(join(process.cwd(), "tests/fixtures/tiny-320x180.png"));

export interface BundleOpts {
  seconds?: number;
  width?: number;
  height?: number;
  audio?: boolean;
  shot?: GuideShot | null;
  /** meta.audioInVideo: the guide video carries its own sound. */
  audioInVideo?: boolean;
}

/** The six files Beat Path exports (plus recipe.json with a shot), as name → Blob. */
export function makeBundle(o: BundleOpts = {}): Record<string, Blob> {
  const seconds = o.seconds ?? 5;
  const width = o.width ?? 1280;
  const height = o.height ?? 720;
  const audio = o.audio ?? true;
  const j = (v: unknown) => new Blob([JSON.stringify(v)], { type: "application/json" });
  const files: Record<string, Blob> = {
    "bundle.json": j({
      schemaVersion: "0.5.0",
      video: "guide.mp4",
      firstFrame: "frame0.png",
      beats: "beats.json",
      recipe: "recipe.json",
      meta: "meta.json",
      ...(audio ? { audio: "audio.wav" } : {}),
    }),
    "meta.json": j({
      schemaVersion: "0.5.0",
      width,
      height,
      fps: 24,
      frames: seconds * 24,
      durationSeconds: seconds,
      view: "top",
      character: { kind: "glider", name: "Path glider" },
      generator: { name: "beat-path", version: "0.1.0", motion: "path" },
      audioInVideo: o.audioInVideo ?? false,
      assets: [{ role: "video", name: "Rendered guide", licence: "MIT", file: "guide.mp4" }],
    }),
    "beats.json": j({ bpm: 120, offsetSeconds: 0, beatsPerBar: 4, source: "analysis", beats: [0, 0.5, 1, 1.5], downbeats: [0] }),
    "guide.mp4": new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], { type: "video/mp4" }),
    "frame0.png": new Blob([png], { type: "image/png" }),
    ...(audio ? { "audio.wav": new Blob([new Uint8Array([82, 73, 70, 70])], { type: "audio/wav" }) } : {}),
  };
  if (o.shot !== null) files["recipe.json"] = j({ tool: "beat-path", shot: o.shot ?? SHOT });
  return files;
}

/** A PNG header that says width × height; only the header is read before upload. */
export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

export const characterPng = (w = 768, h = 1024) => new File([pngHeader(w, h)], "character-sheet.png", { type: "image/png" });

export interface FakeRunware {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  calls: { url: string; headers: Record<string, string>; tasks: Record<string, unknown>[] }[];
  tasks(type: string): Record<string, unknown>[];
}

/**
 * Answers mediaStorage with a UUID, videoInference with an ack, and getResponse
 * with "processing" `processing` times and then success.
 */
export function fakeRunware(o: { processing?: number; status?: number; cost?: number; videoURL?: string; errorCode?: string } = {}): FakeRunware {
  const calls: FakeRunware["calls"] = [];
  let polls = 0;
  let uploads = 0;
  const fetch: FakeRunware["fetch"] = async (url, init) => {
    if (init.signal?.aborted) throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    const tasks = JSON.parse(init.body) as Record<string, unknown>[];
    calls.push({ url, headers: init.headers, tasks });
    if (o.status && o.status !== 200)
      return { ok: false, status: o.status, json: async () => ({ errors: [{ code: o.errorCode ?? "invalidApiKey", message: "Invalid API key." }] }) };
    const data = tasks.map((t) => {
      if (t.taskType === "mediaStorage") return { taskType: "mediaStorage", taskUUID: t.taskUUID, mediaUUID: `00000000-0000-4000-8000-${String(++uploads).padStart(12, "0")}`, mediaURL: "https://im.runware.ai/x" };
      if (t.taskType === "videoInference") return { taskType: "videoInference", taskUUID: t.taskUUID };
      if (t.taskType === "getResponse") {
        polls++;
        if (o.processing === -1 || polls <= (o.processing ?? 1)) return { taskUUID: t.taskUUID, status: "processing", progress: 50 };
        return { taskType: "videoInference", taskUUID: t.taskUUID, status: "success", videoURL: o.videoURL ?? "https://vm.runware.ai/video/out.mp4", cost: o.cost ?? 0.94 };
      }
      return { taskUUID: t.taskUUID };
    });
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  return { fetch, calls, tasks: (type) => calls.flatMap((c) => c.tasks).filter((t) => t.taskType === type) };
}

export const fastPoll = { initialDelayMs: 0, intervalMs: 0, sleep: async () => {} };
