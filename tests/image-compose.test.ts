import { describe, expect, it } from "vitest";
import { generateImage } from "../providers/runware-api/generate-image.ts";
import { composeImagePrompt, type ComposeImageInput } from "../providers/runware-api/image-compose.ts";
import { imageGuides } from "../providers/runware-api/image-guides.ts";
import { IMAGE_MODELS, planImage } from "../providers/runware-api/image.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll } from "./embed-helpers.ts";

const COURIER = "a courier in her twenties in a yellow raincoat, black boots and a grey messenger bag";
const CROSSING = "a rain-soaked pedestrian crossing in a city centre";
const env = (model: string, references: ComposeImageInput["references"] = []): ComposeImageInput => ({
  model,
  kind: "environment",
  subject: CROSSING,
  light: "blue dusk light after rain, wet asphalt reflecting the street lamps",
  camera: "at eye level, about 1.6 m above the ground",
  references,
});
const sheet = (model: string, references: ComposeImageInput["references"] = []): ComposeImageInput => ({ model, kind: "character", subject: COURIER, style: "flat cel-shaded animation", references });
const NO_EXCLUSIONS = /\bno (text|people|logos|labels)\b/i;

describe("image prompt guides", () => {
  it("every image model has a guide entry: a Runware guide URL or 'no model guide published', and three or four short tips", () => {
    const guides = imageGuides();
    expect(guides.map((x) => x.key).sort()).toEqual(IMAGE_MODELS.map((m) => m.key).sort());
    for (const x of guides) {
      expect(x.guide.read).toBe("13 Nov 2026");
      if (x.guide.url) expect(x.guide.url).toMatch(/^https:\/\/runware\.ai\/docs\/models\/[a-z0-9-]+\/guides\/[a-z-]+$/);
      else expect(x.guide.note).toBe("no model guide published");
      expect(x.tips.length).toBeGreaterThanOrEqual(3);
      expect(x.tips.length).toBeLessThanOrEqual(4);
      for (const t of x.tips) expect(t.length).toBeLessThanOrEqual(110);
    }
    expect(guides.filter((x) => !x.guide.url).map((x) => x.key)).toEqual(["klein-9b", "kling-image-3"]);
    expect(guides.find((x) => x.key === "h3-image-highspeed")!.guide.note).toMatch(/same requests/);
  });
});

describe("composeImagePrompt", () => {
  it("is deterministic, stays within each model's prompt limit and plans for every model, kind and reference set", () => {
    for (const m of IMAGE_MODELS) {
      const refs: ComposeImageInput["references"] = m.references.max === 1 ? [{ role: "character" }] : [{ role: "character" }, { role: "environment" }];
      for (const input of [sheet(m.key), sheet(m.key, refs), env(m.key), env(m.key, refs), { model: m.key, kind: "free" as const, subject: "A paper lantern on a windowsill at night", references: refs }]) {
        const a = composeImagePrompt(input);
        expect(composeImagePrompt(input)).toEqual(a);
        expect(a.prompt.length).toBeLessThanOrEqual(m.prompt.max);
        expect(a.prompt).not.toMatch(/\s{2}|\.\.|\s[,.]/);
        expect(() => planImage({ model: m.key, prompt: a.prompt })).not.toThrow();
      }
    }
  });

  it("snapshots: a character sheet and an environment view per model, with and without references", () => {
    const out: Record<string, string> = {};
    for (const m of IMAGE_MODELS) {
      const refs: ComposeImageInput["references"] = m.references.max === 1 ? [{ role: "character" }] : [{ role: "character", note: "a rough pencil sketch" }, { role: "environment" }];
      out[`${m.key} character`] = composeImagePrompt(sheet(m.key)).prompt;
      out[`${m.key} character + refs`] = composeImagePrompt(sheet(m.key, refs)).prompt;
      out[`${m.key} environment`] = composeImagePrompt(env(m.key)).prompt;
      out[`${m.key} environment + refs`] = composeImagePrompt(env(m.key, m.references.max === 1 ? [{ role: "environment" }] : [{ role: "environment" }, { role: "character" }])).prompt;
    }
    expect(out).toMatchSnapshot();
  });

  it("GPT-Image-2.6: deliverable first, a roll call for references, a keep list, exclusions last", () => {
    expect(composeImagePrompt(sheet("gpt-image-2.6-flare")).prompt).toMatch(/^A character reference sheet.*Three full-body views.*No text, no labels and no logos\.$/);
    const r = composeImagePrompt(sheet("gpt-image-2.6-sunburst", [{ role: "character" }, { role: "environment" }])).prompt;
    expect(r).toMatch(/^Image 1 is the character to show and image 2 is a style reference/);
    expect(r).toMatch(/Keep the face, hair, build and clothing of the character from image 1 exactly as it is\. No text/);
  });

  it("MiniMax H3: task first, references by number and noun, what may change, exclusions last, and a size note", () => {
    const r = composeImagePrompt(env("h3-image", [{ role: "environment" }, { role: "character" }]));
    expect(r.prompt).toMatch(/^Use image 1 as the place to show and image 2 as a style reference/);
    expect(r.prompt).toMatch(/Relight the place from image 1 with blue dusk light.*Keep the layout, architecture and materials from image 1.*The camera position can change\. No people and no text\.$/);
    expect(r.notes.join(" ")).toMatch(/send a size or 1K\/2K/);
    expect(composeImagePrompt(sheet("h3-image-highspeed", [{ role: "character" }])).prompt).toMatch(/The pose and framing can change/);
  });

  it("Seedream 5.5: a brief with its clauses, image 1 kept, and a note when the character is not image 1", () => {
    const r = composeImagePrompt(sheet("seedream-5.5", [{ role: "environment" }, { role: "character" }]));
    expect(r.prompt).toMatch(/The subject is .*The setting is .*The light is .*lens.*Framing: .*Keep the face, hair, build and clothing of the character from image 2/);
    expect(r.notes.join(" ")).toMatch(/send the character reference first/);
    expect(r.notes.join(" ")).toMatch(/send width and height/);
  });

  it("FLUX 3 Image: subject first, no exclusions, references given jobs, the scene's light wins", () => {
    for (const input of [sheet("flux-3-image"), env("flux-3-image"), env("flux-3-image", [{ role: "environment" }])]) expect(composeImagePrompt(input).prompt).not.toMatch(NO_EXCLUSIONS);
    expect(composeImagePrompt(sheet("flux-3-image")).prompt).toMatch(/^A courier .*contact shadow/);
    expect(composeImagePrompt(env("flux-3-image", [{ role: "environment" }])).prompt).toMatch(/^Image 1 supplies the place to show\..*The light of the scene wins/);
  });

  it("FLUX 3 Image Klein: framing first, a style line last, absences as states, the scene image named", () => {
    const s = composeImagePrompt(sheet("flux-3-image-klein", [{ role: "character", note: "a pencil sketch" }])).prompt;
    expect(s).toMatch(/^A wide landscape frame showing three full-body views.*The subject is the character from image 1, a pencil sketch.*Style: flat cel-shaded animation\.$/);
    expect(s).not.toMatch(NO_EXCLUSIONS);
    expect(composeImagePrompt(env("flux-3-image-klein", [{ role: "environment" }])).prompt).toMatch(/Use image 1 as the scene/);
  });

  it("no published guide: plain clauses, Kling's single reference named as 'the reference image'", () => {
    const k = composeImagePrompt(env("kling-image-3", [{ role: "environment" }]));
    expect(k.prompt).toMatch(/^The reference image is the place to show\./);
    expect(k.notes.join(" ")).toMatch(/no model guide published/);
  });

  it("refuses too many references, an empty subject and a prompt over the model's limit; notes a missing light or camera", () => {
    expect(() => composeImagePrompt(sheet("kling-image-3", [{ role: "character" }, { role: "environment" }]))).toThrow(/one reference image; got 2/);
    expect(() => composeImagePrompt({ model: "flux-3-image-klein", kind: "free", subject: "x", references: Array.from({ length: 5 }, () => ({ role: "other" as const })) })).toThrow(/up to 4/);
    expect(() => composeImagePrompt({ model: "seedream-5.5", kind: "character", subject: "  " })).toThrow(/Describe the subject/);
    expect(() => composeImagePrompt({ model: "kling-image-3", kind: "character", subject: "a".repeat(2600) })).toThrow(/up to 2500/);
    const bare = composeImagePrompt({ model: "seedream-5.5", kind: "environment", subject: CROSSING });
    expect(bare.notes.join(" ")).toMatch(/No light or time of day.*No camera height/);
  });
});

describe("a composed prompt through the fake provider, one model per family", () => {
  const FAMILY_MODELS = ["flux-3-image", "gpt-image-2.6-flare", "h3-image", "seedream-5.5", "kling-image-3"];
  for (const model of FAMILY_MODELS)
    for (const withRef of [false, true])
      it(`${model} ${withRef ? "with a character reference" : "without a reference"}: the task carries the composed prompt`, async () => {
        const composed = composeImagePrompt(withRef ? env(model, [{ role: "character" }]) : sheet(model));
        const api = fakeRunware({ imageURL: "https://im.runware.ai/image/x.png", cost: 0.02 });
        const r = await generateImage({
          model,
          prompt: composed.prompt,
          references: withRef ? [characterPng(1024, 1024)] : [],
          maxPrice: 1,
          allowUnpriced: true,
          key: FAKE_KEY,
          confirm: () => true,
          fetch: api.fetch,
          poll: fastPoll,
        });
        expect(api.tasks("imageInference")[0]!.positivePrompt).toBe(composed.prompt);
        expect(api.tasks("mediaStorage")).toHaveLength(withRef ? 1 : 0);
        expect(r.imageURL).toBe("https://im.runware.ai/image/x.png");
      });
});
