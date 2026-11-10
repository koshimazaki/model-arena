/** Plain-words formatting of spec fields, shared by the matrix and the cards. */
import type { InputKind, InputSpec, ModelSpec, Range } from "../../../core/src/specs/types.ts";
import { el } from "../captions.ts";

export const INPUT_LABEL: Record<InputKind, string> = {
  firstFrame: "First frame",
  lastFrame: "Last frame",
  keyframes: "Keyframes",
  referenceImages: "Reference images",
  referenceVideos: "Reference videos",
  referenceAudios: "Reference audio",
  sourceVideo: "Source video (edit/extend)",
  audioToVideo: "Audio-to-video",
  elements: "Elements",
};

const span = (r: Range | null, unit: string) => {
  if (!r || (r.min === null && r.max === null)) return null;
  if (r.min !== null && r.max !== null) return r.min === r.max ? `${r.min}${unit}` : `${r.min}-${r.max}${unit}`;
  return r.min !== null ? `≥${r.min}${unit}` : `≤${r.max}${unit}`;
};

/** "≤5 · 3-30 s each · 30 s total · 700-4553 px · 24-60 fps · ≤300 MB", or "no". */
export function inputLine(i: InputSpec): string {
  if (!i.supported) return "no";
  const l = i.limits;
  const parts = [
    i.maxCount !== null ? `≤${i.maxCount}` : "yes",
    l && span(l.secondsEach, " s each"),
    l?.secondsTotalMax ? `${l.secondsTotalMax} s total` : null,
    l && span(l.sidePx, " px a side"),
    l && span(l.fps, " fps"),
    l?.maxBytesEach ? `≤${Math.round(l.maxBytesEach / 1048576)} MB` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function durationLine(s: ModelSpec): string {
  const d = s.output.durations;
  const base = d.kind === "range" ? `${d.min}-${d.max} s` : `${d.values.join(", ")} s`;
  return d.auto ? `${base} or auto` : base;
}

export function outputLine(s: ModelSpec): string {
  const o = s.output;
  const fps = o.fps ? `${o.fps.join("/")} fps` : "fps not stated";
  const audio = o.audio.generates === null ? "audio not stated" : o.audio.generates ? (o.audio.toggle ? `audio (${o.audio.toggle})` : "audio, always on") : "silent";
  return `${o.resolutions.join(", ")} · ${fps} · ${audio}`;
}

export function syntaxLine(s: ModelSpec): string {
  const a = s.prompting.addressing;
  if (!a.tokens.length) return a.style === "none" ? "inputs not named" : "plain words";
  return a.tokens.map((t) => t.pattern.replace("{n}", "1")).join(" ");
}

export function cameraLine(s: ModelSpec): string {
  return s.camera.kind === "parameter" ? `${s.camera.field}: ${s.camera.values.length} values` : `prompt words (${s.camera.vocabulary.filter((t) => t.move).length} of 10 moves)`;
}

export function priceLine(s: ModelSpec): string {
  const paid = s.pricing.rates.filter((r) => !r.mode.startsWith("draft"));
  const lo = Math.min(...paid.map((r) => r.usdPerSecond));
  const hi = Math.max(...paid.map((r) => r.usdPerSecond));
  const surcharge = s.pricing.surcharges.length ? " + surcharges" : "";
  return `$${lo.toFixed(3)}${hi > lo ? `-${hi.toFixed(3)}` : ""}/s${surcharge}`;
}

export function link(href: string, text: string): HTMLAnchorElement {
  return el("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);
}

export function copyButton(label: string, get: () => string): HTMLButtonElement {
  const b = el("button", { class: "small", type: "button" }, label);
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(get());
      b.textContent = "Copied";
    } catch {
      b.textContent = "Select and copy";
    }
    setTimeout(() => (b.textContent = label), 1500);
  });
  return b;
}
