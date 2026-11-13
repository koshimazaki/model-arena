// @vitest-environment happy-dom
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArenaRecord } from "../packages/core/src/record.ts";
import type { ArenaGallery } from "../packages/element/src/gallery.ts";
import type { ArenaGenerate } from "../packages/element/src/generate/arena-generate.ts";
import type { ArenaKey } from "../packages/element/src/key-panel.ts";
import type { ModelArena } from "../packages/element/src/model-arena.ts";
import { needsSeek, type ArenaPlayer } from "../packages/element/src/player.ts";
import { generateFromGuide } from "../providers/runware-api/generate.ts";
import { composePrompt, offeredModels } from "../providers/runware-api/guide-plan.ts";
import { runLaneCli } from "../scripts/run-lane.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll, makeBundle, SHOT } from "./embed-helpers.ts";

beforeAll(async () => {
  await import("../packages/element/src/embed.ts");
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(test: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await tick(5);
  }
}

function connectedKey(): ArenaKey {
  const k = document.createElement("arena-key") as ArenaKey;
  document.body.append(k);
  expect(k.connect(FAKE_KEY)).toBeNull();
  return k;
}

/** Placeholders and media ids to U<n>, the task UUID to T. */
const normal = (task: unknown) =>
  JSON.parse(
    JSON.stringify(task)
      .replace(/\{\{upload:(\d+):[^}]*\}\}/g, "U$1")
      .replace(/00000000-0000-4000-8000-0*(\d+)/g, "U$1")
      .replace(/"taskUUID":"[^"]+"/, '"taskUUID":"T"'),
  );

describe("the CLI and the element send the same task for the same bundle", () => {
  for (const model of ["kling-4", "seedance-2.5", "h3"]) {
    it(`${model}, with a character sheet and an environment image`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "ma-bundle-"));
      const files = makeBundle();
      for (const [name, blob] of Object.entries(files)) writeFileSync(join(dir, name), new Uint8Array(await blob.arrayBuffer()));
      const character = characterPng();
      const environment = new File([await characterPng(1280, 720).arrayBuffer()], "environment.png", { type: "image/png" });
      const refDir = mkdtempSync(join(tmpdir(), "ma-refs-"));
      writeFileSync(join(refDir, "character-sheet.png"), new Uint8Array(await character.arrayBuffer()));
      writeFileSync(join(refDir, "environment.png"), new Uint8Array(await environment.arrayBuffer()));

      let out = "";
      await runLaneCli(["--model", model, "--bundle", dir, "--character", join(refDir, "character-sheet.png"), "--environment", join(refDir, "environment.png"), "--dry-run"], { write: (t) => (out += t) });
      expect(out).toContain("Composer:  prompt written for");
      expect(out).toMatch(/Estimate:\s+\$\d/);
      const cliTask = JSON.parse(out.slice(out.indexOf("[", out.indexOf("Task (POST")), out.indexOf("Dry run:")).trim())[0];

      connectedKey();
      const g = document.createElement("arena-generate") as ArenaGenerate;
      const api = fakeRunware();
      g.fetch = api.fetch;
      g.pollOptions = fastPoll;
      g.confirm = () => true;
      g.setAttribute("model", model);
      document.body.append(g);
      g.guide = Object.entries(files).map(([n, b]) => new File([b], n, { type: b.type }));
      g.references = { character, environment };
      await g.whenReady();
      await until(() => Boolean(g.guide));
      (g.shadowRoot!.querySelector('[data-action="run"]') as HTMLButtonElement).click();
      await until(() => api.tasks("videoInference").length > 0);
      expect(normal(api.tasks("videoInference")[0])).toEqual(normal(cliTask));
    });
  }
});

describe("parts for a host that draws its own controls", () => {
  it("offeredModels and composePrompt give the prompt, its tags and the notes", () => {
    expect(offeredModels().map((m) => m.key)).toEqual(["kling-4", "seedance-2.5", "h3", "ltx-2.5"]);
    const c = composePrompt(SHOT, "kling-4", { character: true, environment: true }, { seconds: 8, hasAudio: true });
    expect(c.tags).toEqual([
      { tag: "<<<video_1>>>", input: "guide" },
      { tag: "<<<image_1>>>", input: "character" },
      { tag: "<<<image_2>>>", input: "environment" },
    ]);
    expect(c.dropped.join(" ")).toContain("takes no reference audio");
    expect(c.shot.duration).toBe(8);
    expect(() => composePrompt(SHOT, "ltx-2.5", { character: true, environment: true })).toThrow(/not both/);
  });

  it("generateFromGuide reads the key by reference from the panel, at request time", async () => {
    const panel = connectedKey();
    const getKey = vi.spyOn(panel, "getKey");
    const api = fakeRunware();
    const r = await generateFromGuide({ guide: makeBundle(), model: "h3", maxPrice: 3, key: panel, confirm: () => true, fetch: api.fetch, poll: fastPoll });
    expect(getKey).toHaveBeenCalled();
    expect(api.calls[0]!.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
    expect(panel.getAttributeNames().join(" ") + panel.shadowRoot!.innerHTML).not.toContain(FAKE_KEY);
  });

  it("<arena-player> follows the host's clock within a frame and can drop its controls", () => {
    expect(needsSeek(1.0, 1.03, false)).toBe(false);
    expect(needsSeek(1.0, 1.05, false)).toBe(true);
    expect(needsSeek(1.0, 1.01, true)).toBe(true);
    const p = document.createElement("arena-player") as ArenaPlayer;
    p.setAttribute("src", "out/clip.mp4");
    p.setAttribute("controls", "none");
    document.body.append(p);
    expect(p.video.controls).toBe(false);
    expect(p.video.muted).toBe(true);
    expect(p.video.getAttribute("src")).toMatch(/\/out\/clip\.mp4$/);
    p.currentTime = 2.5;
    expect(p.video.currentTime).toBe(2.5);
    p.setAttribute("muted", "false");
    expect(p.muted).toBe(false);
  });
});

async function sampleRecord(): Promise<ArenaRecord> {
  const api = fakeRunware({ videoURL: "https://vm.runware.ai/video/a.mp4" });
  const r = await generateFromGuide({
    guide: makeBundle(),
    model: "seedance-2.5",
    maxPrice: 5,
    key: FAKE_KEY,
    confirm: () => true,
    fetch: api.fetch,
    poll: fastPoll,
    references: { character: characterPng(), environment: { blob: characterPng(1280, 720), name: "environment.png" } },
  });
  const r2 = { ...r.record.lanes[0]!, id: "lane-2", output: { src: "out/b.mp4" } };
  return { ...r.record, lanes: [r.record.lanes[0]!, r2] };
}

describe("<arena-gallery> shows the inputs beside the outputs", () => {
  it("strip of reference images, guide plus outputs on one playhead, the guide's audio once, clip sound toggle", async () => {
    const record = await sampleRecord();
    const g = document.createElement("arena-gallery") as ArenaGallery;
    document.body.append(g);
    g.add(record, "https://host.example/runs/one/");
    const arena = g.shadowRoot!.querySelector("model-arena") as ModelArena;
    expect(arena.getAttribute("layout")).toBe("inputs");
    const root = arena.shadowRoot!;
    expect([...root.querySelectorAll(".ref-strip li span")].map((s) => s.textContent)).toEqual(["Character sheet", "Environment"]);
    expect([...root.querySelectorAll(".ref-strip img")].map((i) => i.getAttribute("src"))).toEqual(["https://host.example/runs/one/character-sheet.png", "https://host.example/runs/one/environment.png"]);
    const videos = [...root.querySelectorAll(".inputs-row video")] as HTMLVideoElement[];
    expect(videos).toHaveLength(3);
    expect(root.querySelectorAll('input[type="range"]')).toHaveLength(1);
    const audio = root.querySelectorAll("audio");
    expect(audio).toHaveLength(1);
    expect(audio[0]!.getAttribute("src")).toBe("https://host.example/runs/one/audio.wav");
    expect(videos.every((v) => v.muted)).toBe(true);
    expect(audio[0]!.muted).toBe(false);
    (root.querySelector('[data-action="clip-sound"]') as HTMLButtonElement).click();
    expect(videos.slice(1).every((v) => !v.muted)).toBe(true);
    expect(audio[0]!.muted).toBe(true);
    expect(root.querySelectorAll(".lane-prompt pre")[0]!.textContent).toContain("@Image2 is the setting");
  });

  it("Run this yourself opens the record in <arena-generate> as a preset", async () => {
    const record = await sampleRecord();
    const g = document.createElement("arena-gallery") as ArenaGallery;
    g.setAttribute("generate", "gen");
    document.body.append(g);
    g.add(record, "https://host.example/runs/one/");
    const target = Object.assign(document.createElement("div"), { id: "gen", loadPreset: vi.fn(async () => {}) });
    document.body.append(target);
    const seen: unknown[] = [];
    g.addEventListener("arena-run-yourself", (e) => seen.push((e as CustomEvent).detail.preset));
    (g.shadowRoot!.querySelector('[data-action="run-yourself"]') as HTMLButtonElement).click();
    const preset = {
      bundle: "https://host.example/runs/one/",
      model: "seedance-2.5",
      shot: expect.objectContaining({ subject: SHOT.subject, legend: SHOT.legend }),
      references: { character: "https://host.example/runs/one/character-sheet.png", environment: "https://host.example/runs/one/environment.png" },
    };
    expect(seen[0]).toEqual(preset);
    expect(target.loadPreset).toHaveBeenCalledWith(seen[0]);
  });
});

describe("<arena-generate> presets and host references", () => {
  function serve(files: Record<string, Blob>, prefix: string) {
    vi.stubGlobal("fetch", async (url: string) => {
      const name = String(url).startsWith(prefix) ? String(url).slice(prefix.length) : "";
      const b = files[name];
      return b ? new Response(b) : new Response("missing", { status: 404 });
    });
  }

  it("opens with a preset already loaded: bundle, references, shot and model", async () => {
    const files = { ...makeBundle({ shot: null }), "character.png": characterPng(), "environment.png": characterPng(1280, 720) };
    serve(files, "https://host.example/b/");
    connectedKey();
    const g = document.createElement("arena-generate") as ArenaGenerate;
    document.body.append(g);
    await g.loadPreset({ bundle: "b/", references: { character: "b/character.png", environment: "b/environment.png" }, shot: { subject: "A paper boat", action: "sails the path" }, model: "h3" }, "https://host.example/");
    const root = g.shadowRoot!;
    expect((root.querySelector('[data-field="subject"]') as HTMLInputElement).value).toBe("A paper boat");
    expect((root.querySelector('input[data-model="h3"]') as HTMLInputElement).checked).toBe(true);
    expect(root.querySelector('[data-ref="character"] img')).not.toBeNull();
    expect(root.querySelector('[data-ref="environment"] img')).not.toBeNull();
    expect(root.querySelector("[data-estimate]")!.textContent).toContain("referenceImage character.png, referenceImage environment.png");
    expect(g.guide?.guide.video.src).toBe("https://host.example/b/guide.mp4");
  });

  it("refuses a malformed preset with a message", async () => {
    const g = document.createElement("arena-generate") as ArenaGenerate;
    document.body.append(g);
    await g.loadPreset({ bundle: "javascript:alert(1)" });
    expect(g.shadowRoot!.querySelector(".err")!.textContent).toContain("preset.bundle");
  });
});
