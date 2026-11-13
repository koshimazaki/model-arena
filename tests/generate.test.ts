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
    expect(m[0]!.line).toContain("reference video <<<video_1>>> (3-30 s, 700+ px a side, 24-60 fps)");
    expect(m[0]!.line).toContain("no audio input");
    expect(m[0]!.line).toContain("character sheet <<<image_1>>>, environment <<<image_2>>>");
    expect(m[1]!.line).toContain("its audio as reference audio; up to 30 reference images");
    expect(m[2]!.line).toContain("when clip and audio fit 15 s together");
    expect(m[3]!.line).toContain("exactly one image");
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

  it("H3 keeps reference video plus audio within 15 s: 5 s sends both, 8 s drops audio the guide already carries, else refuses", () => {
    expect(previewPrompt(SHOT, "h3", facts).composed.used.map((u) => u.ref)).toContain("audio");
    const dropped = previewPrompt(SHOT, "h3", { ...facts, seconds: 8, audioInVideo: true });
    expect(dropped.composed.used.map((u) => u.ref)).not.toContain("audio");
    expect(dropped.composed.prompt).not.toContain("reference audio");
    expect(dropped.notes.join(" ")).toContain("already carries its sound, so the separate audio (8 s) is not sent");
    expect(() => previewPrompt(SHOT, "h3", { ...facts, seconds: 8 })).toThrow(/up to 15 s together; got 8 s of video and 8 s of audio/);
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

describe("character sheet and environment image, per model, with zero, one and two images", () => {
  const img = async (name: string, w = 768, h = 1024) => {
    const { loadImage } = await import("../providers/runware-api/guide-bundle.ts");
    const { blobEntry } = await import("../providers/runware-api/generate.ts");
    return loadImage(blobEntry(characterPng(w, h), name));
  };
  // From the schema fixtures, with a reference video present: Kling takes up to 10 frame
  // plus reference images, Seedance 30 reference images, H3 9 (12 files in all).
  const CASES = [
    { model: "kling-4", tags: ["<<<image_1>>>", "<<<image_2>>>"] },
    { model: "seedance-2.5", tags: ["@Image1", "@Image2"] },
    { model: "h3", tags: ["Image 1", "Image 2"] },
  ];
  for (const c of CASES) {
    it(`${c.model}: images go in as reference images, character first, addressed in its own syntax`, async () => {
      const guide = await load();
      const character = await img("character.png");
      const environment = await img("environment.png", 1280, 720);
      const zero = planGuideLane({ guide, model: c.model });
      expect((zero.plan.task.inputs as Record<string, unknown>).referenceImages).toBeUndefined();
      expect(zero.plan.task.positivePrompt).not.toContain(c.tags[0]);

      const one = planGuideLane({ guide, model: c.model, environment });
      expect((one.plan.task.inputs as Record<string, unknown[]>).referenceImages).toHaveLength(1);
      expect(one.plan.inputsSent.filter((i) => i.role === "referenceImage").map((i) => i.label)).toEqual(["environment.png"]);
      expect(one.plan.task.positivePrompt).toContain(`${c.tags[0]}`);
      expect(one.plan.task.positivePrompt).toMatch(/setting/);

      const two = planGuideLane({ guide, model: c.model, character, environment });
      expect((two.plan.task.inputs as Record<string, unknown[]>).referenceImages).toHaveLength(2);
      expect(two.plan.inputsSent.filter((i) => i.role === "referenceImage").map((i) => i.label)).toEqual(["character.png", "environment.png"]);
      const p = String(two.plan.task.positivePrompt);
      expect(p.indexOf(c.tags[0]!)).toBeLessThan(p.indexOf(c.tags[1]!));
      expect(p).toMatch(new RegExp(`${c.tags[0]!.replace(/[<>@]/g, ".")}[^\\n]*character|character[^\\n]*${c.tags[0]!.replace(/[<>@]/g, ".")}`));
      expect(p).toMatch(new RegExp(`${c.tags[1]!.replace(/[<>@]/g, ".")}[^\\n]*setting|setting[^\\n]*${c.tags[1]!.replace(/[<>@]/g, ".")}`));
    });
  }

  it("kling-4 replaces the guide's figure and background by tag", async () => {
    const guide = await load();
    const p = String(planGuideLane({ guide, model: "kling-4", character: await img("c.png"), environment: await img("e.png") }).plan.task.positivePrompt);
    expect(p).toContain("Replace the figure in the guide with the character in <<<image_1>>>");
    expect(p).toContain("Replace the guide's background with the setting in <<<image_2>>>");
  });

  it("ltx-2.5 takes zero or one image (frame 0, the character or the environment) and refuses two", async () => {
    const guide = await load();
    const ref = (lp: ReturnType<typeof planGuideLane>) => lp.plan.inputsSent.find((i) => i.role === "referenceImage")?.label;
    expect(ref(planGuideLane({ guide, model: "ltx-2.5" }))).toBe("frame0.png");
    expect(ref(planGuideLane({ guide, model: "ltx-2.5", character: await img("c.png") }))).toBe("c.png");
    const env = planGuideLane({ guide, model: "ltx-2.5", environment: await img("e.png") });
    expect(ref(env)).toBe("e.png");
    expect(env.plan.firstFrameVariant).toBe("B");
    const [c, e] = [await img("c.png"), await img("e.png")];
    expect(() => planGuideLane({ guide, model: "ltx-2.5", character: c, environment: e })).toThrow(/exactly one image.*not both/);
  });

  it("refuses an environment image the model cannot take at its size, naming the model", async () => {
    const guide = await load();
    expect(() => planGuideLane({ guide, model: "kling-4", environment: { ...(guide.firstFrame), name: "tiny.png", info: { width: 200, height: 120 } } })).toThrow(/Kling VIDEO 4\.0 needs reference images at least 300 px/);
  });

  it("generateFromGuide takes host-supplied references as Blobs or with a URL", async () => {
    const { o, api } = opts({ model: "seedance-2.5", references: { character: characterPng(), environment: { blob: characterPng(1280, 720), src: "https://host.example/env.png", name: "env.png" } } });
    const r = await generateFromGuide(o);
    expect(api.tasks("mediaStorage")).toHaveLength(4);
    expect(r.lane.inputsSent.filter((i) => i.role === "referenceImage").map((i) => i.src)).toEqual(["character-sheet.png", "https://host.example/env.png"]);
    await expect(generateFromGuide({ ...o, references: { environment: new Blob(["x"], { type: "text/plain" }) } })).rejects.toMatchObject({ code: "refused" });
  });
});

describe("the H3 shared-seconds rule reaches every caller", () => {
  const video = (seconds: number, hasAudio?: boolean) => ({ name: "guide.mp4", contentType: "video/mp4", ref: "https://example.com/g.mp4", info: { width: 1280, height: 720, fps: 24, seconds, hasAudio } });
  const wav = (seconds: number) => ({ name: "audio.wav", contentType: "audio/wav", ref: "https://example.com/a.wav", info: { seconds } });

  it("planTask (the CLI path): 5 s + 5 s is sent, 8 s + 8 s drops the audio when the guide has sound, refuses otherwise", async () => {
    const { planTask } = await import("../providers/runware-api/task.ts");
    const ok = planTask({ model: "h3", prompt: "Follow it.", guideVideo: video(5), audio: wav(5), duration: 5 });
    expect((ok.task.inputs as Record<string, unknown>).referenceAudios).toHaveLength(1);
    const drop = planTask({ model: "h3", prompt: "Follow it.", guideVideo: video(8, true), audio: wav(8), duration: 5 });
    expect((drop.task.inputs as Record<string, unknown>).referenceAudios).toBeUndefined();
    expect(drop.inputsSent.map((i) => i.role)).toEqual(["referenceVideo"]);
    expect(drop.notes.join(" ")).toContain("is not sent");
    expect(() => planTask({ model: "h3", prompt: "Follow it.", guideVideo: video(8), audio: wav(8), duration: 5 })).toThrow(/up to 15 s together/);
    // Other models have no shared cap.
    expect(() => planTask({ model: "seedance-2.5", prompt: "Follow it.", guideVideo: video(8), audio: wav(8), duration: 5 })).not.toThrow();
  });

  it("generateFromGuide (the element path) with 5 s and 8 s bundles", async () => {
    const five = await generateFromGuide(opts({ model: "h3", guide: makeBundle({ seconds: 5 }) }).o);
    expect(five.inputsSent.map((i) => i.role)).toContain("referenceAudio");
    const eight = opts({ model: "h3", guide: makeBundle({ seconds: 8 }) });
    await expect(generateFromGuide(eight.o)).rejects.toMatchObject({ code: "refused", message: expect.stringContaining("up to 15 s together") });
    expect(eight.api.calls).toHaveLength(0);
    const withSound = await generateFromGuide(opts({ model: "h3", guide: makeBundle({ seconds: 8, audioInVideo: true }) }).o);
    expect(withSound.inputsSent.map((i) => i.role)).toEqual(["referenceVideo"]);
    expect(withSound.notes.join(" ")).toContain("already carries its sound");
  });
});

describe("generateFromGuide", () => {
  it("talks to api.runware.ai only and never leaks the key into logs or the record", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k));
    const progress: string[] = [];
    const { o, api } = opts({ references: { character: characterPng() }, onProgress: (p) => progress.push(p.stage) });
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
