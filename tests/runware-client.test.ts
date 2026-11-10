import { describe, expect, it } from "vitest";
import { RunwareClient, RUNWARE_ENDPOINT } from "../providers/runware-api/client.ts";
import { runwareProvider } from "../providers/runware-api/index.ts";
import { parseCost, pollVideo, readVideoRow } from "../providers/runware-api/poll.ts";
import { KeyStore } from "../providers/runware-api/key.ts";
import { planTask } from "../providers/runware-api/task.ts";
import { fakeFetch, FIXED_UUID, frame, guide720 } from "./helpers.ts";

const KEY = "test-key-not-real-0123456789";
const noSleep = { sleep: async () => {}, initialDelayMs: 0 };

describe("cost parsing", () => {
  it("accepts numbers and numeric strings, refuses the rest", () => {
    expect(parseCost(0.94)).toBe(0.94);
    expect(parseCost("1.2")).toBe(1.2);
    expect(parseCost(undefined)).toBeNull();
    expect(parseCost(-1)).toBeNull();
    expect(parseCost("free")).toBeNull();
  });
});

describe("polling", () => {
  it("polls getResponse until success and returns url and cost", async () => {
    const { fn, calls } = fakeFetch([
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID, status: "processing", progress: 10 }] }),
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID, status: "processing", progress: 60 }] }),
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID, status: "success", videoUUID: FIXED_UUID, videoURL: "https://vm.runware.ai/v.mp4", cost: 0.94 }] }),
    ]);
    const client = new RunwareClient({ getKey: () => KEY, fetch: fn });
    const seen: (number | undefined)[] = [];
    const r = await pollVideo(client, FIXED_UUID, { ...noSleep, onProgress: (_s, p) => seen.push(p) });
    expect(r).toMatchObject({ videoURL: "https://vm.runware.ai/v.mp4", cost: 0.94 });
    expect(seen).toEqual([10, 60]);
    expect(calls.every((c) => (c.body[0] as { taskType: string }).taskType === "getResponse")).toBe(true);
  });

  it("surfaces an error row for the task", async () => {
    const { fn } = fakeFetch([
      () => ({ data: [], errors: [{ code: "timeoutProvider", message: "Provider timed out.", taskUUID: FIXED_UUID }] }),
    ]);
    const client = new RunwareClient({ getKey: () => KEY, fetch: fn });
    await expect(pollVideo(client, FIXED_UUID, noSleep)).rejects.toThrow(/timeoutProvider/);
  });

  it("gives up after the timeout and says not to resubmit", async () => {
    let t = 0;
    const { fn } = fakeFetch(Array.from({ length: 10 }, () => () => ({ data: [{ taskUUID: FIXED_UUID, status: "processing" }] })));
    const client = new RunwareClient({ getKey: () => KEY, fetch: fn });
    await expect(pollVideo(client, FIXED_UUID, { ...noSleep, timeoutMs: 1000, now: () => (t += 400) })).rejects.toThrow(/do not resubmit/);
  });

  it("ignores rows for other tasks", () => {
    expect(readVideoRow(FIXED_UUID, [{ taskUUID: "other", status: "success", videoURL: "https://x" }], []).state).toBe("absent");
  });
});

describe("full run against a fake API", () => {
  it("uploads, submits with media ids, polls, and never sends the key elsewhere", async () => {
    const plan = planTask({ model: "kling-4", prompt: "Follow <<<video_1>>>.", guideVideo: guide720, firstFrame: frame, duration: 5 }, FIXED_UUID);
    let n = 0;
    const { fn, calls } = fakeFetch([
      (b) => ({ data: [{ taskType: "mediaStorage", taskUUID: (b[0] as { taskUUID: string }).taskUUID, mediaUUID: `11111111-1111-4111-8111-00000000000${++n}`, mediaURL: "https://mm.runware.ai/x" }] }),
      (b) => ({ data: [{ taskType: "mediaStorage", taskUUID: (b[0] as { taskUUID: string }).taskUUID, mediaUUID: `11111111-1111-4111-8111-00000000000${++n}`, mediaURL: "https://mm.runware.ai/y" }] }),
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID }] }),
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID, status: "success", videoURL: "https://vm.runware.ai/out.mp4", cost: 0.94 }] }),
    ]);
    const provider = runwareProvider({ getKey: () => KEY, fetch: fn, poll: noSleep });
    const result = await provider.run(plan);
    expect(calls.map((c) => c.url)).toEqual(Array(4).fill(RUNWARE_ENDPOINT));
    expect(calls.every((c) => c.headers.Authorization === `Bearer ${KEY}`)).toBe(true);
    const submitted = calls[2]!.body[0] as { inputs: { referenceVideos: string[]; frameImages: { image: string }[] } };
    expect(submitted.inputs.frameImages[0]!.image).toBe("11111111-1111-4111-8111-000000000001");
    expect(submitted.inputs.referenceVideos[0]).toBe("11111111-1111-4111-8111-000000000002");
    expect(result).toMatchObject({ costUsd: 0.94, modelRan: "klingai:kling-video@4.0", videoURL: "https://vm.runware.ai/out.mp4" });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("router lane reads the chosen model back from getTaskDetails", async () => {
    const plan = planTask({ model: "auto", prompt: "x", guideVideo: { ...guide720, ref: "https://example.com/g.mp4" }, duration: 5, routing: { maxPrice: 1 } }, FIXED_UUID);
    const { fn } = fakeFetch([
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID }] }),
      () => ({ data: [{ taskType: "videoInference", taskUUID: FIXED_UUID, status: "success", videoURL: "https://vm.runware.ai/o.mp4", cost: 0.5 }] }),
      () => ({ data: [{ taskType: "getTaskDetails", taskUUID: FIXED_UUID, request: [{ taskUUID: FIXED_UUID, model: "minimax:h3@0" }] }] }),
    ]);
    const result = await runwareProvider({ getKey: () => KEY, fetch: fn, poll: noSleep }).run(plan);
    expect(result.modelRan).toBe("minimax:h3@0");
  });

  it("a submit-time validation error is thrown, and the key is redacted from messages", async () => {
    const plan = planTask({ model: "kling-4", prompt: "x", guideVideo: { ...guide720, ref: "https://example.com/g.mp4" }, duration: 5 }, FIXED_UUID);
    const { fn } = fakeFetch([() => ({ errors: [{ code: "invalidParameter", message: `bad key ${KEY}`, taskUUID: FIXED_UUID }] })]);
    const err = await runwareProvider({ getKey: () => KEY, fetch: fn, poll: noSleep }).run(plan).catch((e: Error) => e);
    expect(String(err)).toMatch(/invalidParameter/);
    expect(String(err)).not.toContain(KEY);
  });

  it("refuses to post without a key", async () => {
    const client = new RunwareClient({ getKey: () => undefined, fetch: fakeFetch([]).fn });
    await expect(client.post([])).rejects.toThrow(/No Runware API key/);
  });
});

describe("browser key store", () => {
  it("keeps the key in memory unless session is asked for; never localStorage", () => {
    const bag = new Map<string, string>();
    const storage = { getItem: (k: string) => bag.get(k) ?? null, setItem: (k: string, v: string) => void bag.set(k, v), removeItem: (k: string) => void bag.delete(k) };
    const store = new KeyStore(storage);
    store.set(KEY);
    expect(store.get()).toBe(KEY);
    expect(bag.size).toBe(0);
    store.set(KEY, "session");
    expect(new KeyStore(storage).get()).toBe(KEY);
    store.clear();
    expect(bag.size).toBe(0);
  });
});
