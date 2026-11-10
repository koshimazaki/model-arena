/**
 * The spec database checked against the Runware schemas it was read from.
 * Every value a schema states must match; anything the schema leaves out must
 * be null or carry a source other than the schema.
 */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { cheapestRate, findSpec, INPUT_KINDS, MODEL_SPECS, supportedInputs, type ModelSpec } from "../packages/core/src/specs/index.ts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const read = (p: string): Json => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const schemaOf = (s: ModelSpec): Json => read(`./fixtures/runware-schemas/${s.slug}.schema.json`);
const body = (schema: Json): Json => schema.components.schemas.RequestBody.items;

/** The property at `inputs.x`, `settings.x` or a top-level name. */
function prop(schema: Json, path: string): Json | undefined {
  const props = body(schema).properties;
  const [head, tail] = path.split(".");
  if (!tail) return props[head!];
  return props[head!]?.properties?.[tail];
}

const validateSpec = new Ajv2020({ strict: false, allErrors: true }).compile(read("../packages/core/schema/model-spec.schema.json"));

describe.each(MODEL_SPECS.map((s) => [s.id, s] as const))("spec %s", (_id, spec) => {
  const schema = schemaOf(spec);

  it("validates against model-spec.schema.json", () => {
    expect(validateSpec(JSON.parse(JSON.stringify(spec))), JSON.stringify(validateSpec.errors)).toBe(true);
  });

  it("lists every input kind", () => {
    expect(Object.keys(spec.inputs).sort()).toEqual([...INPUT_KINDS].sort());
  });

  it("every supported input names a field the schema has, within its maxItems", () => {
    for (const kind of supportedInputs(spec)) {
      const input = spec.inputs[kind];
      const p = prop(schema, input.field!);
      expect(p, `${kind} → ${input.field}`).toBeDefined();
      if (p?.type === "array" && input.maxCount !== null) expect(input.maxCount).toBeLessThanOrEqual(p.maxItems);
    }
  });

  it("inputs the schema has no field for are unsupported", () => {
    const fields: Record<string, string> = { referenceVideos: "inputs.referenceVideos", referenceAudios: "inputs.referenceAudios", elements: "inputs.elements" };
    for (const [kind, field] of Object.entries(fields)) {
      if (!prop(schema, field)) expect(spec.inputs[kind as keyof typeof spec.inputs].supported, kind).toBe(false);
    }
    if (!prop(schema, "inputs.frameImages")) expect(spec.inputs.firstFrame.supported).toBe(false);
    const frames = prop(schema, "inputs.frameImages");
    if (frames && frames.maxItems < 3) expect(spec.inputs.keyframes.supported).toBe(false);
  });

  it("durations match the schema", () => {
    const d = prop(schema, "duration")!;
    const numeric = d.oneOf?.find((o: Json) => o.type === "integer") ?? d;
    const auto = Boolean(d.oneOf?.some((o: Json) => o.const === "auto"));
    expect(spec.output.durations.auto).toBe(auto);
    if (numeric.enum) expect(spec.output.durations).toMatchObject({ kind: "list", values: numeric.enum });
    else expect(spec.output.durations).toMatchObject({ kind: "range", min: numeric.minimum, max: numeric.maximum });
    expect(spec.output.defaultDuration).toBe(d.default ?? null);
  });

  it("resolutions and sizes match the schema", () => {
    const res = prop(schema, "resolution");
    if (res) expect(spec.output.resolutions).toEqual(res.enum);
    expect(spec.output.resolutionField === "width-height").toBe(!res);
    const sizeRule = body(schema).allOf.find((r: Json) => r.then?.oneOf?.[0]?.title);
    const sizes = sizeRule.then.oneOf.map((o: Json) => ({ label: o.title, width: o.properties.width.const, height: o.properties.height.const }));
    expect(spec.output.sizes).toEqual(sizes);
    const fps = prop(schema, "fps");
    if (fps) expect(spec.output.fps).toEqual(fps.enum);
  });

  it("the audio switch is a schema field that generates audio", () => {
    const toggle = spec.output.audio.toggle;
    if (toggle) expect(prop(schema, toggle)?.description).toMatch(/generate/i);
    else expect(prop(schema, "settings.audio")).toBeUndefined();
  });

  it("prompt length matches the schema, or is null where the schema is silent", () => {
    const p = prop(schema, "positivePrompt")!;
    expect(spec.prompting.minChars).toBe(p.minLength ?? null);
    expect(spec.prompting.maxChars).toBe(p.maxLength ?? null);
  });

  it("seed support matches the schema", () => {
    const seed = prop(schema, "seed");
    expect(spec.prompting.seed.supported).toBe(Boolean(seed));
    expect(spec.prompting.seed.max).toBe(seed?.maximum ?? null);
  });

  it("the camera parameter is the schema's own", () => {
    const p = prop(schema, "settings.cameraMovement");
    if (spec.camera.kind === "parameter") {
      expect(p, spec.camera.field).toBeDefined();
      expect(spec.camera.values.map((v) => v.value).sort()).toEqual(p!.oneOf.map((o: Json) => o.const).sort());
      for (const v of spec.camera.values) expect(v.meaning).toBe(p!.oneOf.find((o: Json) => o.const === v.value).description);
    } else {
      expect(p).toBeUndefined();
    }
  });

  it("rates are exactly the schema's x-pricing", () => {
    const rates = schema.info["x-pricing"].rates.filter((r: Json) => r.unit === "durationSecond");
    const all = [...spec.pricing.rates.map((r) => ({ label: r.label, amount: r.usdPerSecond })), ...spec.pricing.surcharges.filter((s) => s.per === "input-video-second").map((s) => ({ label: s.label, amount: s.usd }))];
    expect(all.sort((a, b) => a.label.localeCompare(b.label))).toEqual(rates.map((r: Json) => ({ label: r.label, amount: r.amount })).sort((a: Json, b: Json) => a.label.localeCompare(b.label)));
  });

  it("a field left unknown says so in the notes", () => {
    if (spec.output.fps === null) expect(spec.notes.join(" ")).toMatch(/fps: not stated/i);
    if (spec.prompting.maxChars === null) expect(spec.notes.join(" ")).toMatch(/prompt length: not stated/i);
  });
});

describe("spec database", () => {
  it("ids are unique and findSpec looks up by id, AIR and slug", () => {
    expect(new Set(MODEL_SPECS.map((s) => s.id)).size).toBe(MODEL_SPECS.length);
    expect(findSpec("klingai:kling-video@4.0").id).toBe("kling-4");
    expect(findSpec("minimax-h3").id).toBe("h3");
    expect(() => findSpec("nope")).toThrow(/No spec/);
  });

  it("addressing tokens follow each model's syntax", () => {
    const tokens = (id: string) => findSpec(id).prompting.addressing.tokens.map((t) => t.pattern);
    expect(tokens("kling-4")).toEqual(expect.arrayContaining(["<<<video_{n}>>>", "<<<image_{n}>>>"]));
    expect(tokens("seedance-2.5")).toEqual(["@Image{n}", "@Video{n}", "@Audio{n}"]);
    expect(tokens("h3")).toEqual(["Image {n}", "Video {n}"]);
    expect(tokens("ltx-2.5")).toEqual([]);
    expect(tokens("flux-3-video")).toEqual([]);
  });

  it("only LTX has a camera parameter", () => {
    expect(MODEL_SPECS.filter((s) => s.camera.kind === "parameter").map((s) => s.id)).toEqual(["ltx-2.5", "ltx-2.5-fast"]);
  });

  it("cheapest rate skips draft rates", () => {
    expect(cheapestRate(findSpec("flux-3-video")).usdPerSecond).toBe(0.17);
  });
});
