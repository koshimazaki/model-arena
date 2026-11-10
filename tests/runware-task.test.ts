import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { planTask, PlanError, estimateCost } from "../providers/runware-api/task.ts";
import { findModel, MODELS } from "../providers/runware-api/models.ts";
import type { LaneRequest } from "../providers/types.ts";
import { audio, FIXED_UUID, frame, guide576, guide720 } from "./helpers.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);

function validator(slug: string) {
  const doc = JSON.parse(readFileSync(new URL(`./fixtures/runware-schemas/${slug}.schema.json`, import.meta.url), "utf8"));
  return ajv.compile(doc.components.schemas.RequestBody);
}

/** Fills placeholders with a UUID, as the run does after mediaStorage upload. */
const filled = (task: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(task).replace(/\{\{upload:[^}]*\}\}/g, "00000000-0000-4000-8000-0000000000ff"));

const lanes: [string, LaneRequest][] = [
  ["kling-4", { model: "kling-4", prompt: "Follow <<<video_1>>>.", guideVideo: guide720, duration: 5 }],
  ["kling-4 + first frame", { model: "kling-4", prompt: "Follow <<<video_1>>>.", guideVideo: guide720, firstFrame: frame, duration: 5 }],
  ["seedance-2.5", { model: "seedance-2.5", prompt: "Follow @Video1.", guideVideo: guide720, firstFrame: frame, audio, duration: 5 }],
  ["h3", { model: "h3", prompt: "Follow the clip.", guideVideo: guide720, firstFrame: frame, audio, duration: 5 }],
  ["ltx-2.5 audio", { model: "ltx-2.5", prompt: "A mannequin dances.", firstFrame: frame, audio }],
  ["ltx-2.5 first frame + camera", { model: "ltx-2.5", prompt: "A mannequin dances.", firstFrame: frame, duration: 6, camera: "dolly_in" }],
  ["ltx-2.5-fast audio", { model: "ltx-2.5-fast", prompt: "A mannequin dances.", firstFrame: frame, audio }],
  ["flux-3-video", { model: "flux-3-video", prompt: "A mannequin dances.", firstFrame: frame, duration: 5 }],
];

describe("task JSON per model", () => {
  for (const [name, req] of lanes) {
    it(`${name}: matches snapshot and the published schema`, () => {
      const plan = planTask(req, FIXED_UUID);
      expect(plan.task).toMatchSnapshot();
      const m = findModel(req.model);
      const validate = validator(m.slug);
      const ok = validate([filled(plan.task)]);
      expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 1)).toEqual([]);
      expect(ok).toBe(true);
    });
  }

  it("the schema check has teeth: it rejects what the schemas forbid", () => {
    const id = "00000000-0000-4000-8000-0000000000ff";
    const base = { taskType: "videoInference", taskUUID: FIXED_UUID, positivePrompt: "Follow it.", duration: 5 };
    const seedance = validator("bytedance-seedance-2-5");
    expect(seedance([{ ...base, model: "bytedance:seedance@2.5", inputs: { frameImages: [id], referenceVideos: [id] } }])).toBe(false);
    const h3 = validator("minimax-h3");
    expect(h3([{ ...base, model: "minimax:h3@0", inputs: { frameImages: [id], referenceVideos: [id] } }])).toBe(false);
    const kling = validator("klingai-video-4-0");
    expect(kling([{ ...base, model: "klingai:kling-video@4.0", inputs: { referenceVideos: [id] }, cameraControl: {} }])).toBe(false);
    // Note: a data: URI passes `format: uri`, so the schema alone cannot say whether
    // video inputs take base64; the description says "UUID or URL" (docs/friction.md).
    const ltx = validator("lightricks-ltx-2-5-pro");
    expect(ltx([{ ...base, model: "lightricks:ltx@2.5-pro", inputs: { audio: id, referenceImages: [id] } }])).toBe(false);
  });

  it("router lane: model auto with routing and a price cap", () => {
    const plan = planTask(
      { model: "auto", prompt: "Follow the clip.", guideVideo: guide720, duration: 5, routing: { maxPrice: 1.5, requirements: "720p or better" } },
      FIXED_UUID,
    );
    expect(plan.task).toMatchSnapshot();
    expect(plan.task.model).toBe("auto");
    expect(plan.task.routing).toEqual({ maxPrice: 1.5, requirements: "720p or better" });
    expect(plan.estimate.usd).toBe(1.5);
  });

  it("every model id is the AIR from the catalogue", () => {
    expect(MODELS.map((m) => m.air)).toEqual([
      "klingai:kling-video@4.0",
      "bytedance:seedance@2.5",
      "minimax:h3@0",
      "lightricks:ltx@2.5-pro",
      "lightricks:ltx@2.5-fast",
      "bfl:flux@3-video",
      "auto",
    ]);
  });
});

describe("fitting and refusals", () => {
  it("Kling keeps the first frame as frameImages beside the reference video", () => {
    const t = planTask(lanes[1]![1], FIXED_UUID).task as { inputs: Record<string, unknown> };
    expect(Object.keys(t.inputs).sort()).toEqual(["frameImages", "referenceVideos"]);
  });

  it("Seedance and H3 move the first frame to referenceImages", () => {
    for (const model of ["seedance-2.5", "h3"]) {
      const plan = planTask({ model, prompt: "Follow it.", guideVideo: guide720, firstFrame: frame, duration: 5 }, FIXED_UUID);
      const inputs = (plan.task as { inputs: Record<string, unknown> }).inputs;
      expect(inputs.frameImages).toBeUndefined();
      expect(inputs.referenceImages).toHaveLength(1);
      expect(plan.notes.join(" ")).toMatch(/image reference/);
    }
  });

  it("refuses a Kling guide under 700 px", () => {
    expect(() => planTask({ model: "kling-4", prompt: "x", guideVideo: guide576, duration: 5 })).toThrow(/700 px/);
  });

  it("refuses audio on Kling", () => {
    expect(() => planTask({ model: "kling-4", prompt: "x", guideVideo: guide720, audio, duration: 5 })).toThrow(PlanError);
  });

  it("refuses a reference video on LTX-2.5 and FLUX 3 Video", () => {
    expect(() => planTask({ model: "ltx-2.5", prompt: "a b", guideVideo: guide720, firstFrame: frame })).toThrow(/no reference video/);
    expect(() => planTask({ model: "flux-3-video", prompt: "a b", guideVideo: guide720 })).toThrow(/extend/);
  });

  it("refuses LTX audio without a still, and a duration beside audio", () => {
    expect(() => planTask({ model: "ltx-2.5", prompt: "a b", audio })).toThrow(/reference image/);
    expect(() => planTask({ model: "ltx-2.5", prompt: "a b", audio, firstFrame: frame, duration: 6 })).toThrow(/audio/);
  });

  it("refuses durations outside the schema", () => {
    expect(() => planTask({ model: "kling-4", prompt: "x", guideVideo: guide720, duration: 2 })).toThrow(/3-30/);
    expect(() => planTask({ model: "h3", prompt: "xy", guideVideo: guide720, duration: 16 })).toThrow(/4-15/);
    expect(() => planTask({ model: "ltx-2.5", prompt: "xy", firstFrame: frame, duration: 5 })).toThrow(/6, 8, 10/);
  });

  it("refuses camera parameters a schema does not declare", () => {
    expect(() => planTask({ model: "kling-4", prompt: "x", guideVideo: guide720, duration: 5, camera: "dolly_in" })).toThrow(/no camera/);
  });

  it("refuses a router lane without a price cap", () => {
    expect(() => planTask({ model: "auto", prompt: "x", guideVideo: guide720 })).toThrow(/price cap/);
  });

  it("records what was sent and the first-frame variant", () => {
    const plan = planTask({ ...lanes[2]![1], firstFrameVariant: "B" }, FIXED_UUID);
    expect(plan.inputsSent.map((i) => i.role)).toEqual(["referenceImage", "referenceVideo", "referenceAudio"]);
    expect(plan.firstFrameVariant).toBe("B");
    expect(planTask(lanes[0]![1]).firstFrameVariant).toBe("C");
  });

  it("uploads each local file once and passes URLs through", () => {
    const url = { ...guide720, ref: "https://example.com/guide.mp4" };
    const plan = planTask({ model: "kling-4", prompt: "x", guideVideo: url, firstFrame: frame, duration: 5 });
    expect(plan.uploads).toHaveLength(1);
    expect((plan.task as { inputs: { referenceVideos: string[] } }).inputs.referenceVideos).toEqual(["https://example.com/guide.mp4"]);
  });
});

describe("cost estimates from schema rates", () => {
  it("Kling 720p with video input, 5 s", () => {
    expect(estimateCost(findModel("kling-4"), { resolution: "720p", seconds: 5, videoInput: true }).usd).toBeCloseTo(0.94);
  });
  it("H3 adds the input-video charge", () => {
    expect(estimateCost(findModel("h3"), { resolution: "768p", seconds: 5, videoInput: true, inputVideoSeconds: 8 }).usd).toBeCloseTo(0.4 + 1.04);
  });
  it("auto duration is bounded by the longest clip", () => {
    expect(estimateCost(findModel("flux-3-video"), { resolution: "720p", seconds: "auto", videoInput: false }).usd).toBeCloseTo(3.4);
  });
});
