import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  guideFromBundle,
  parseBundleBeats,
  parseBundleManifest,
  parseBundleMeta,
} from "../packages/core/src/bundle.ts";
import { parseGuide, parseRecord, RecordError } from "../packages/core/src/record.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema(read("../packages/core/schema/guide-bundle.schema.json"));
const validateRecord = ajv.compile(read("../packages/core/schema/record.schema.json"));
const URN = "urn:model-arena:guide-bundle:1";
const schema = (def?: string) => ajv.getSchema(def ? `${URN}#/$defs/${def}` : URN)!;
const fixture = (v: string, f: string) => read(`./fixtures/bundles/ms-${v}/${f}`);
const files = (v: string) => ({
  manifest: fixture(v, "bundle.json"),
  beats: fixture(v, "beats.json"),
  meta: fixture(v, "meta.json"),
  recipe: fixture(v, "recipe.json"),
});

function valid(def: string | undefined, data: unknown) {
  const v = schema(def);
  expect(v(data), JSON.stringify(v.errors)).toBe(true);
}

describe("guide-bundle schema, Motion Studio 0.3.0 manifest form", () => {
  it("validates a 0.3.0 bundle with a camera track, onsets, peaks and a stick figure", () => {
    valid(undefined, fixture("0.3.0", "bundle.json"));
    valid("beats", fixture("0.3.0", "beats.json"));
    valid("meta", fixture("0.3.0", "meta.json"));
    valid("camera", fixture("0.3.0", "camera.json"));
  });

  it("accepts every Motion Studio 0.4.0 camera mode", () => {
    const camera = structuredClone(fixture("0.3.0", "camera.json")) as { modes: { fromBeat: number; toBeat: number; modes: string[] }[] };
    camera.modes = [{ fromBeat: 0, toBeat: 4, modes: ["side", "threeQuarter", "top", "fixed", "truck"] }];
    valid("camera", camera);
    camera.modes = [{ fromBeat: 0, toBeat: 4, modes: ["crane"] }];
    expect(schema("camera")(camera)).toBe(false);
  });

  it("still validates a 0.2.0 bundle with no camera and no onsets", () => {
    valid(undefined, fixture("0.2.0", "bundle.json"));
    valid("beats", fixture("0.2.0", "beats.json"));
    valid("meta", fixture("0.2.0", "meta.json"));
  });

  it("still validates the inline schemaVersion 1 guide", () => {
    valid(undefined, read("../examples/records/mannequin-guide.bundle.json"));
  });

  it("refuses an unknown manifest key, an onset without strength and an unknown character", () => {
    expect(schema()({ ...fixture("0.3.0", "bundle.json"), extra: "x.json" })).toBe(false);
    const beats = fixture("0.3.0", "beats.json");
    beats.peaks = [{ seconds: 1 }];
    expect(schema("beats")(beats)).toBe(false);
    const meta = fixture("0.3.0", "meta.json");
    meta.character.kind = "ghost";
    expect(schema("meta")(meta)).toBe(false);
  });
});

describe("bundle reader", () => {
  it("parses the 0.3.0 files and keeps onsets, peaks, the camera and the stick character", () => {
    expect(parseBundleManifest(fixture("0.3.0", "bundle.json")).camera).toBe("camera.json");
    expect(parseBundleBeats(fixture("0.3.0", "beats.json")).onsets?.low).toHaveLength(2);
    expect(parseBundleMeta(fixture("0.3.0", "meta.json")).character.kind).toBe("stick");

    const guide = guideFromBundle(files("0.3.0"), "media/bundles/stick", "stick-guide");
    expect(guide.video.src).toBe("media/bundles/stick/guide.mp4");
    expect(guide.camera?.src).toBe("media/bundles/stick/camera.json");
    expect(guide.onsets?.mid[0]).toEqual({ seconds: 0.51, strength: 0.6 });
    expect(guide.peaks).toHaveLength(2);
    expect(guide.meta?.character).toEqual({ kind: "stick", name: "Stick figure" });
    expect(parseGuide(guide)).toBe(guide);
    valid("inline", guide);

    const record = { schemaVersion: 1, id: "stick", title: "Stick", guide, lanes: [placeholderLane] };
    expect(validateRecord(record), JSON.stringify(validateRecord.errors)).toBe(true);
    expect(parseRecord(record).guide?.onsets?.high).toHaveLength(2);
  });

  it("reads a 0.2.0 bundle with no onsets or camera", () => {
    const guide = guideFromBundle(files("0.2.0"), "b/");
    expect(guide.beats).toEqual([0.25, 0.75, 1.25, 1.75]);
    expect(guide.onsets).toBeUndefined();
    expect(guide.camera).toBeUndefined();
    expect(guide.audio).toBeUndefined();
    valid("inline", guide);
  });

  it("refuses bad files with the field named", () => {
    expect(() => parseBundleManifest({ ...fixture("0.3.0", "bundle.json"), camera: "../x.json" })).toThrow(/bundle.camera/);
    expect(() => parseBundleManifest({ ...fixture("0.3.0", "bundle.json"), schemaVersion: 1 })).toThrow(RecordError);
    expect(() => parseBundleManifest({ ...fixture("0.3.0", "bundle.json"), extra: "a" })).toThrow(/bundle.extra/);
    const beats = fixture("0.3.0", "beats.json");
    beats.onsets.high[0].strength = 2;
    expect(() => parseBundleBeats(beats)).toThrow(/beats.onsets.high\[0\].strength/);
    const meta = fixture("0.3.0", "meta.json");
    meta.character.kind = "ghost";
    expect(() => parseBundleMeta(meta)).toThrow(/meta.character/);
    expect(() => parseGuide({ schemaVersion: 1, video: { src: "a.mp4" }, peaks: [{ seconds: -1, strength: 0 }] })).toThrow(
      /guide.peaks\[0\].seconds/,
    );
  });
});

const placeholderLane = {
  id: "kling",
  provider: "runware",
  model: "auto",
  modelRan: null,
  prompt: "",
  inputsSent: [],
  firstFrameVariant: "C",
  output: null,
  costUsd: null,
  generationSeconds: null,
};
