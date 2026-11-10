import type { LaneMedia } from "../providers/types.ts";

/** Media fakes with the facts the planner checks; refs are tiny data URIs. */
export const guide720: LaneMedia = {
  name: "guide-1280x720.mp4",
  contentType: "video/mp4",
  ref: "data:video/mp4;base64,AAAA",
  displaySrc: "inputs/guide-1280x720.mp4",
  info: { width: 1280, height: 720, seconds: 8.04, fps: 24, bytes: 1_500_000 },
};
export const guide576: LaneMedia = { ...guide720, name: "guide-1024x576.mp4", info: { ...guide720.info, width: 1024, height: 576 } };
export const frame: LaneMedia = {
  name: "first-frame.png",
  contentType: "image/png",
  ref: "data:image/png;base64,iVBORw0KGgo=",
  displaySrc: "inputs/first-frame.png",
  info: { width: 1280, height: 720 },
};
export const audio: LaneMedia = {
  name: "guide-audio.wav",
  contentType: "audio/wav",
  ref: "data:audio/wav;base64,UklGRg==",
  info: { seconds: 8 },
};
export const FIXED_UUID = "00000000-0000-4000-8000-000000000001";

/** A fake fetch that answers from a queue and records what was sent. */
export function fakeFetch(responses: ((body: unknown[]) => unknown)[]) {
  const calls: { url: string; headers: Record<string, string>; body: unknown[] }[] = [];
  const fn = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as unknown[];
    calls.push({ url, headers: init.headers, body });
    const next = responses.shift();
    if (!next) throw new Error("fake fetch: no response queued");
    const json = next(body);
    return { ok: true, status: 200, json: async () => json };
  };
  return { fn, calls };
}
