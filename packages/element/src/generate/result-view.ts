/**
 * The result of one run: the guide and the output on one clock (a nested
 * <model-arena layout="guidance">), the honest caption (inputs sent, cost,
 * seconds, model that ran), Download, "Add to gallery" and the costs.md row.
 */
import type { ArenaRecord } from "../../../core/src/record.ts";
import type { GenerateResult } from "../../../../providers/runware-api/generate.ts";
import { el, mediaUrl, secs, usd } from "../captions.ts";
import { define as defineArena, type ModelArena } from "../model-arena.ts";

const ROLE: Record<string, string> = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "driving audio",
  video: "video",
};

/** The record with bundle-relative media swapped for URLs the page can play (blob: or resolved). */
export function displayRecord(record: ArenaRecord, urls: Map<string, string>): ArenaRecord {
  const swap = (src: string) => urls.get(src.replace(/^\.\//, "")) ?? src;
  const copy = JSON.parse(JSON.stringify(record)) as ArenaRecord;
  const g = copy.guide;
  if (g) for (const k of ["video", "audio", "firstFrame", "firstFrameStyled", "camera"] as const) if (g[k]) g[k]!.src = swap(g[k]!.src);
  for (const lane of copy.lanes) for (const i of lane.inputsSent) i.src = swap(i.src);
  return copy;
}

/** "Inputs sent: reference video guide.mp4, … · Cost … · Seconds … · Model ran …" */
export function captionText(r: GenerateResult): string {
  const inputs = r.inputsSent.map((i) => `${ROLE[i.role] ?? i.role} ${i.label ?? i.src}`).join(", ") || "prompt only";
  return [
    `Inputs sent: ${inputs}`,
    `Cost: ${usd(r.costUsd)}${r.costUsd === null ? "" : " reported"} (estimate ${usd(r.estimate.usd)})`,
    `Seconds: ${secs(r.generationSeconds)} to generate`,
    `Model ran: ${r.modelRan ?? "not reported by the provider"}`,
    // An input the model was not sent belongs in the caption itself, not only in the notes.
    ...r.notes.filter((n) => n.startsWith("Music not sent")),
  ].join(" · ");
}

function jsonLink(record: ArenaRecord): HTMLAnchorElement {
  const a = el("a", { class: "btn", download: `${record.id}.json`, "data-action": "record-json" }, "Download record JSON");
  try {
    a.href = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
  } catch {
    a.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record))}`;
  }
  return a;
}

export function resultView(r: GenerateResult, urls: Map<string, string>, base: string, onAdd: (record: ArenaRecord) => void): HTMLElement {
  defineArena();
  const arena = document.createElement("model-arena") as ModelArena;
  arena.setAttribute("layout", "guidance");
  arena.setRecord(displayRecord(r.record, urls), base);

  const download = el("a", { class: "btn", href: mediaUrl(r.videoURL, base) ?? "#", download: "", target: "_blank", rel: "noopener noreferrer", "data-action": "download" }, "Download");
  const add = el("button", { type: "button", "data-action": "add" }, "Add to gallery");
  const slot = el("span");
  add.addEventListener("click", () => {
    onAdd(r.record);
    add.textContent = "Added";
    add.disabled = true;
    slot.replaceChildren(jsonLink(r.record));
  });
  const row = el("details", { class: "cost-row" }, el("summary", {}, "Cost row for docs/costs.md"), el("pre", {}, r.costRowText.trim()));
  return el(
    "section",
    { class: "result", "aria-label": "Result" },
    arena,
    el("p", { class: "caption", "data-caption": "" }, captionText(r)),
    r.notes.length ? el("ul", { class: "notes" }, ...r.notes.map((n) => el("li", {}, n))) : null,
    el("div", { class: "row" }, download, add, slot),
    row,
  );
}
