// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ArenaGenerate } from "../packages/element/src/generate/arena-generate.ts";
import type { ArenaGallery } from "../packages/element/src/gallery.ts";
import type { ArenaKey } from "../packages/element/src/key-panel.ts";
import type { ModelArena } from "../packages/element/src/model-arena.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll, makeBundle } from "./embed-helpers.ts";

beforeAll(async () => {
  await import("../packages/element/src/embed.ts");
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(test: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await tick(5);
  }
}

function keyPanel(): ArenaKey {
  const k = document.createElement("arena-key") as ArenaKey;
  document.body.append(k);
  return k;
}

function typeKey(k: ArenaKey, value: string, remember = false) {
  const root = k.shadowRoot!;
  (root.querySelector('[data-field="key"]') as HTMLInputElement).value = value;
  (root.querySelector('[data-field="remember"]') as HTMLInputElement).checked = remember;
  (root.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { cancelable: true }));
}

describe("<arena-key>", () => {
  it("is a password field labelled as staying in the browser, with a get-a-key link", () => {
    const root = keyPanel().shadowRoot!;
    expect((root.querySelector('[data-field="key"]') as HTMLInputElement).type).toBe("password");
    expect(root.textContent).toContain("stays in your browser and is sent only to api.runware.ai");
    expect(root.querySelector("a")?.textContent).toBe("Get a key");
  });

  it("refuses a malformed key with a reason and sends no event", () => {
    const k = keyPanel();
    const seen: unknown[] = [];
    k.addEventListener("arena-key-change", (e) => seen.push((e as CustomEvent).detail));
    typeKey(k, "has a space in it 1234567890");
    expect(k.shadowRoot!.querySelector(".err")?.textContent).toContain("no spaces");
    typeKey(k, "short");
    expect(k.shadowRoot!.querySelector(".err")?.textContent).toContain("too short");
    expect(k.connected).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("connects into memory by default, never exposes the key, and disconnects", () => {
    const k = keyPanel();
    const seen: unknown[] = [];
    k.addEventListener("arena-key-change", (e) => seen.push((e as CustomEvent).detail));
    typeKey(k, FAKE_KEY);
    expect(k.connected).toBe(true);
    expect(k.getKey()).toBe(FAKE_KEY);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(seen)).not.toContain(FAKE_KEY);
    expect(k.shadowRoot!.innerHTML).not.toContain(FAKE_KEY);
    expect(k.outerHTML).not.toContain(FAKE_KEY);
    expect(location.href).not.toContain(FAKE_KEY);
    k.disconnect();
    expect(k.connected).toBe(false);
  });

  it("keeps the key in sessionStorage only behind the explicit tick", () => {
    const k = keyPanel();
    typeKey(k, FAKE_KEY, true);
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
    expect(keyPanel().connected).toBe(true);
    k.disconnect();
    expect(sessionStorage.length).toBe(0);
  });
});

async function mountGenerate(attrs: Record<string, string> = {}) {
  const key = keyPanel();
  typeKey(key, FAKE_KEY);
  const g = document.createElement("arena-generate") as ArenaGenerate;
  for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v);
  const api = fakeRunware();
  g.fetch = api.fetch;
  g.pollOptions = fastPoll;
  document.body.append(g);
  g.guide = makeBundle();
  await until(() => Boolean(g.guide));
  return { g, root: g.shadowRoot!, api };
}

describe("<arena-generate>", () => {
  it("offers Kling 4.0 first, then Seedance 2.5, MiniMax H3 and LTX-2.5 marked audio + first frame only", async () => {
    const { root } = await mountGenerate();
    const keys = [...root.querySelectorAll("input[data-model]")].map((r) => (r as HTMLInputElement).value);
    expect(keys).toEqual(["kling-4", "seedance-2.5", "h3", "ltx-2.5"]);
    expect((root.querySelector('input[data-model="kling-4"]') as HTMLInputElement).checked).toBe(true);
    const ltx = root.querySelector('input[data-model="ltx-2.5"]')!.closest("label")!;
    expect(ltx.textContent).toContain("audio + first frame only");
    expect(ltx.textContent).toContain("does not use the guide video");
    expect(root.textContent).not.toMatch(/FLUX/);
  });

  it("fills the shot from recipe.json and previews the composed prompt with tags, guide link and a comparison", async () => {
    const { root } = await mountGenerate();
    expect((root.querySelector('[data-field="subject"]') as HTMLInputElement).value).toBe("A courier in a yellow raincoat");
    expect((root.querySelector('[data-field="legend"]') as HTMLInputElement).value).toBe("The orange figure is the character");
    const pre = root.querySelector('[data-preview] .prompt-card:not(.compact) pre')!;
    expect(pre.textContent).toContain("<<<video_1>>>");
    expect(root.querySelector("[data-preview]")!.textContent).toContain("Reference tags: <<<video_1>>> = the guide clip");
    expect(root.querySelector('[data-preview] a[href*="runware.ai/docs/models/klingai-video-4-0/guides/prompting"]')).not.toBeNull();
    const compare = root.querySelector("details.compare")!;
    expect(compare.querySelector("summary")!.textContent).toBe("Compare prompts");
    expect([...compare.querySelectorAll(".prompt-card")].map((c) => c.getAttribute("data-model"))).toEqual(["kling-4", "seedance-2.5", "h3"]);
    expect(compare.textContent).toContain("@Video1");
    expect(compare.textContent).toContain("Video 1 is the motion reference");
    expect(root.querySelector("[data-estimate]")!.textContent).toMatch(/^Estimated \$0\.94/);
  });

  it("an attribute shot wins over the recipe, and prompt= replaces the composed prompt", async () => {
    const { root } = await mountGenerate({ subject: "A paper boat", prompt: "Exactly these words." });
    expect((root.querySelector('[data-field="subject"]') as HTMLInputElement).value).toBe("A paper boat");
    expect(root.querySelector("[data-preview] pre")!.textContent).toBe("Exactly these words.");
  });

  it("runs end to end on the fake provider: confirm, result on one clock, caption, download, add to gallery", async () => {
    const { g, root, api } = await mountGenerate();
    const added: unknown[] = [];
    const results: unknown[] = [];
    g.addEventListener("arena-gallery-add", (e) => added.push((e as CustomEvent).detail.record));
    g.addEventListener("arena-generate-result", (e) => results.push((e as CustomEvent).detail));
    (root.querySelector('[data-action="run"]') as HTMLButtonElement).click();
    await until(() => Boolean(root.querySelector('[data-action="confirm"]')));
    expect(api.calls).toHaveLength(0);
    (root.querySelector('[data-action="confirm"]') as HTMLButtonElement).click();
    await until(() => Boolean(root.querySelector("[data-caption]")));
    for (const c of api.calls) expect(new URL(c.url).host).toBe("api.runware.ai");
    const caption = root.querySelector("[data-caption]")!.textContent!;
    expect(caption).toContain("Inputs sent: reference video guide.mp4");
    expect(caption).toContain("Cost: $0.940 reported");
    expect(caption).toMatch(/Seconds: \d+\.\d s to generate/);
    expect((root.querySelector('[data-action="download"]') as HTMLAnchorElement).href).toBe("https://vm.runware.ai/video/out.mp4");
    const arena = root.querySelector("model-arena") as ModelArena;
    expect(arena.getAttribute("layout")).toBe("guidance");
    expect(arena.record?.guide?.video.src).toMatch(/^blob:/);
    expect(arena.shadowRoot!.querySelectorAll(".screen video")).toHaveLength(2);
    (root.querySelector('[data-action="add"]') as HTMLButtonElement).click();
    expect(added).toHaveLength(1);
    expect(root.querySelector('[data-action="record-json"]')).not.toBeNull();
    expect(JSON.stringify([added, results])).not.toContain(FAKE_KEY);
  });

  it("shows a refusal for a character sheet the model cannot take, before any request", async () => {
    const { g, root, api } = await mountGenerate();
    const input = root.querySelector('[data-field="character"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [characterPng(200, 200)], configurable: true });
    input.dispatchEvent(new Event("change"));
    await until(() => /at least 300 px/.test(root.querySelector("[data-estimate]")!.textContent!));
    (root.querySelector('[data-action="run"]') as HTMLButtonElement).click();
    await until(() => Boolean(root.querySelector(".err")!.textContent));
    expect(root.querySelector(".err")!.textContent).toContain("at least 300 px");
    expect(api.calls).toHaveLength(0);
    void g;
  });
});

describe("<arena-gallery>", () => {
  it("shows a designed empty state with zero records", () => {
    const g = document.createElement("arena-gallery") as ArenaGallery;
    document.body.append(g);
    expect(g.shadowRoot!.querySelector("[data-empty]")!.textContent).toContain("No published runs yet");
    g.records = [];
    expect(g.shadowRoot!.querySelector("[data-empty]")).not.toBeNull();
  });

  it("plays records with relative media, switches records and views, and shows the lane's shot", async () => {
    const { o } = await import("./embed-helpers.ts").then(async (h) => {
      const { generateFromGuide } = await import("../providers/runware-api/generate.ts");
      const api = h.fakeRunware({ videoURL: "https://vm.runware.ai/video/a.mp4" });
      const r = await generateFromGuide({ guide: h.makeBundle(), model: "seedance-2.5", maxPrice: 5, key: FAKE_KEY, confirm: () => true, fetch: api.fetch, poll: h.fastPoll });
      return { o: r.record };
    });
    const relative = { ...o, id: "relative-run", title: "Relative run", lanes: [{ ...o.lanes[0]!, output: { src: "out/b.mp4" } }] };
    const g = document.createElement("arena-gallery") as ArenaGallery;
    document.body.append(g);
    g.add(o, "https://host.example/runs/one/");
    g.add(relative, "https://host.example/runs/two/");
    const root = g.shadowRoot!;
    expect([...root.querySelectorAll("[data-record]")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    const arena = () => root.querySelector("model-arena") as ModelArena;
    const srcs = () => [...arena().shadowRoot!.querySelectorAll(".screen video")].map((v) => (v as HTMLVideoElement).getAttribute("src"));
    expect(srcs()).toEqual(["https://host.example/runs/two/guide.mp4", "https://host.example/runs/two/out/b.mp4"]);
    expect(root.querySelector("[data-shot]")!.textContent).toContain("The orange figure is the character");
    (root.querySelector('[data-view="arena"]') as HTMLButtonElement).click();
    expect(arena().getAttribute("layout")).toBe("arena");
    (root.querySelector('[data-record="' + o.id + '"]') as HTMLButtonElement).click();
    expect(srcs()).toContain("https://vm.runware.ai/video/a.mp4");
    expect(g.add({ nope: true })).toBe(false);
    expect(root.textContent).toContain("skipped");
  });
});
