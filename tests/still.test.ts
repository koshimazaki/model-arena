import { readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { planImage, KLEIN_9B, KLING_IMAGE_3 } from "../providers/runware-api/image.ts";
import { planTask } from "../providers/runware-api/task.ts";
import { findModel } from "../providers/runware-api/models.ts";
import { FIXED_UUID, frame, guide720 } from "./helpers.ts";

const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const validator = (slug: string) =>
  ajv.compile(JSON.parse(readFileSync(new URL(`./fixtures/runware-schemas/${slug}.schema.json`, import.meta.url), "utf8")).components.schemas.RequestBody);
const filled = (t: Record<string, unknown>) => JSON.parse(JSON.stringify(t).replace(/\{\{upload:[^}]*\}\}/g, "00000000-0000-4000-8000-0000000000ff"));
const expectValid = (slug: string, task: Record<string, unknown>) => {
  const v = validator(slug);
  v([filled(task)]);
  expect(v.errors ?? [], JSON.stringify(v.errors, null, 1)).toEqual([]);
};

const character = { ...frame, name: "character.png", displaySrc: "inputs/character.png" };

describe("image inference plans", () => {
  it("klein: text to image at 1280×720 matches the schema", () => {
    const p = planImage({ model: "klein-9b", prompt: "A figure in a grey jumpsuit." }, FIXED_UUID);
    expect(p.task).toMatchSnapshot();
    expectValid(KLEIN_9B.slug, p.task);
  });

  it("klein: pose-matched to the guide's first frame, sized from it", () => {
    const p = planImage({ model: "klein-9b", prompt: "Same pose as the reference.", reference: frame }, FIXED_UUID);
    expect(p.task).toMatchObject({ width: 1280, height: 720, inputs: { referenceImages: [expect.stringMatching(/^\{\{upload:1:/)] } });
    expect(p.uploads).toHaveLength(1);
    expectValid(KLEIN_9B.slug, p.task);
  });

  it("klein: snaps a reference size to multiples of 16 and refuses an off-grid size", () => {
    const odd = { ...frame, info: { width: 1023, height: 575 } };
    const p = planImage({ model: "klein-9b", prompt: "x", reference: odd });
    expect([p.task.width, p.task.height]).toEqual([1024, 576]);
    expect(p.notes.join(" ")).toMatch(/snapped/);
    expect(() => planImage({ model: "klein-9b", prompt: "x", width: 1000, height: 720 })).toThrow(/multiples of 16/);
  });

  it("kling image: a fixed pair without a reference, a resolution preset with one", () => {
    const t2i = planImage({ model: "kling-image-3", prompt: "A figure." }, FIXED_UUID);
    expect([t2i.task.width, t2i.task.height]).toEqual([1360, 768]);
    expectValid(KLING_IMAGE_3.slug, t2i.task);
    const ref = planImage({ model: "kling-image-3", prompt: "Same pose.", reference: frame }, FIXED_UUID);
    expect(ref.task).toMatchSnapshot();
    expect(ref.task.width).toBeUndefined();
    expectValid(KLING_IMAGE_3.slug, ref.task);
    expect(() => planImage({ model: "kling-image-3", prompt: "x", width: 1280, height: 720 })).toThrow(/sizes/);
    expect(() => planImage({ model: "kling-image-3", prompt: "x", resolution: "1K" })).toThrow(/reference/);
    expect(() => planImage({ model: "kling-image-3", prompt: "x".repeat(2501) })).toThrow(/2500/);
  });

  it("the schema check has teeth", () => {
    expect(validator(KLEIN_9B.slug)([{ taskType: "imageInference", taskUUID: FIXED_UUID, model: KLEIN_9B.air, positivePrompt: "x", width: 1000, height: 720 }])).toBe(false);
    expect(validator(KLING_IMAGE_3.slug)([{ taskType: "imageInference", taskUUID: FIXED_UUID, model: KLING_IMAGE_3.air, positivePrompt: "x", resolution: "1K" }])).toBe(false);
  });
});

describe("--character placement per model", () => {
  const plan = (model: string, extra = {}) =>
    planTask({ model, prompt: "Follow the guide.", guideVideo: guide720, character, duration: 5, ...extra }, FIXED_UUID);

  it("Kling 4.0: the character is a reference image beside the reference video", () => {
    const p = plan("kling-4");
    const inputs = (p.task as { inputs: Record<string, unknown[]> }).inputs;
    expect(Object.keys(inputs).sort()).toEqual(["referenceImages", "referenceVideos"]);
    expect(p.inputsSent.find((i) => i.role === "referenceImage")?.label).toBe("character.png");
    expectValid(findModel("kling-4").slug, p.task);
  });

  it("Kling 4.0 with a first frame too: frame image first, character as the reference (image 2)", () => {
    const inputs = (plan("kling-4", { firstFrame: frame }).task as { inputs: Record<string, unknown[]> }).inputs;
    expect(inputs.frameImages).toHaveLength(1);
    expect(inputs.referenceImages).toHaveLength(1);
  });

  for (const model of ["seedance-2.5", "h3"])
    it(`${model}: referenceImages, never frameImages, with the character first`, () => {
      const p = plan(model, { firstFrame: frame });
      const inputs = (p.task as { inputs: Record<string, unknown[]> }).inputs;
      expect(inputs.frameImages).toBeUndefined();
      expect(inputs.referenceImages).toHaveLength(2);
      expect(p.inputsSent.filter((i) => i.role === "referenceImage").map((i) => i.label)).toEqual(["character.png", "first-frame.png"]);
      expectValid(findModel(model).slug, p.task);
    });

  it("LTX and FLUX 3 Video refuse a character and say to use --first-frame", () => {
    expect(() => planTask({ model: "ltx-2.5", prompt: "a b", firstFrame: frame, character, duration: 6 })).toThrow(/--first-frame/);
    expect(() => planTask({ model: "flux-3-video", prompt: "a b", firstFrame: frame, character, duration: 5 })).toThrow(/--first-frame/);
  });
});

describe("make-still CLI against a fake API", () => {
  it("dry run sends nothing; a real run uploads, polls imageURL, saves still.png and a cost row", async () => {
    const { makeStillCli } = await import("../scripts/make-still.ts");
    const dir = await mkdtemp(join(tmpdir(), "ma-still-"));
    const costs = join(dir, "costs.md");
    await writeFile(costs, "| header |\n");
    const KEY = "test-key-not-real-0123456789";
    const sent: { url: string; body?: { taskType: string }[] }[] = [];
    const fake = (async (url: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : undefined;
      sent.push({ url, body });
      if (url === "https://im.runware.ai/still.png") return new Response(new Uint8Array([137, 80, 78, 71]));
      const task = body[0];
      const reply =
        task.taskType === "mediaStorage"
          ? { data: [{ taskUUID: task.taskUUID, mediaUUID: "11111111-1111-4111-8111-000000000001" }] }
          : task.taskType === "imageInference"
            ? { data: [{ taskType: "imageInference", taskUUID: task.taskUUID }] }
            : { data: [{ taskType: "imageInference", taskUUID: task.taskUUID, status: "success", imageURL: "https://im.runware.ai/still.png", cost: 0.0012 }] };
      return new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const args = ["--model", "klein-9b", "--prompt", "Same pose as the reference.", "--reference", join(process.cwd(), "tests/fixtures/tiny-320x180.png")];
    let printed = "";
    const deps = { fetch: fake, key: KEY, costsFile: costs, write: (t: string) => (printed += t), poll: { sleep: async () => {}, initialDelayMs: 0 } };

    await makeStillCli([...args, "--dry-run"], deps);
    expect(sent).toHaveLength(0);
    expect(printed).toContain("Dry run: nothing was sent.");

    await expect(makeStillCli(args, deps)).rejects.toThrow(/--max-price/);
    await makeStillCli([...args, "--max-price", "0.01", "--yes", "--out", dir], deps);
    expect(sent.map((s) => s.body?.[0]?.taskType ?? "download")).toEqual(["mediaStorage", "imageInference", "getResponse", "download"]);
    const [folder] = (await readdir(dir)).filter((n) => n.includes("still-klein-9b"));
    expect(await readFile(join(dir, folder!, "still.png"))).toHaveLength(4);
    const row = await readFile(costs, "utf8");
    expect(row).toContain("runware:400@2");
    expect(row).toContain("$0.0012");
    expect(printed + row).not.toContain(KEY);
  });

  it("a token-priced model needs --allow-unpriced, is capped by the highest published example, and records the reported cost", async () => {
    const { makeStillCli } = await import("../scripts/make-still.ts");
    const dir = await mkdtemp(join(tmpdir(), "ma-still-"));
    const costs = join(dir, "costs.md");
    await writeFile(costs, "| header |\n");
    const sent: string[] = [];
    const fake = (async (url: string, init?: { body?: string }) => {
      if (url === "https://im.runware.ai/still.png") return new Response(new Uint8Array([137, 80, 78, 71]));
      const task = JSON.parse(init!.body!)[0];
      sent.push(task.taskType);
      if (task.taskType === "imageInference") expect(task.includeCost).toBe(true);
      const reply =
        task.taskType === "imageInference"
          ? { data: [{ taskType: "imageInference", taskUUID: task.taskUUID }] }
          : { data: [{ taskType: "imageInference", taskUUID: task.taskUUID, status: "success", imageURL: "https://im.runware.ai/still.png", cost: 0.031 }] };
      return new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    let printed = "";
    const deps = { fetch: fake, key: "test-key-not-real-0123456789", costsFile: costs, write: (t: string) => (printed += t), poll: { sleep: async () => {}, initialDelayMs: 0 } };
    const args = ["--model", "h3-image", "--prompt", "A courier.", "--yes", "--out", dir];
    await expect(makeStillCli([...args, "--max-price", "1"], deps)).rejects.toThrow(/--allow-unpriced/);
    await expect(makeStillCli([...args, "--max-price", "0.04", "--allow-unpriced"], deps)).rejects.toThrow(/highest published example, \$0\.0432/);
    expect(sent).toHaveLength(0);
    await makeStillCli([...args, "--max-price", "0.05", "--allow-unpriced"], deps);
    expect(printed).toMatch(/No published bound/);
    expect(sent).toEqual(["imageInference", "getResponse"]);
    const row = await readFile(costs, "utf8");
    expect(row).toContain("minimax:h3@image");
    expect(row).toContain("$0.0310");
  });
});
