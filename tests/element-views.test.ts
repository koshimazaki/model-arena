// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import type { ArenaRecord, Lane } from "../packages/core/src/record.ts";
import { parseRecordSet } from "../packages/core/src/record-set.ts";
import type { ModelArena } from "../packages/element/src/model-arena.ts";
import { inputsStrip, listPrice, steering } from "../packages/element/src/steering.ts";
import { fitState } from "../packages/element/src/views/arena.ts";

const BASE = "https://example.com/records/";

const lane = (id: string, model: string, over: Partial<Lane> = {}): Lane => ({
  id,
  label: id,
  provider: "runware-api",
  model,
  modelRan: null,
  prompt: `prompt for ${id}`,
  inputsSent: [],
  firstFrameVariant: "C",
  output: { src: `${id}.mp4` },
  costUsd: null,
  generationSeconds: null,
  durationSeconds: 8,
  status: "placeholder",
  ...over,
});

const kling = lane("kling-4", "klingai:kling-video@4.0", {
  inputsSent: [
    { role: "frameImage", src: "first.png", frame: "first" },
    { role: "referenceVideo", src: "guide.mp4" },
  ],
  firstFrameVariant: "A",
});
const ltx = lane("ltx-2-5", "lightricks:ltx@2.5-pro", {
  inputsSent: [{ role: "frameImage", src: "first.png", frame: "first" }],
  firstFrameVariant: "A",
  settings: { taskType: "videoInference", settings: { cameraMovement: "dolly_in" } },
});
const flux = lane("flux-3-video", "bfl:flux@3-video");
const seedance = lane("seedance-2-5", "bytedance:seedance@2.5", {
  inputsSent: [
    { role: "referenceImage", src: "first.png" },
    { role: "referenceVideo", src: "guide.mp4" },
    { role: "referenceAudio", src: "beat.wav" },
  ],
  firstFrameVariant: "A",
});
const h3 = lane("h3", "minimax:h3@0", { inputsSent: [{ role: "referenceVideo", src: "guide.mp4" }] });

const record: ArenaRecord = {
  schemaVersion: 1,
  id: "test",
  title: "Test record",
  guide: { schemaVersion: 1, title: "Guide", video: { src: "guide.mp4" } },
  lanes: [kling, seedance, h3, ltx, flux],
};

beforeAll(async () => {
  await import("../packages/element/src/index.ts");
});

function mount(layout: string, data: unknown = record, attrs: Record<string, string> = {}): ModelArena {
  const node = document.createElement("model-arena") as ModelArena;
  node.setAttribute("layout", layout);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  document.body.append(node);
  node.setRecord(data, BASE);
  return node;
}
const buttons = (root: ShadowRoot) => [...root.querySelectorAll("button")];
const click = (root: ShadowRoot, text: string) => buttons(root).find((b) => b.textContent === text)!.click();

describe("steering and the inputs strip", () => {
  it("names the three ways a model is steered", () => {
    expect([ltx, kling, flux].map(steering)).toEqual(["parameter", "guide-video", "prompt"]);
  });

  it("greys out what a model cannot take and says how inputs went in", () => {
    const k = Object.fromEntries(inputsStrip(kling).map((s) => [s.key, s]));
    expect(k.audio!.state).toBe("cannot");
    expect(k.cameraParam!.state).toBe("cannot");
    expect(k.guideVideo).toMatchObject({ state: "sent", detail: "as a reference video" });
    const s = Object.fromEntries(inputsStrip(seedance).map((x) => [x.key, x]));
    expect(s.firstFrame).toMatchObject({ state: "sent", detail: "as a reference image" });
    const l = Object.fromEntries(inputsStrip(ltx).map((x) => [x.key, x]));
    expect(l.cameraParam).toMatchObject({ state: "sent", detail: "dolly_in" });
    expect(l.guideVideo!.state).toBe("cannot");
    expect(l.audio!.state).toBe("not-sent");
    expect(l.prompt!.detail).toBe("no camera words");
  });

  it("prices a lane that has not run from the cheapest matching list rate", () => {
    expect(listPrice(kling)).toEqual({ usd: 1.504 });
    expect(listPrice(flux)).toEqual({ usd: 1.36 });
    expect(listPrice(h3)!.excludes).toMatch(/uploaded video/);
  });
});

describe('layout="arena"', () => {
  it("defaults to three models in a row, one clock, a model menu per tile", () => {
    const root = mount("arena").shadowRoot!;
    expect(root.querySelector(".stage")!.getAttribute("data-layout")).toBe("3-row");
    expect(root.querySelectorAll("figure.tile")).toHaveLength(3);
    expect(root.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(root.querySelectorAll("figure.tile select")).toHaveLength(3);
    expect(root.querySelector("figure.tile .meta")!.textContent).toBe("from $1.50 · — s");
  });

  it("changes the count and offers the layouts for that count", () => {
    const node = mount("arena");
    click(node.shadowRoot!, "5 models");
    const root = node.shadowRoot!;
    expect(root.querySelectorAll("figure.tile")).toHaveLength(5);
    expect(buttons(root).map((b) => b.textContent)).toEqual(expect.arrayContaining(["3 + 2", "1 big + 4"]));
    click(root, "1 big + 4");
    expect(node.shadowRoot!.querySelector(".stage")!.getAttribute("data-layout")).toBe("5-hero");
  });

  it("swaps one tile's model from its menu", () => {
    const node = mount("arena");
    const select = node.shadowRoot!.querySelectorAll("figure.tile select")[1] as HTMLSelectElement;
    select.value = "flux-3-video";
    select.dispatchEvent(new Event("change"));
    expect([...node.shadowRoot!.querySelectorAll("figure.tile")].map((f) => f.getAttribute("data-lane"))).toEqual(["kling-4", "flux-3-video", "h3"]);
  });

  it("fitState keeps picks that exist and clamps the count to the lanes", () => {
    const two = { ...record, lanes: [kling, ltx] };
    expect(fitState(two, { count: 5, layout: "5-hero", picks: ["ltx-2-5"] })).toEqual({ count: 2, layout: "2-side", picks: ["ltx-2-5", "kling-4"] });
  });

  it("shows record-set tabs and keeps the reader's choices across them", async () => {
    const set = {
      schemaVersion: 1,
      id: "tests",
      title: "Tests",
      tabs: [
        { id: "camera", label: "Camera", record: { ...record, id: "camera", title: "Camera test" } },
        { id: "audio-sync", label: "Audio sync", record: { ...record, id: "audio", title: "Audio test" } },
      ],
    };
    expect(parseRecordSet(set).tabs).toHaveLength(2);
    const node = mount("arena", set);
    await Promise.resolve();
    const root = node.shadowRoot!;
    expect(root.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe("Camera");
    click(root, "4 models");
    click(node.shadowRoot!, "Audio sync");
    await new Promise((r) => setTimeout(r, 0));
    expect(node.shadowRoot!.querySelector("h2")!.textContent).toBe("Audio test");
    expect(node.shadowRoot!.querySelectorAll("figure.tile")).toHaveLength(4);
  });
});

describe('layout="guidance"', () => {
  it("puts the guide beside the chosen model, with a switcher, the lit steering mode, the strip and the prompt", () => {
    const node = mount("guidance", record, { model: "ltx-2-5" });
    const root = node.shadowRoot!;
    const videos = root.querySelectorAll(".pair video");
    expect(videos).toHaveLength(2);
    expect(videos[0]!.getAttribute("src")).toBe("https://example.com/records/guide.mp4");
    expect(videos[1]!.getAttribute("src")).toBe("https://example.com/records/ltx-2-5.mp4");
    expect(root.querySelector(".modes li.on")!.getAttribute("data-mode")).toBe("parameter");
    expect(root.querySelector('[data-slot="cameraParam"]')!.className).toContain("sent");
    expect(root.querySelector(".composed pre")!.textContent).toBe("prompt for ltx-2-5");
    expect(root.querySelectorAll(".switcher button")).toHaveLength(5);
  });

  it("switching model swaps the output, the mode, the strip and the prompt", () => {
    const node = mount("guidance");
    const root = node.shadowRoot!;
    (root.querySelector('.switcher [data-lane="flux-3-video"]') as HTMLButtonElement).click();
    expect(root.querySelectorAll(".pair video")[1]!.getAttribute("src")).toMatch(/flux-3-video\.mp4$/);
    expect(root.querySelector(".modes li.on")!.getAttribute("data-mode")).toBe("prompt");
    expect(root.querySelector('[data-slot="guideVideo"]')!.className).toContain("cannot");
    expect(root.querySelector(".composed pre")!.textContent).toBe("prompt for flux-3-video");
    expect(root.querySelector('.switcher [data-lane="flux-3-video"]')!.getAttribute("aria-pressed")).toBe("true");
  });
});
