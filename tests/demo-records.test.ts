import { readdirSync, readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { parseRecord } from "../packages/core/src/record.ts";
import { parseRecordSet } from "../packages/core/src/record-set.ts";

const dir = new URL("../examples/records/blog/", import.meta.url);
const read = (p: string | URL) => JSON.parse(readFileSync(p, "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema(read(new URL("../packages/core/schema/guide-bundle.schema.json", import.meta.url)));
const validate = ajv.compile(read(new URL("../packages/core/schema/record.schema.json", import.meta.url)));

describe("blog demo records", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "set.json");

  it.each(files)("%s validates and claims no run", (f) => {
    const r = read(new URL(f, dir));
    expect(validate(r), JSON.stringify(validate.errors)).toBe(true);
    const rec = parseRecord(r);
    for (const l of rec.lanes) {
      expect(l.status).toBe("placeholder");
      expect(l.costUsd).toBeNull();
      expect(l.modelRan).toBeNull();
    }
  });

  it("the set has the three test tabs, each pointing at a record here", () => {
    const set = parseRecordSet(read(new URL("set.json", dir)));
    expect(set.tabs.map((t) => t.label)).toEqual(["Camera", "Audio sync", "Character"]);
    for (const t of set.tabs) expect(files).toContain(t.src);
  });

  it("only LTX is sent a camera parameter in the guidance record", () => {
    const r = parseRecord(read(new URL("guidance.json", dir)));
    const withParam = r.lanes.filter((l) => (l.settings as { settings?: unknown } | undefined)?.settings).map((l) => l.id);
    expect(withParam).toEqual(["ltx-2-5"]);
  });
});
