import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateImage, type GenerateImageOptions } from "../providers/runware-api/generate-image.ts";
import { checkImagePrice, GPT_IMAGE_26_FLARE, IMAGE_MODELS, planImage, tokenBound, tokenEstimate, type TokenPricing } from "../providers/runware-api/image.ts";
import type { CostQuestion } from "../providers/runware-api/generate.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll } from "./embed-helpers.ts";

const TOKEN_KEYS = ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst", "h3-image", "h3-image-highspeed"];
const rates = { textInput: 5e-6, imageInput: 8e-6, imageOutput: 3e-5 };
const base: TokenPricing = { rates, ratesText: "r", examples: [{ mode: "text-to-image", usd: 0.1 }, { mode: "reference-to-image", usd: 0.2 }] };

describe("token pricing: a bound only from published figures", () => {
  it("the table's rates and examples are the ones in x-pricing", () => {
    for (const key of TOKEN_KEYS) {
      const m = IMAGE_MODELS.find((x) => x.key === key)!;
      const p = JSON.parse(readFileSync(new URL(`./fixtures/runware-schemas/${m.slug}.schema.json`, import.meta.url), "utf8")).info["x-pricing"];
      const amount = (label: string) => p.rates.find((r: { label: string }) => r.label === label).amount;
      expect(m.tokens!.rates).toEqual({ textInput: amount("Text input"), imageInput: amount("Image input"), imageOutput: amount("Image output") });
      expect(m.tokens!.examples.map((e) => e.usd)).toEqual(p.examples.map((e: { price: number }) => Math.round(e.price * 10000) / 10000));
      // Nothing published states a token count, so no model has a bound today.
      expect(m.tokens!.outputTokensPerImage).toBeUndefined();
      expect(JSON.stringify(p)).not.toMatch(/tokens per image|outputTokens"/i);
    }
  });

  it("tokenBound: none without an output-token figure, none with references but no input figure, else the sum", () => {
    expect(tokenBound(base, { references: 0, prompt: "ab" })).toBeNull();
    expect(tokenBound({ ...base, outputTokensPerImage: 4000 }, { references: 1, prompt: "ab" })).toBeNull();
    expect(tokenBound({ ...base, outputTokensPerImage: 4000 }, { references: 0, prompt: "ab" })).toBe(0.12001); // 4000 × $30/1M + 2 bytes × $5/1M
    expect(tokenBound({ ...base, outputTokensPerImage: 4000, inputTokensPerImage: 1000 }, { references: 2, prompt: "ab" })).toBe(0.13601);
    expect(tokenEstimate({ ...base, outputTokensPerImage: 4000 }, { references: 0 })).toEqual({ usd: 0.12, basis: "up to $0.12 (priced per token: r)" });
    expect(tokenEstimate(base, { references: 0 })).toMatchObject({ usd: null, basis: expect.stringMatching(/no upper bound.*text-to-image \$0\.1/) });
  });

  it("checkImagePrice: bound under and over the cap; unpriced refused, over the highest example, or allowed", () => {
    const seedream = planImage({ model: "seedream-5.5", prompt: "x" });
    expect(checkImagePrice(seedream, 0.5)).toMatchObject({ ok: true, priced: "bound", usd: 0.02 });
    expect(checkImagePrice(seedream, 0.01)).toMatchObject({ ok: false, code: "over-price" });
    const gpt = planImage({ model: "gpt-image-2.6-flare", prompt: "xy" });
    expect(gpt.estimate.usd).toBeNull();
    expect(gpt.task.includeCost).toBe(true);
    expect(gpt.unpriced).toMatchObject({ highestExampleUsd: 0.193, rates: expect.stringContaining("$30.00") });
    expect(checkImagePrice(gpt, 1)).toMatchObject({ ok: false, code: "no-estimate", message: expect.stringMatching(/allowUnpriced/) });
    expect(checkImagePrice(gpt, 0.1, true)).toMatchObject({ ok: false, code: "over-price", message: expect.stringMatching(/highest published example, \$0\.193/) });
    expect(checkImagePrice(gpt, 0.5, true)).toMatchObject({ ok: true, priced: "unpriced", usd: 0.193, basis: expect.stringMatching(/no published upper bound/), examples: expect.stringContaining("reference-to-image $0.193") });
    const big = planImage({ model: "flux-3-image-klein", prompt: "x", reference: { name: "r.png", contentType: "image/png", ref: "https://h.example/r.png", info: { width: 2048, height: 2048 } } });
    expect(checkImagePrice(big, 1, true)).toMatchObject({ ok: false, code: "no-estimate" }); // not token-priced: allowUnpriced does not apply
  });
});

describe("generateImage on token-priced models", () => {
  const run = (extra: Partial<GenerateImageOptions> = {}) => {
    const api = fakeRunware({ imageURL: "https://im.runware.ai/image/out.png", cost: 0.151 });
    const asked: CostQuestion[] = [];
    const o: GenerateImageOptions = {
      model: "gpt-image-2.6-flare",
      prompt: "A courier in a yellow raincoat, full body, plain background.",
      maxPrice: 0.5,
      key: FAKE_KEY,
      confirm: (q) => (asked.push(q), true),
      fetch: api.fetch,
      poll: fastPoll,
      ...extra,
    };
    return { o, api, asked };
  };

  it("without allowUnpriced: refused, nothing sent", async () => {
    const { o, api, asked } = run();
    await expect(generateImage(o)).rejects.toMatchObject({ code: "no-estimate", message: expect.stringMatching(/allowUnpriced/) });
    expect(api.calls).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  it("with allowUnpriced but a cap under the highest example: over-price, nothing sent", async () => {
    const { o, api } = run({ allowUnpriced: true, maxPrice: 0.15 });
    await expect(generateImage(o)).rejects.toMatchObject({ code: "over-price" });
    expect(api.calls).toHaveLength(0);
  });

  it("with allowUnpriced: the question says there is no bound and shows rates and examples; includeCost is sent; the real cost comes back", async () => {
    const { o, api, asked } = run({ allowUnpriced: true, references: [characterPng()] });
    const r = await generateImage(o);
    expect(asked[0]).toMatchObject({ priced: "unpriced", usd: 0.193, rates: expect.stringContaining("image output $30.00"), examples: expect.stringContaining("text-to-image $0.167"), basis: expect.stringMatching(/no published upper bound/) });
    expect(api.tasks("imageInference")[0]).toMatchObject({ model: "openai:gpt-image@2.6-flare", includeCost: true });
    expect(r.costUsd).toBe(0.151);
    expect(r.estimate.usd).toBeNull();
    expect(r.costRow.estimateUsd).toBeNull();
    expect(r.notes.join(" ")).toMatch(/without a published bound.*reported is \$0\.151/);
  });

  it("when a token count is published, the bound is shown as 'up to' and checked against the cap", async () => {
    const tokens = GPT_IMAGE_26_FLARE.tokens!;
    tokens.outputTokensPerImage = 4000;
    tokens.inputTokensPerImage = 1000;
    try {
      const { o, asked } = run({ references: [characterPng()] });
      const r = await generateImage(o);
      expect(asked[0]).toMatchObject({ priced: "bound", basis: expect.stringMatching(/^up to \$0\.128\d* \(priced per token: text input \$5\.00/) });
      // 4000 output tokens × $30/1M + 1 image × 1000 tokens × $8/1M + one token per prompt byte × $5/1M.
      expect(r.estimate.usd).toBeCloseTo(0.12 + 0.008 + Buffer.byteLength(o.prompt) * 5e-6, 6);
      await expect(generateImage(run({ maxPrice: 0.1 }).o)).rejects.toMatchObject({ code: "over-price" });
    } finally {
      delete tokens.outputTokensPerImage;
      delete tokens.inputTokensPerImage;
    }
  });
});
