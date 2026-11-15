import { describe, expect, it } from "vitest";
import { generateImage, type GenerateImageOptions } from "../providers/runware-api/generate-image.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll } from "./embed-helpers.ts";

const IMAGE = "https://im.runware.ai/image/still.png";

function opts(extra: Partial<GenerateImageOptions> = {}) {
  const api = fakeRunware({ imageURL: IMAGE, cost: 0.035, processing: 1 });
  const asked: unknown[] = [];
  const o: GenerateImageOptions = {
    model: "seedream-5.5",
    prompt: "A character sheet of a courier in a yellow raincoat, front, side and back.",
    maxPrice: 0.5,
    key: { getKey: () => FAKE_KEY },
    confirm: (q) => (asked.push(q), true),
    fetch: api.fetch,
    poll: fastPoll,
    taskUUID: "00000000-0000-4000-8000-000000000009",
    ...extra,
  };
  return { o, api, asked };
}

describe("generateImage", () => {
  it("checks, asks, uploads, submits and polls imageURL; the key goes only into the header", async () => {
    const stages: string[] = [];
    const { o, api, asked } = opts({
      references: [characterPng(), { blob: characterPng(1280, 720), src: "https://host.example/env.png", name: "env.png" }],
      onProgress: (p) => stages.push(p.stage),
    });
    const r = await generateImage(o);
    expect(r).toMatchObject({ imageURL: IMAGE, costUsd: 0.035, modelRan: "bytedance:seedream@5.5", taskUUID: "00000000-0000-4000-8000-000000000009" });
    expect(r.estimate.usd).toBe(0.036); // $0.02 per image + 2 × $0.008 per input image
    expect(r.inputsSent.map((i) => i.src)).toEqual(["character-sheet.png", "https://host.example/env.png"]);
    expect(r.notes.join(" ")).toMatch(/sent as given: none resized or dropped/);
    expect(r.notes.join(" ")).toMatch(/Output size \d+×\d+, fitted to the model's size rule from character-sheet\.png's 768×1024/);
    expect(api.tasks("mediaStorage")).toHaveLength(2);
    expect(api.tasks("imageInference")[0]).toMatchObject({ model: "bytedance:seedream@5.5", inputs: { referenceImages: [expect.stringMatching(/^0{8}-/), expect.stringMatching(/^0{8}-/)] } });
    expect(asked).toHaveLength(1);
    expect(stages).toEqual(expect.arrayContaining(["plan", "confirm", "upload", "submit", "poll", "done"]));
    expect(r.costRowText).toContain("ok (browser)");
    for (const c of api.calls) {
      expect(c.url).toBe("https://api.runware.ai/v1");
      expect(c.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
      expect(JSON.stringify(c.tasks)).not.toContain(FAKE_KEY);
    }
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });

  it("takes an https URL as a reference without uploading it, and says its size was not checked", async () => {
    const { o, api } = opts({ model: "flux-3-image", references: ["https://host.example/sheet.png"], key: FAKE_KEY });
    const r = await generateImage(o);
    expect(api.tasks("mediaStorage")).toHaveLength(0);
    expect(api.tasks("imageInference")[0]).toMatchObject({ resolution: "1K", inputs: { referenceImages: ["https://host.example/sheet.png"] } });
    expect(r.notes.join(" ")).toMatch(/not checked/);
  });

  it("refuses before sending anything: too many references, a small one, a bad type, a bad size, over the cap", async () => {
    const cases: [Partial<GenerateImageOptions>, string, RegExp][] = [
      [{ model: "kling-image-3", references: [characterPng(), characterPng()] }, "refused", /one reference image; got 2/],
      [{ model: "h3-image", references: [characterPng(100, 100)] }, "refused", /at least 128 px/],
      [{ references: [new Blob(["x"], { type: "text/plain" })] }, "refused", /PNG, JPEG or WebP/],
      [{ references: ["http://host.example/a.png"] }, "refused", /https/],
      [{ model: "flux-3-image", size: { width: 1280, height: 720 } }, "refused", /sizes/],
      [{ model: "flux-3-image", size: { resolution: "4K" }, references: [characterPng()], maxPrice: 0.5 }, "over-price", /\$0\.6070/],
      [{ model: "nope" }, "refused", /Unknown image model/],
      [{ maxPrice: 0 }, "refused", /maxPrice/],
    ];
    for (const [extra, code, msg] of cases) {
      const { o, api, asked } = opts(extra);
      await expect(generateImage(o)).rejects.toMatchObject({ code, message: expect.stringMatching(msg) });
      expect(api.calls).toHaveLength(0);
      expect(asked).toHaveLength(0);
    }
  });

  it("token-priced models are refused for want of an estimate; a declined confirm sends nothing", async () => {
    const t = opts({ model: "gpt-image-2.6-flare" });
    await expect(generateImage(t.o)).rejects.toMatchObject({ code: "no-estimate", message: expect.stringMatching(/per token/) });
    expect(t.api.calls).toHaveLength(0);
    const n = opts({ confirm: () => false });
    await expect(generateImage(n.o)).rejects.toMatchObject({ code: "not-confirmed" });
    expect(n.api.calls).toHaveLength(0);
  });

  it("a missing or refused key is invalid-key, and the key is not in the message", async () => {
    await expect(generateImage(opts({ key: () => undefined }).o)).rejects.toMatchObject({ code: "invalid-key" });
    const api = fakeRunware({ status: 401 });
    const err = await generateImage({ ...opts().o, fetch: api.fetch }).catch((e) => e);
    expect(err.code).toBe("invalid-key");
    expect(String(err.message)).not.toContain(FAKE_KEY);
  });

  it("an abort while polling says the task may still be billed", async () => {
    const ac = new AbortController();
    const api = fakeRunware({ imageURL: IMAGE, processing: -1 });
    const err = await generateImage({ ...opts().o, fetch: api.fetch, signal: ac.signal, onProgress: (p) => p.stage === "poll" && ac.abort() }).catch((e) => e);
    expect(err.code).toBe("aborted");
    expect(err.message).toMatch(/may still finish and be billed/);
  });
});
