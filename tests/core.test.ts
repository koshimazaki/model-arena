import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { SharedClock, type ClockMedia } from "../packages/core/src/clock.ts";
import { probeMp4 } from "../packages/core/src/mp4.ts";
import { parseGuide, parseRecord, RecordError } from "../packages/core/src/record.ts";
import { laneFromRun } from "../providers/types.ts";
import { planTask } from "../providers/runware-api/task.ts";
import { FIXED_UUID, guide720 } from "./helpers.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema(read("../packages/core/schema/guide-bundle.schema.json"));
const validateRecord = ajv.compile(read("../packages/core/schema/record.schema.json"));
const validateBundle = ajv.getSchema("urn:model-arena:guide-bundle:1")!;

describe("schemas", () => {
  it("the mannequin guide packs as a valid bundle", () => {
    const bundle = read("../examples/records/mannequin-guide.bundle.json");
    expect(validateBundle(bundle), JSON.stringify(validateBundle.errors)).toBe(true);
    expect(parseGuide(bundle).passes?.depth?.src).toMatch(/depth/);
  });

  it("the example record validates against the JSON Schema and the runtime parser", () => {
    const record = read("../examples/records/mannequin-placeholder.json");
    expect(validateRecord(record), JSON.stringify(validateRecord.errors)).toBe(true);
    expect(parseRecord(record).lanes).toHaveLength(3);
  });

  it("a record round-trips through JSON unchanged", () => {
    const record = parseRecord(read("../examples/records/mannequin-placeholder.json"));
    expect(parseRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it("a lane built from a plan and a result validates", () => {
    const req = { model: "kling-4", prompt: "Follow <<<video_1>>>.", guideVideo: guide720, duration: 5 };
    const plan = planTask(req, FIXED_UUID);
    const lane = laneFromRun("kling", plan, req, {
      taskUUID: FIXED_UUID, videoURL: "https://vm.runware.ai/x.mp4", costUsd: 0.94, generationSeconds: 120.44, modelRan: "klingai:kling-video@4.0", task: plan.task,
    }, "output.mp4");
    const record = { schemaVersion: 1, id: "run-1", title: "Run", lanes: [lane] };
    expect(validateRecord(record), JSON.stringify(validateRecord.errors)).toBe(true);
    expect(parseRecord(record).lanes[0]).toMatchObject({ costUsd: 0.94, generationSeconds: 120.4, modelRan: "klingai:kling-video@4.0" });
    expect(lane.settings).not.toHaveProperty("inputs");
  });

  it("refuses bad records with the field named", () => {
    const good = read("../examples/records/mannequin-placeholder.json");
    expect(() => parseRecord({ ...good, schemaVersion: 2 })).toThrow(/schemaVersion/);
    expect(() => parseRecord({ ...good, preferredLane: "nope" })).toThrow(/preferredLane/);
    expect(() => parseRecord({ ...good, title: "bad\u0007" })).toThrow(RecordError);
    const lanes = structuredClone(good.lanes);
    lanes[1].firstFrameVariant = "D";
    expect(() => parseRecord({ ...good, lanes })).toThrow(/firstFrameVariant/);
    expect(validateRecord({ ...good, lanes })).toBe(false);
  });
});

describe("mp4 probe", () => {
  it("reads size, length, frame rate and audio", () => {
    const info = probeMp4(new Uint8Array(readFileSync(new URL("./fixtures/tiny-64x36-24fps.mp4", import.meta.url))));
    expect(info).toMatchObject({ width: 64, height: 36, fps: 24, hasAudio: true });
    expect(info.seconds).toBeGreaterThan(1.4);
    expect(info.seconds).toBeLessThan(1.6);
  });
  it("refuses a file that is not an MP4", () => {
    expect(() => probeMp4(new Uint8Array(32))).toThrow();
  });
});

/** A clip that advances at its own rate when the test moves time on. */
class FakeVideo implements ClockMedia {
  currentTime = 0;
  readyState = 4;
  ended = false;
  error = null;
  paused = true;
  constructor(public duration: number, public rate = 1) {}
  async play() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
  addEventListener() {}
  advance(dt: number) {
    if (!this.paused) this.currentTime = Math.min(this.duration, this.currentTime + dt * this.rate);
    if (this.currentTime >= this.duration) this.ended = true;
  }
}

function harness(rates: number[]) {
  const frames: ((now: number) => void)[] = [];
  const clock = new SharedClock({ raf: (fn) => frames.push(fn), caf: () => {} });
  const videos = rates.map((r) => new FakeVideo(10.5, r));
  videos.forEach((v, i) => clock.add(`v${i}`, v));
  return { clock, videos, frames };
}

describe("shared clock", () => {
  it("keeps drift under one frame (24 fps) over 10 seconds", async () => {
    const { clock, videos, frames } = harness([1, 1.004, 0.995]);
    await clock.play();
    let maxDrift = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      videos.forEach((v) => v.advance(1 / 60));
      const next = frames.shift();
      next?.(t * 1000);
      const m = videos[0]!.currentTime;
      for (const v of videos.slice(1)) maxDrift = Math.max(maxDrift, Math.abs(v.currentTime - m));
    }
    expect(clock.state.playing).toBe(true);
    expect(maxDrift).toBeLessThan(1 / 24);
  });

  it("solo plays one clip and pauses the rest; seek moves every clip", async () => {
    const { clock, videos } = harness([1, 1]);
    await clock.play();
    await clock.solo("v1");
    expect(clock.state).toMatchObject({ playing: false, soloing: "v1" });
    expect(videos[0]!.paused).toBe(true);
    expect(videos[1]!.paused).toBe(false);
    clock.seek(3);
    expect(videos.map((v) => v.currentTime)).toEqual([3, 3]);
    expect(clock.state.soloing).toBeUndefined();
  });

  it("refuses to play until every clip has loaded", async () => {
    const { clock, videos } = harness([1, 1]);
    videos[1]!.readyState = 1;
    await clock.play();
    expect(clock.state.playing).toBe(false);
    expect(clock.state.error).toMatch(/Wait for every video/);
  });

  it("stops at the end of the shortest clip", async () => {
    const { clock, videos, frames } = harness([1, 1]);
    await clock.play();
    videos.forEach((v) => (v.currentTime = 10.49));
    frames.shift()?.(0);
    expect(clock.state.playing).toBe(false);
    expect(clock.state.time).toBeCloseTo(10.5);
  });
});
