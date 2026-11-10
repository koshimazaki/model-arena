// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { mediaUrl } from "../packages/element/src/captions.ts";
import type { ModelArena } from "../packages/element/src/model-arena.ts";

const record = JSON.parse(readFileSync(join(process.cwd(), "examples/records/mannequin-placeholder.json"), "utf8"));
const BASE = "https://example.com/examples/records/mannequin-placeholder.json";

beforeAll(async () => {
  await import("../packages/element/src/index.ts");
});

function mount(r: unknown): ShadowRoot {
  const node = document.createElement("model-arena") as ModelArena;
  document.body.append(node);
  node.setRecord(r, BASE);
  return node.shadowRoot!;
}

describe("<model-arena>", () => {
  it("renders one lane per record lane, three up, with one shared playhead", () => {
    const root = mount(record);
    expect(root.querySelectorAll("article.lane")).toHaveLength(3);
    expect(root.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect((root.querySelector(".lanes") as HTMLElement).style.getPropertyValue("--ma-columns")).toBe("3");
    expect(root.querySelector("article.preferred")?.getAttribute("data-lane")).toBe("kling-4");
  });

  it("captions say model, inputs, first-frame variant, cost, seconds and model ran", () => {
    const root = mount(record);
    const kling = root.querySelector('[data-lane="kling-4"]')!;
    const text = kling.textContent!;
    expect(text).toContain("Kling VIDEO 4.0");
    expect(text).toContain("klingai:kling-video@4.0");
    expect(text).toContain("A · raw frame 0");
    expect(text).toContain("reference video");
    expect(text).toContain("frame image @ first");
    expect(text).toContain("Cost");
    expect(text).toContain("nothing ran (placeholder)");
    expect(kling.querySelector(".inputs img")?.getAttribute("src")).toBe(
      "https://example.com/examples/media/mannequin-two-fruits-guide-first-frame.png",
    );
    expect(kling.querySelector("video")?.getAttribute("src")).toMatch(/depth/);
    expect(root.querySelector('[data-lane="router"]')!.textContent).toContain("cap $1.5");
  });

  it("puts record text in as text, never as HTML", () => {
    const evil = structuredClone(record);
    evil.lanes[1].prompt = '<img src=x onerror="window.__pwned=1">';
    evil.title = "<b>bold</b>";
    const root = mount(evil);
    expect(root.querySelector("b")).toBeNull();
    expect(root.querySelector(".prompt img")).toBeNull();
    expect(root.querySelector(".prompt pre")!.textContent).toContain("<img");
  });

  it("refuses media URLs that are not media", () => {
    expect(mediaUrl("javascript:alert(1)", BASE)).toBeNull();
    expect(mediaUrl("data:text/html,hi", BASE)).toBeNull();
    expect(mediaUrl("../media/a.mp4", BASE)).toBe("https://example.com/examples/media/a.mp4");
  });

  it("shows a clear message for an invalid record", () => {
    const root = mount({ schemaVersion: 9 });
    expect(root.textContent).toMatch(/cannot be shown: schemaVersion/);
  });
});
