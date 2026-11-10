import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { composeFor, type ShotDescription } from "../packages/core/src/compose.ts";
import { parseRecord } from "../packages/core/src/record.ts";
import { composedMarker, parseShot, shotSummary } from "../packages/core/src/shot.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema(read("../packages/core/schema/guide-bundle.schema.json"));
const validateRecord = ajv.compile(read("../packages/core/schema/record.schema.json"));

const shot: ShotDescription = {
  subject: "A figure in a plain grey jumpsuit",
  action: "performs the guide's motion beside two fruits on a wooden table",
  camera: "push-in",
  duration: 5,
  references: [
    { id: "guide", kind: "video", role: "motion" },
    { id: "character", kind: "image", role: "character", replaces: "the mannequin" },
  ],
};

describe("the record's neutral shot", () => {
  it("every blog record carries its shot and marks composed lanes, valid to both checks", () => {
    for (const name of ["camera", "audio-sync", "character", "guidance"]) {
      const record = read(`../examples/records/blog/${name}.json`);
      expect(record.shot, name).toBeDefined();
      expect(record.lanes.every((l: { composed?: { model: string } }) => l.composed?.model), name).toBe(true);
      expect(() => parseRecord(record)).not.toThrow();
      const ok = validateRecord(record);
      expect(validateRecord.errors ?? [], `${name}: ${JSON.stringify(validateRecord.errors)}`).toEqual([]);
      expect(ok).toBe(true);
    }
  });

  it("a record without a shot is still valid (the field is optional, version 1)", () => {
    const record = read("../examples/records/mannequin-placeholder.json");
    expect(record.shot).toBeUndefined();
    expect(() => parseRecord(record)).not.toThrow();
    expect(validateRecord(record)).toBe(true);
  });

  it("refuses a malformed shot by path", () => {
    const record = { ...read("../examples/records/blog/camera.json") };
    expect(() => parseRecord({ ...record, shot: { ...shot, camera: "zoom" } })).toThrow(/shot\.camera/);
    expect(() => parseRecord({ ...record, shot: { ...shot, references: [{ id: "x y", kind: "image", role: "character" }] } })).toThrow(/references\[0\]\.id/);
    expect(() => parseRecord({ ...record, shot: { ...shot, subject: "bad\u0007" } })).toThrow(/subject/);
    expect(validateRecord({ ...record, shot: { ...shot, camera: "zoom" } })).toBe(false);
  });

  it("parseShot accepts the neutral description and summarises it", () => {
    expect(parseShot(shot)).toBe(shot);
    expect(shotSummary(shot)).toContain("Camera: push-in");
  });

  it("composedMarker records the model and what was dropped", () => {
    const m = composedMarker(composeFor("ltx-2.5", shot));
    expect(m.model).toBe("ltx-2.5");
    expect(m.dropped?.join(" ")).toMatch(/guide/);
  });
});
