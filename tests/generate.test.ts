import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRecord } from "../packages/core/src/record.ts";
import { entriesOf, generateFromGuide, GenerateError, type GenerateOptions } from "../providers/runware-api/generate.ts";
import { loadGuideBundle } from "../providers/runware-api/guide-bundle.ts";
import { comparePrompts, guideModels, planGuideLane, previewPrompt } from "../providers/runware-api/guide-plan.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll, makeBundle, SHOT } from "./embed-helpers.ts";

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema(read("packages/core/schema/guide-bundle.schema.json"));
const validateRecord = ajv.compile(read("packages/core/schema/record.schema.json"));

const load = (o?: Parameters<typeof makeBundle>[0]) => loadGuideBundle(entriesOf(makeBundle(o)));
const facts = { seconds: 5, hasAudio: true, hasCharacter: true };

function opts(over: Partial<GenerateOptions> = {}) {
  const api = fakeRunware();
  const o: GenerateOptions = {
    guide: makeBundle(),
    model: "kling-4",
    maxPrice: 2,
    key: FAKE_KEY,
    confirm: () => true,
    fetch: api.fetch,
    poll: fastPoll,
    ...over,
  };
  return { o, api };
}

afterEach(() => vi.restoreAllMocks());

describe("guide models and composed prompts", () => {
  it("offers Kling 4.0, Seedance 2.5, MiniMax H3, then LTX-2.5 marked audio + first frame only", () => {
    const m = guideModels();
    expect(m.map((x) => x.key)).toEqual(["kling-4", "seedance-2.5", "h3", "ltx-2.5"]);
    expect(m[0]!.line).toContain("reference video (3-30 s, 700+ px a side, 24-60 fps)");
    expect(m[0]!.line).toContain("no audio input");
    expect(m[1]!.line).toContain("the audio as reference audio");
    expect(m[3]!.use).toBe("audio-first-frame");
    expect(m[3]!.line).toMatch(/^Audio \+ first frame only: does not use the guide video/);
    for (const x of m) expect(x.guide.url).toMatch(/^https:\/\/runware\.ai\/docs\/models\//);
  });

  it("writes each model's reference tags, the legend and the environment", () => {
    const [kling, seedance, h3] = comparePrompts(SHOT, facts).map((p) => p.composed.prompt);
    expect(kling).toContain("<<<video_1>>>");
    expect(kling).toContain("<<<image_1>>>");
    expect(seedance).toContain("@Video1");
    expect(seedance).toContain("@Image1");
    expect(seedance).toContain("@Audio1");
    expect(h3).toContain("Video 1");
    expect(h3).toContain("Image 1");
    for (const p of [kling, seedance, h3]) {
      expect(p).toContain("The orange figure is the character.");
      expect(p).toContain("A rain-soaked city crossing at dusk.");
    }
  });

  it("drops the audio on H3 when guide and audio would pass the 15 s shared total", () => {
    const p8 = previewPrompt(SHOT, "h3", { ...facts, seconds: 8 });
    expect(p8.composed.used.map((u) => u.ref)).not.toContain("audio");
    expect(p8.notes.join(" ")).toContain("share 15 s");
    expect(previewPrompt(SHOT, "h3", facts).composed.used.map((u) => u.ref)).toContain("audio");
  });

  it("plans Kling with the clip as a reference video and the character as a reference image", async () => {
    const guide = await load();
    const { loadImage } = await import("../providers/runware-api/guide-bundle.ts");
    const { blobEntry } = await import("../providers/runware-api/generate.ts");
    const character = await loadImage(blobEntry(characterPng(), "character-sheet.png"));
    const lp = planGuideLane({ guide, model: "kling-4", character }, "00000000-0000-4000-8000-000000000009");
    const inputs = lp.plan.task.inputs as Record<string, unknown[]>;
    expect(inputs.referenceVideos).toHaveLength(1);
    expect(inputs.referenceImages).toHaveLength(1);
    expect(inputs.frameImages).toBeUndefined();
    expect(lp.plan.task.duration).toBe(5);
    expect(lp.marker?.model).toBe("kling-4");
    expect(lp.shot.legend).toBe(SHOT.legend);
  });

  it("plans LTX-2.5 from the audio and frame 0 only, with no duration", async () => {
    const lp = planGuideLane({ guide: await load(), model: "ltx-2.5" });
    const inputs = lp.plan.task.inputs as Record<string, unknown>;
    expect(inputs.audio).toBeDefined();
    expect(inputs.referenceImages).toHaveLength(1);
    expect(inputs.referenceVideos).toBeUndefined();
    expect(lp.plan.task.duration).toBeUndefined();
    expect(lp.plan.firstFrameVariant).toBe("A");
  });

  it("a free-text prompt replaces the composed one and drops the composed marker", async () => {
    const lp = planGuideLane({ guide: await load(), model: "seedance-2.5", prompt: "My own words about @Video1." });
    expect(lp.plan.task.positivePrompt).toBe("My own words about @Video1.");
    expect(lp.marker).toBeUndefined();
  });
});

describe("generateFromGuide", () => {
  it("talks to api.runware.ai only and never leaks the key into logs or the record", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k));
    const progress: string[] = [];
    const { o, api } = opts({ characterImage: characterPng(), onProgress: (p) => progress.push(p.stage) });
    const res = await generateFromGuide(o);
    expect(api.calls.length).toBeGreaterThan(2);
    for (const c of api.calls) expect(new URL(c.url).host).toBe("api.runware.ai");
    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain(FAKE_KEY);
    const json = JSON.stringify(res);
    expect(json).not.toContain(FAKE_KEY);
    expect(JSON.stringify(res.record)).not.toContain("Bearer");
    expect(progress).toEqual(expect.arrayContaining(["plan", "confirm", "upload", "submit", "done"]));
    // Uploads happen first; the task carries their UUIDs.
    expect(api.tasks("mediaStorage")).toHaveLength(2);
    const task = api.tasks("videoInference")[0]!;
    expect(JSON.stringify(task.inputs)).not.toContain("{{upload");
    expect(res.videoURL).toBe("https://vm.runware.ai/video/out.mp4");
    expect(res.costUsd).toBe(0.94);
  });

  it("returns a record lane with the composed prompt, inputs sent and shot, valid by both checks", async () => {
    const { o } = opts();
    const { record, lane, costRowText } = await generateFromGuide(o);
    expect(() => parseRecord(record)).not.toThrow();
    expect(validateRecord(record), JSON.stringify(validateRecord.errors)).toBe(true);
    expect(lane.prompt).toContain("<<<video_1>>>");
    expect(lane.inputsSent.map((i) => i.src)).toEqual(["guide.mp4"]);
    expect(lane.shot?.subject).toBe(SHOT.subject);
    expect(lane.composed?.model).toBe("kling-4");
    expect(record.guide?.video.src).toBe("./guide.mp4");
    expect(costRowText).toMatch(/^\| \d{4}-\d{2}-\d{2} \| klingai:kling-video@4\.0 \|/);
  });

  it("asks confirm with the estimate before sending anything, and sends nothing on no", async () => {
    const { o, api } = opts();
    let seen = -1;
    await expect(
      generateFromGuide({ ...o, confirm: (q) => ((seen = api.calls.length), expect(q.usd).toBeCloseTo(0.94, 2), false) }),
    ).rejects.toMatchObject({ code: "not-confirmed" });
    expect(seen).toBe(0);
    expect(api.calls).toHaveLength(0);
  });

  it("refuses a price over maxPrice before any request", async () => {
    const { o, api } = opts({ maxPrice: 0.5 });
    await expect(generateFromGuide(o)).rejects.toMatchObject({ code: "over-price" });
    expect(api.calls).toHaveLength(0);
  });

  it("refuses a guide under the model's minimum size with the reason", async () => {
    const { o, api } = opts({ guide: makeBundle({ width: 640, height: 360 }) });
    const e = (await generateFromGuide(o).catch((x) => x)) as GenerateError;
    expect(e.code).toBe("refused");
    expect(e.message).toContain("at least 700 px");
    expect(api.calls).toHaveLength(0);
  });

  it("refuses a malformed bundle", async () => {
    const files = makeBundle();
    delete files["meta.json"];
    const { o } = opts({ guide: files });
    await expect(generateFromGuide(o)).rejects.toMatchObject({ code: "bad-bundle" });
  });

  it("maps a refused key to invalid-key, and a malformed key fails without a request", async () => {
    const api = fakeRunware({ status: 401 });
    await expect(generateFromGuide({ ...opts().o, fetch: api.fetch })).rejects.toMatchObject({ code: "invalid-key" });
    const bad = opts({ key: "short" });
    await expect(generateFromGuide(bad.o)).rejects.toMatchObject({ code: "invalid-key" });
    expect(bad.api.calls).toHaveLength(0);
  });

  it("times out with the taskUUID and says not to resubmit", async () => {
    const api = fakeRunware({ processing: -1 });
    let t = 0;
    const e = (await generateFromGuide({ ...opts().o, fetch: api.fetch, poll: { ...fastPoll, timeoutMs: 1000, now: () => (t += 400) }, taskUUID: "00000000-0000-4000-8000-0000000000aa" }).catch((x) => x)) as GenerateError;
    expect(e.code).toBe("timeout");
    expect(e.taskUUID).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(e.message).toContain("do not resubmit");
  });

  it("stops on abort and says the task may still be billed", async () => {
    const ac = new AbortController();
    const api = fakeRunware({ processing: -1 });
    const e = (await generateFromGuide({
      ...opts().o,
      fetch: api.fetch,
      signal: ac.signal,
      onProgress: (p) => p.stage === "poll" && ac.abort(),
    }).catch((x) => x)) as GenerateError;
    expect(e.code).toBe("aborted");
    expect(e.message).toContain("may still finish and be billed");
  });
});
