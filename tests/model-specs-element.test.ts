// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { MODEL_SPECS } from "../packages/core/src/specs/index.ts";

beforeAll(async () => {
  await import("../packages/element/src/index.ts");
});

function mount(attrs: Record<string, string> = {}): ShadowRoot {
  const node = document.createElement("model-specs");
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  document.body.append(node);
  return node.shadowRoot!;
}

describe("<model-specs>", () => {
  it("renders a matrix row and a card per model, with guide links", () => {
    const root = mount();
    expect(root.querySelectorAll("table.matrix tbody tr")).toHaveLength(MODEL_SPECS.length);
    expect(root.querySelectorAll("article.card")).toHaveLength(MODEL_SPECS.length);
    const kling = root.querySelector('article.card[data-model="kling-4"]')!;
    const hrefs = [...kling.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://runware.ai/docs/models/klingai-video-4-0/guides/reference-videos");
    expect(hrefs).toContain("https://runware.ai/docs/models/klingai-video-4-0/schema.json");
    expect(kling.querySelectorAll('a[target="_blank"][rel~="noopener"]').length).toBe(hrefs.length);
  });

  it("the matrix says LTX has a camera parameter and Kling does not", () => {
    const root = mount();
    expect(root.querySelector('tr[data-model="ltx-2.5"]')!.textContent).toContain("settings.cameraMovement");
    expect(root.querySelector('tr[data-model="kling-4"]')!.textContent).toContain("prompt words");
  });

  it("the composer shows one prompt and params per model and recomposes on input", () => {
    const root = mount();
    const outs = () => [...root.querySelectorAll(".composer .out")];
    expect(outs().map((o) => o.getAttribute("data-model"))).toEqual(["kling-4", "seedance-2.5", "h3", "ltx-2.5", "flux-3-video"]);
    expect(root.querySelector('.out[data-model="seedance-2.5"] pre')!.textContent).toMatch(/@Video1/);
    expect(root.querySelector('.out[data-model="h3"] pre')!.textContent).toMatch(/Video 1/);
    expect(root.querySelector('.out[data-model="kling-4"] pre')!.textContent).toMatch(/<<<video_1>>>/);

    const subject = root.querySelector('.composer input[name="subject"]') as HTMLInputElement;
    subject.value = "A wooden chair";
    subject.dispatchEvent(new Event("input", { bubbles: true }));
    expect(outs().every((o) => o.querySelector("pre")!.textContent!.includes("wooden chair"))).toBe(true);

    // Drop the guide video and choose a camera move: LTX takes it as a parameter.
    (root.querySelector('input[name="ref-guide"]') as HTMLInputElement).checked = false;
    (root.querySelector('input[name="ref-character"]') as HTMLInputElement).checked = false;
    const still = root.querySelector('input[name="ref-still"]') as HTMLInputElement;
    still.checked = true;
    const cam = root.querySelector('select[name="camera"]') as HTMLSelectElement;
    cam.value = "crane-up";
    cam.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector('.out[data-model="ltx-2.5"] pre.params')!.textContent).toContain('"settings.cameraMovement": "jib_up"');
  });

  it("models= limits the database and view= shows one part", () => {
    const root = mount({ models: "kling-4,ltx-2.5", view: "composer" });
    expect(root.querySelectorAll("article.card")).toHaveLength(2);
    expect((root.querySelector('section[data-view="matrix"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('section[data-view="composer"]') as HTMLElement).hidden).toBe(false);
    expect(root.querySelectorAll(".composer .out")).toHaveLength(2);
  });
});
