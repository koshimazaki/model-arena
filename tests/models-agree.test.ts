// The provider's lane facts (providers/runware-api/models.ts) and the spec
// database (packages/core/src/specs) state the same limits; this keeps them in step.
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { findSpec } from "../packages/core/src/specs/index.ts";
import { MODELS } from "../providers/runware-api/models.ts";
import { planTask } from "../providers/runware-api/task.ts";
import { FIXED_UUID, frame, guide720 } from "./helpers.ts";

const lanes = MODELS.filter((m) => m.key !== "auto");
const frameMax = (s: ReturnType<typeof findSpec>) =>
  s.inputs.keyframes.supported ? s.inputs.keyframes.maxCount : ["firstFrame", "lastFrame"].filter((k) => s.inputs[k as "firstFrame"].supported).length;

describe("models.ts agrees with the spec database", () => {
  for (const m of lanes) {
    const s = findSpec(m.key);
    it(`${m.key}: identity, prompt, durations, tiers, rates`, () => {
      expect([m.air, m.slug, m.name]).toEqual([s.air, s.slug, s.name]);
      expect(m.prompt.max).toBe(s.prompting.maxChars ?? Infinity);
      const d = s.output.durations;
      expect(m.duration).toEqual(d.kind === "range" ? { kind: "range", min: d.min, max: d.max, auto: d.auto } : { kind: "enum", values: d.values, auto: d.auto });
      if (m.resolutions) expect(m.resolutions).toEqual(s.output.resolutions);
      if (m.sizes) for (const size of Object.values(m.sizes)) expect(s.output.sizes).toContainEqual(expect.objectContaining(size));
      // Only the tiers the lane offers (LTX Fast's lane offers 720p and 1080p of four).
      const offered = new Set(m.resolutions ?? (m.sizes ? Object.keys(m.sizes) : [m.defaultResolution]));
      const paid = s.pricing.rates.filter((r) => offered.has(r.tier) && !r.mode.startsWith("draft") && (r.mode !== "video-input" || m.rates.some((x) => x.videoInput)));
      expect(m.rates.map((r) => r.usdPerSecond).sort()).toEqual(paid.filter((r) => m.caps.approach !== "keyframes" || r.mode !== "video-input").map((r) => r.usdPerSecond).sort());
    });

    it(`${m.key}: input caps and limits`, () => {
      const rv = s.inputs.referenceVideos;
      expect(Boolean(m.caps.referenceVideos)).toBe(rv.supported);
      if (m.caps.referenceVideos && rv.limits) {
        expect(m.caps.referenceVideos.max).toBe(rv.maxCount);
        expect([m.caps.referenceVideos.minSeconds, m.caps.referenceVideos.maxSeconds]).toEqual([rv.limits.secondsEach?.min, rv.limits.secondsEach?.max]);
        expect(m.caps.referenceVideos.totalMaxSeconds).toBe(rv.limits.secondsTotalMax);
        expect(m.caps.referenceVideos.minSide).toBe(rv.limits.sidePx?.min);
      }
      if (m.caps.referenceImages) expect(m.caps.referenceImages.max).toBe(s.inputs.referenceImages.maxCount);
      if (m.caps.referenceAudios) expect(m.caps.referenceAudios.max).toBe(s.inputs.referenceAudios.maxCount);
      if (m.caps.frameImages) expect(m.caps.frameImages.max).toBe(frameMax(s));
      if (m.caps.drivingAudio) expect(m.caps.drivingAudio.maxSeconds).toBe(s.inputs.audioToVideo.limits?.secondsEach?.max);
      const framesBesideRefs = !s.combinations.some((c) => c.when.includes("firstFrame") && c.forbidsInputs?.includes("referenceVideos"));
      if (m.caps.approach === "reference-video") expect(m.caps.startFrameWithReferences).toBe(framesBesideRefs);
    });

    it(`${m.key}: camera parameter`, () => {
      expect(m.cameraMovements ?? null).toEqual(s.camera.kind === "parameter" ? s.camera.values.map((v) => v.value).sort((a, b) => m.cameraMovements!.indexOf(a) - m.cameraMovements!.indexOf(b)) : null);
    });
  }
});

describe("Kling 4.0 Flash lane", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  (addFormats as unknown as (a: Ajv2020) => void)(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(new URL("./fixtures/runware-schemas/klingai-video-4-0-flash.schema.json", import.meta.url), "utf8")).components.schemas.RequestBody);

  it("sends no resolution field and matches its schema", () => {
    const p = planTask({ model: "kling-4-flash", prompt: "Follow <<<video_1>>>.", guideVideo: guide720, firstFrame: frame, duration: 5 }, FIXED_UUID);
    expect(p.task).toMatchSnapshot();
    expect(p.task.resolution).toBeUndefined();
    validate([JSON.parse(JSON.stringify(p.task).replace(/\{\{upload:[^}]*\}\}/g, "00000000-0000-4000-8000-0000000000ff"))]);
    expect(validate.errors ?? []).toEqual([]);
    expect(p.estimate.usd).toBeCloseTo(0.126 * 5);
  });

  it("refuses 1080p and clips over 20 s", () => {
    expect(() => planTask({ model: "kling-4-flash", prompt: "x", guideVideo: guide720, duration: 5, resolution: "1080p" })).toThrow(/720p only/);
    expect(() => planTask({ model: "kling-4-flash", prompt: "x", guideVideo: guide720, duration: 25 })).toThrow(/3-20/);
  });
});
