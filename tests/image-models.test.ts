import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { imageFamilies, imageModels } from "../providers/runware-api/image-catalogue.ts";
import { IMAGE_MODELS, planImage, type ImageRequest } from "../providers/runware-api/image.ts";
import type { LaneMedia } from "../providers/types.ts";
import { FIXED_UUID, frame } from "./helpers.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const schemaOf = (slug: string) => JSON.parse(readFileSync(new URL(`./fixtures/runware-schemas/${slug}.schema.json`, import.meta.url), "utf8"));
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
const validator = (slug: string) => {
  if (!validators.has(slug)) validators.set(slug, ajv.compile(schemaOf(slug).components.schemas.RequestBody));
  return validators.get(slug)!;
};
const filled = (t: Record<string, unknown>) => JSON.parse(JSON.stringify(t).replace(/\{\{upload:[^}]*\}\}/g, "00000000-0000-4000-8000-0000000000ff"));
const valid = (slug: string, task: Record<string, unknown>) => {
  const v = validator(slug);
  v([filled(task)]);
  expect(v.errors ?? [], JSON.stringify(v.errors, null, 1)).toEqual([]);
};
const plan = (model: string, extra: Partial<ImageRequest> = {}) => planImage({ model, prompt: "A courier in a yellow raincoat.", ...extra }, FIXED_UUID);
const ref = (w: number, h: number, name = `ref-${w}x${h}.png`): LaneMedia => ({ ...frame, name, info: { width: w, height: h } });
const NEW = ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst", "h3-image", "h3-image-highspeed", "seedream-5.5", "flux-3-image", "flux-3-image-klein"];

describe("every image model agrees with its saved schema", () => {
  for (const m of IMAGE_MODELS)
    it(`${m.key}: AIR, prompt, references, formats and transparency match ${m.slug}`, () => {
      const s = schemaOf(m.slug);
      const task = s.components.schemas.RequestBody.items;
      expect(s.info["x-air-id"]).toBe(m.air);
      expect(task.properties.model.const).toBe(m.air);
      expect(m.schemaUrl).toBe(`https://runware.ai/docs/models/${m.slug}/schema.json`);
      expect([task.properties.positivePrompt.minLength ?? 1, task.properties.positivePrompt.maxLength]).toEqual([m.prompt.min, m.prompt.max]);
      expect(task.properties.inputs.properties.referenceImages.maxItems).toBe(m.references.max);
      expect(task.properties.outputFormat.enum).toEqual(m.outputFormats);
      expect(Boolean(task.properties.settings?.properties?.background)).toBe(m.transparency);
      expect(s.info["x-modes"].map((x: { id: string }) => x.id)).toContain("text");
      const pricing = s.info["x-pricing"];
      expect(pricing.basis === "token").toBe(m.pricing.kind === "token");
      if (m.size.kind === "grid") {
        expect([task.properties.width.minimum, task.properties.width.maximum]).toEqual([m.size.min, m.size.max]);
        expect(task.properties.width.multipleOf ?? 1).toBe(m.size.multipleOf);
        expect(task.properties.resolution?.enum).toEqual(m.size.resolution?.values);
      } else expect(task.properties.resolution.enum).toEqual(m.size.withReference.values);
    });

  it("each model's text-to-image and reference plans validate", () => {
    for (const m of IMAGE_MODELS) {
      valid(m.slug, plan(m.key).task);
      valid(m.slug, plan(m.key, { reference: frame }).task);
    }
  }, 30_000); // compiles nine schemas; slow on a loaded machine

  it("GPT-Image-2.6 takes settings.quality from its schema; other models refuse it", () => {
    const low = plan("gpt-image-2.6-flare", { quality: "low", transparent: true });
    expect(low.task.settings).toEqual({ background: "transparent", quality: "low" });
    valid("openai-gpt-image-2-6-flare", low.task);
    valid("openai-gpt-image-2-6-sunburst", plan("gpt-image-2.6-sunburst", { quality: "max" }).task);
    expect(() => plan("gpt-image-2.6-flare", { quality: "ultra" })).toThrow(/auto, max, xhigh, high, medium, low \(default auto\)/);
    expect(() => plan("seedream-5.5", { quality: "low" })).toThrow(/no quality setting/);
    expect(imageModels().find((m) => m.key === "gpt-image-2.6-flare")!.accepts.quality).toEqual({ values: ["auto", "max", "xhigh", "high", "medium", "low"], default: "auto" });
    expect(imageModels().find((m) => m.key === "h3-image")!.accepts.quality).toBeNull();
  });

  it("the schema check has teeth for each new fixture", () => {
    const base = { taskType: "imageInference", taskUUID: FIXED_UUID, positivePrompt: "xy" };
    const bad: [string, Record<string, unknown>][] = [
      ["openai-gpt-image-2-6-flare", { model: "openai:gpt-image@2.6-flare", width: 1000, height: 720 }],
      ["openai-gpt-image-2-6-sunburst", { model: "openai:gpt-image@2.6-sunburst", settings: { background: "transparent" }, outputFormat: "JPG" }],
      ["minimax-h3-image", { model: "minimax:h3@image", resolution: "2K", width: 1280, height: 720 }],
      ["minimax-h3-image-highspeed", { model: "minimax:h3@image-highspeed", resolution: "8K" }],
      ["bytedance-seedream-5-5", { model: "bytedance:seedream@5.5", resolution: "4K" }],
      ["bfl-flux-3-image", { model: "bfl:flux@3-image", width: 1280, height: 720 }],
      ["bfl-flux-3-image", { model: "bfl:flux@3-image", resolution: "1K" }],
      ["bfl-flux-3-image-klein", { model: "bfl:flux@3-image-klein" }],
    ];
    for (const [slug, t] of bad) expect(validator(slug)([{ ...base, ...t }]), `${slug} ${JSON.stringify(t)}`).toBe(false);
  });
});

describe("new image models: sizes, inputs and refusals", () => {
  it("GPT-Image-2.6: a transparent PNG with references; refuses JPG transparency, off-grid sizes, extreme aspects, 17 references", () => {
    const p = plan("gpt-image-2.6-flare", { references: [ref(1024, 1536), ref(1280, 720)], transparent: true });
    expect(p.task).toMatchObject({ width: 1024, height: 1536, settings: { background: "transparent" }, outputFormat: "PNG" });
    expect((p.task.inputs as { referenceImages: string[] }).referenceImages).toHaveLength(2);
    valid("openai-gpt-image-2-6-flare", p.task);
    expect(() => plan("gpt-image-2.6-flare", { transparent: true, outputFormat: "JPG" })).toThrow(/PNG or WEBP/);
    expect(() => plan("gpt-image-2.6-sunburst", { width: 1000, height: 720 })).toThrow(/multiples of 16/);
    expect(() => plan("gpt-image-2.6-sunburst", { width: 3840, height: 1024 })).toThrow(/aspect/);
    expect(() => plan("gpt-image-2.6-sunburst", { width: 512, height: 512 })).toThrow(/655360/);
    expect(() => plan("gpt-image-2.6-flare", { references: Array.from({ length: 17 }, () => frame) })).toThrow(/up to 16/);
    expect(() => plan("gpt-image-2.6-flare", { resolution: "2K" })).toThrow(/no resolution preset/);
  });

  it("GPT-Image-2.6 plans but carries no estimate, with the published rates in the basis", () => {
    for (const key of ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"]) {
      const p = plan(key);
      expect(p.estimate.usd).toBeNull();
      expect(p.estimate.basis).toMatch(/per token.*per 1M tokens/);
      expect(p.notes.join(" ")).toMatch(/no published upper bound.*allowUnpriced/);
    }
  });

  it("MiniMax H3 Image: an approximate estimate up to 4K, labelled as such, and none above it", () => {
    for (const key of ["h3-image", "h3-image-highspeed"]) {
      const p = plan(key);
      expect(p.estimate).toMatchObject({ approximate: true, basis: expect.stringMatching(/^about \$[\d.]+: an estimate, not a strict bound.*about 4,100 image tokens.*25% margin/) });
      expect(p.notes.join(" ")).not.toMatch(/allowUnpriced/);
    }
    expect(plan("h3-image-highspeed").estimate.basis).toContain("image output $7.60");
    expect(plan("h3-image", { resolution: "4K" }).estimate.basis).toContain("about 16,400 image tokens");
    const none = plan("h3-image", { width: 4472, height: 4472 });
    expect(none.estimate.usd).toBeNull();
    expect(none.notes.join(" ")).toMatch(/allowUnpriced/);
  });

  it("MiniMax H3 Image: a resolution preset or a free size; refuses both, small sides and transparency", () => {
    const r = plan("h3-image", { resolution: "4K" });
    expect(r.task.resolution).toBe("4K");
    expect(r.task.width).toBeUndefined();
    valid("minimax-h3-image", r.task);
    valid("minimax-h3-image-highspeed", plan("h3-image-highspeed", { width: 1500, height: 1000 }).task);
    expect(() => plan("h3-image", { resolution: "2K", width: 1280, height: 720 })).toThrow(/not both/);
    expect(() => plan("h3-image", { width: 400, height: 1600 })).toThrow(/468-7745/);
    expect(() => plan("h3-image", { transparent: true })).toThrow(/no transparent background/);
    expect(() => plan("h3-image", { reference: ref(100, 100) })).toThrow(/at least 128 px/);
  });

  it("Seedream 5.5: per-image tiers plus input images; transparency; area rule", () => {
    expect(plan("seedream-5.5").estimate.usd).toBe(0.02);
    expect(plan("seedream-5.5", { resolution: "2K" }).estimate.usd).toBe(0.035);
    expect(plan("seedream-5.5", { width: 2048, height: 2048 }).estimate.usd).toBe(0.035);
    expect(plan("seedream-5.5", { references: [frame, frame] }).estimate).toMatchObject({ usd: 0.036, basis: expect.stringContaining("$0.008 × 2") });
    const t = plan("seedream-5.5", { transparent: true, outputFormat: "WEBP" });
    valid("bytedance-seedream-5-5", t.task);
    expect(() => plan("seedream-5.5", { width: 1000, height: 900 })).toThrow(/921600-4624220/);
    expect(() => plan("seedream-5.5", { resolution: "4K" })).toThrow(/1K, 1.5K, 2K/);
  });

  it("FLUX 3 Image: listed pairs priced by tier; a reference takes a resolution or a listed pair", () => {
    const d = plan("flux-3-image");
    expect([d.task.width, d.task.height, d.estimate.usd]).toEqual([1360, 768, 0.048]);
    const r = plan("flux-3-image", { reference: frame });
    expect(r.task).toMatchObject({ resolution: "1K" });
    const big = plan("flux-3-image", { reference: frame, width: 2048, height: 2048 });
    expect(big.estimate.usd).toBe(0.1);
    valid("bfl-flux-3-image", big.task);
    expect(plan("flux-3-image", { reference: frame, resolution: "4K" }).estimate.usd).toBe(0.607);
    expect(() => plan("flux-3-image", { width: 1280, height: 720 })).toThrow(/sizes/);
    expect(() => plan("flux-3-image", { resolution: "2K" })).toThrow(/only beside a reference/);
    expect(() => plan("flux-3-image", { reference: ref(100, 400) })).toThrow(/at least 128 px/);
  });

  it("FLUX 3 Image Klein: grid sizes, measured-run bound, no bound for large reference runs", () => {
    expect(plan("flux-3-image-klein").estimate.usd).toBe(0.006);
    expect(plan("flux-3-image-klein", { width: 4096, height: 4096 }).estimate.usd).toBe(0.1013);
    expect(plan("flux-3-image-klein", { reference: frame }).estimate.usd).toBe(0.0149);
    expect(plan("flux-3-image-klein", { reference: ref(2048, 2048) }).estimate.usd).toBeNull();
    expect(() => plan("flux-3-image-klein", { width: 4100, height: 720 })).toThrow(/128-4096/);
  });

  it("a reference outside a model's output rule leaves the default size and says so; URLs are noted as unchecked", () => {
    const p = plan("gpt-image-2.6-flare", { reference: ref(4000, 500) });
    expect([p.task.width, p.task.height]).toEqual([1280, 720]);
    expect(p.notes.join(" ")).toMatch(/does not fit.*sent as it is/);
    const u = plan("h3-image", { reference: { name: "sheet.png", contentType: "image/png", ref: "https://host.example/sheet.png" } });
    expect(u.uploads).toHaveLength(0);
    expect(u.notes.join(" ")).toMatch(/not checked/);
  });

  it("refuses formats a still cannot be", () => {
    expect(() => plan("gpt-image-2.6-flare", { outputFormat: "SVG" as never })).toThrow(/still formats: JPG, PNG, WEBP/);
  });
});

describe("imageModels() and imageFamilies() for a host's picker", () => {
  it("lists every model once, by family, with provider, inputs, size rule and estimate", () => {
    const list = imageModels();
    expect(list.map((m) => m.key)).toEqual(["klein-9b", "flux-3-image", "flux-3-image-klein", "gpt-image-2.6-flare", "gpt-image-2.6-sunburst", "h3-image", "h3-image-highspeed", "seedream-5.5", "kling-image-3"]);
    for (const k of NEW) expect(list.some((m) => m.key === k)).toBe(true);
    for (const m of list) {
      expect(m.provider).toBe("runware-api");
      expect(m.accepts.text).toBe(true);
      expect(m.size.summary.length).toBeGreaterThan(10);
      expect(m.pricing.read).toMatch(/Nov 2026/);
    }
    expect(list.find((m) => m.key === "seedream-5.5")).toMatchObject({ family: "ByteDance Seedream", accepts: { transparent: true, referenceImages: { max: 10 } }, estimate: { usd: 0.02 } });
    expect(list.find((m) => m.key === "gpt-image-2.6-flare")).toMatchObject({ accepts: { outputFormats: ["JPG", "PNG", "WEBP"] }, estimate: { usd: null } });
    JSON.stringify(list); // plain data
    list[0]!.accepts.referenceImages.max = 99;
    expect(imageModels()[0]!.accepts.referenceImages.max).toBe(4);
  });

  it("groups into the five families in a stable order", () => {
    expect(imageFamilies().map((f) => [f.family, f.models.map((m) => m.key)])).toEqual([
      ["FLUX", ["klein-9b", "flux-3-image", "flux-3-image-klein"]],
      ["OpenAI GPT Image", ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"]],
      ["MiniMax H3", ["h3-image", "h3-image-highspeed"]],
      ["ByteDance Seedream", ["seedream-5.5"]],
      ["Kling IMAGE", ["kling-image-3"]],
    ]);
  });
});
