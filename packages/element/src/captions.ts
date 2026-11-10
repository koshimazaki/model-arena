/**
 * The caption under each clip. Everything from the record goes in through
 * textContent or a checked URL, never as HTML, because records are fetched.
 */
import type { InputSent, Lane } from "../../core/src/record.ts";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

/** Resolves a record-relative media path; refuses schemes that are not media. */
export function mediaUrl(src: string, base: string): string | null {
  try {
    const url = new URL(src, base);
    if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "blob:") return url.href;
    if (url.protocol === "data:" && /^data:(image|video|audio)\//.test(src)) return src;
    return null;
  } catch {
    return null;
  }
}

const VARIANTS: Record<Lane["firstFrameVariant"], string> = {
  A: "A · raw frame 0",
  B: "B · restyled still",
  C: "C · none",
};

const ROLE_LABEL: Record<InputSent["role"], string> = {
  referenceVideo: "reference video",
  referenceImage: "reference image",
  referenceAudio: "reference audio",
  frameImage: "frame image",
  audio: "audio",
  video: "video",
};

export const usd = (n: number | null) => (n === null ? "not recorded" : `$${n.toFixed(n < 1 ? 3 : 2)}`);
export const secs = (n: number | null | undefined) => (n === null || n === undefined ? "not recorded" : `${n.toFixed(1)} s`);

function thumb(input: InputSent, base: string): HTMLElement {
  const url = mediaUrl(input.src, base);
  const isImage = input.role === "referenceImage" || input.role === "frameImage";
  const isVideo = input.role === "referenceVideo" || input.role === "video";
  let preview: HTMLElement;
  if (url && isImage) preview = el("img", { src: url, alt: input.label ?? input.role, loading: "lazy" });
  else if (url && isVideo) {
    const v = el("video", { src: url, muted: "", playsinline: "", preload: "metadata", "aria-label": input.label ?? input.role });
    v.muted = true;
    preview = v;
  } else preview = el("div", { class: "ph" }, input.role.includes("udio") ? "audio" : "media");
  const label = `${ROLE_LABEL[input.role]}${input.frame !== undefined ? ` @ ${input.frame}` : ""}`;
  return el("div", { class: "input", title: input.label ?? input.src }, preview, el("span", {}, label));
}

function copyButton(text: string): HTMLButtonElement {
  const b = el("button", { class: "small", type: "button" }, "Copy prompt");
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = "Copied";
    } catch {
      b.textContent = "Select and copy";
    }
    setTimeout(() => (b.textContent = "Copy prompt"), 1500);
  });
  return b;
}

export function caption(lane: Lane, base: string, onSolo: () => void): { node: HTMLElement; solo: HTMLButtonElement } {
  const solo = el("button", { class: "small", type: "button", "aria-pressed": "false" }, "Play alone");
  solo.addEventListener("click", onSolo);
  const ran =
    lane.modelRan ?? (lane.status === "placeholder" ? "nothing ran (placeholder)" : "not reported by the provider");
  const rows: [string, string][] = [
    ["Model ran", ran],
    ["First frame", VARIANTS[lane.firstFrameVariant]],
    ["Cost", usd(lane.costUsd)],
    ["Seconds", secs(lane.generationSeconds)],
  ];
  if (lane.durationSeconds !== undefined)
    rows.push(["Clip length", lane.durationSeconds === "auto" ? "auto" : `${lane.durationSeconds} s asked`]);
  if (lane.routing)
    rows.push([
      "Routing",
      [lane.routing.maxPrice !== undefined ? `cap $${lane.routing.maxPrice}` : "", lane.routing.requirements ?? ""]
        .filter(Boolean)
        .join(" · "),
    ]);
  const dl = el("dl");
  for (const [k, v] of rows) dl.append(el("dt", {}, k), el("dd", {}, v));

  const inputs = lane.inputsSent.length
    ? el("div", { class: "inputs" }, ...lane.inputsSent.map((i) => thumb(i, base)))
    : el("div", { class: "note" }, "Inputs sent: prompt only");

  const node = el(
    "div",
    { class: "caption" },
    el(
      "div",
      { class: "row" },
      el("span", { class: "model" }, lane.label ?? lane.modelName ?? lane.model),
      el("span", { class: "id" }, `${lane.provider} · ${lane.model}`),
    ),
    lane.prompt
      ? el("div", { class: "prompt" }, el("pre", {}, lane.prompt), el("div", { class: "row" }, copyButton(lane.prompt), solo))
      : el("div", { class: "row" }, solo),
    el("div", {}, el("div", { class: "id" }, "Inputs sent"), inputs),
    dl,
    lane.note ? el("div", { class: "note" }, lane.note) : null,
  );
  return { node, solo };
}
