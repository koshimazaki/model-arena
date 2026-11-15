/** The generated parts of the blog page: one record and one figure per scene, and the spec table. */
import { findSpec, type InputSpec, type ModelSpec } from "../../packages/core/src/specs/index.ts";
import type { Manifest, TakeFacts, TakesFile } from "./site-takes.ts";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The cost as recorded, trailing zeros dropped but at least two decimals: $0.80, $1.57, $2.3208. */
export const money = (n: number | null) => {
  if (n === null) return "cost not recorded";
  const [whole, frac = ""] = n.toFixed(4).split(".");
  return `$${whole}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
};
const clock = (s: number | null) => (s === null ? "not recorded" : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);
const mib = (b: number) => `${(b / 1048576).toFixed(1)} MiB`;

/** One measured line: what ffprobe read on the original, what the studio recorded. */
export function measuredLine(t: TakeFacts): string {
  const m = t.measured;
  return [
    `${m.width}×${m.height}`,
    `${Number.isInteger(m.fps) ? m.fps : m.fps.toFixed(3)} fps`,
    `${m.frames} frames`,
    `${m.seconds.toFixed(2)} s`,
    money(t.costActualUsd),
    `${clock(t.wallClockSeconds)} submit to ready`,
  ].join(" · ");
}

/** A media URL for the page: `base` is a relative folder (preview) or an https URL (R2). */
export const mediaHref = (base: string, file: string) => `${base}${encodeURIComponent(file)}`;

/** A <model-arena> record for one scene, with media from `base`. */
export function sceneRecord(manifest: Manifest, takes: TakesFile, sceneId: string, base: string) {
  const scene = manifest.scenes.find((s) => s.id === sceneId)!;
  const ref = takes.references[sceneId];
  const lanes = Object.keys(scene.takes).map((key) => {
    const t = takes.takes.find((x) => x.scene === sceneId && x.model === key);
    if (!t) throw new Error(`site/takes.json has no ${sceneId}/${key}; run npm run site:media`);
    const model = manifest.models[key]!;
    return {
      id: key,
      label: model.name,
      provider: "runware-api",
      model: model.air,
      modelName: model.name,
      modelRan: null,
      prompt: t.prompt,
      inputsSent: ref ? [{ role: "referenceImage", src: mediaHref(base, ref.web), label: "Character sheet" }] : [],
      firstFrameVariant: "C",
      output: {
        src: mediaHref(base, t.files.web),
        contentType: "video/mp4",
        poster: mediaHref(base, t.files.poster),
        original: mediaHref(base, t.files.original),
      },
      costUsd: t.costActualUsd,
      generationSeconds: t.wallClockSeconds,
      durationSeconds: t.requested.duration,
      status: "ready",
      note: measuredLine(t),
    };
  });
  return { schemaVersion: 1, id: sceneId, title: scene.title, lanes };
}

/** The figure for one scene: the prompt once, the reference image if any, the element. */
export function sceneFigure(manifest: Manifest, takes: TakesFile, sceneId: string, base: string, recordUrl: string): string {
  const first = takes.takes.find((t) => t.scene === sceneId)!;
  const ref = takes.references[sceneId];
  const refHtml = ref
    ? `<figure class="input"><img src="${esc(mediaHref(base, ref.web))}" alt="The character sheet every model was given" loading="lazy" width="${ref.width}" height="${ref.height}"><figcaption>Input: the one reference image, ${ref.width}×${ref.height}. <a href="${esc(mediaHref(base, ref.original))}">Full resolution</a></figcaption></figure>`
    : `<!-- The reference image is not shown: set "reference" for this scene in site/manifest.json and run npm run site. -->`;
  return `<div class="prompt-box"><span class="label">The prompt, sent unchanged to all three</span><p>${esc(first.prompt).replace(/\n/g, " ")}</p></div>
${refHtml}
<model-arena layout="arena" src="${esc(recordUrl)}"></model-arena>`;
}

const PRICE_UNIT = { "input-video-second": "per second of uploaded video", "image-beyond-five": "per image beyond five" } as const;

function inputCell(i: InputSpec, unit: string): string {
  if (!i.supported) return "none";
  const parts = [`up to ${i.maxCount ?? "?"} ${unit}`];
  const l = i.limits;
  if (l?.secondsEach) parts.push(`${l.secondsEach.min}-${l.secondsEach.max} s each`);
  if (l?.secondsTotalMax) parts.push(`${l.secondsTotalMax} s in all`);
  if (l?.sidePx?.min && unit === "videos" && l.sidePx.min >= 700) parts.push(`at least ${l.sidePx.min} px a side`);
  return parts.join(", ");
}

function durationCell(s: ModelSpec): string {
  const d = s.output.durations;
  const text = d.kind === "range" ? `${d.min}-${d.max} s` : `${d.values.join(", ")} s`;
  return d.auto ? `${text}, or auto` : text;
}

function priceCell(s: ModelSpec): string {
  const byMode = (mode: string) => s.pricing.rates.filter((r) => r.mode === mode).map((r) => `${r.tier} $${r.usdPerSecond}`).join(", ");
  const rows: string[] = [];
  if (s.pricing.rates.some((r) => r.mode === "any")) rows.push(byMode("any"));
  if (s.pricing.rates.some((r) => r.mode === "no-video-input")) rows.push(`${byMode("no-video-input")} (no video input)`);
  if (s.pricing.rates.some((r) => r.mode === "video-input")) rows.push(`${byMode("video-input")} (video input)`);
  for (const x of s.pricing.surcharges) rows.push(`+ $${x.usd} ${PRICE_UNIT[x.per]}`);
  return `per output second: ${rows.join("; ")}`;
}

function audioCell(s: ModelSpec): string {
  if (!s.output.audio.generates) return "no";
  return s.output.audio.toggle ? `yes; <code>${esc(s.output.audio.toggle)}</code> turns it off` : "always on, no switch";
}

/** The spec table: published facts from the spec database, measured values from this run's clips. */
export function specTable(manifest: Manifest, takes: TakesFile): string {
  const keys = Object.keys(manifest.models);
  const specs = keys.map((k) => findSpec(manifest.models[k]!.spec));
  const measured = (key: string) => takes.takes.filter((t) => t.model === key);
  const uniq = (xs: string[]) => [...new Set(xs)].join(" / ");
  const row = (label: string, cells: string[], note = "") =>
    `<tr${note ? ` class="${note}"` : ""}><th scope="row">${label}</th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  const head = `<tr><th></th>${specs.map((s) => `<th scope="col">${esc(s.name)}<br><code>${esc(s.air)}</code></th>`).join("")}</tr>`;
  const body = [
    row("Clip length", specs.map(durationCell)),
    row("Resolutions", specs.map((s) => s.output.resolutions.join(", "))),
    row("Output frame rate, published", specs.map((s) => (s.output.fps ? esc(String(s.output.fps)) : "not published"))),
    row("Measured here", keys.map((k) => uniq(measured(k).map((t) => `${t.measured.width}×${t.measured.height}, ${t.measured.fps} fps, ${t.measured.frames} frames`))), "measured"),
    row("Reference images", specs.map((s) => inputCell(s.inputs.referenceImages, "images"))),
    row("Reference videos", specs.map((s) => inputCell(s.inputs.referenceVideos, "videos"))),
    row("Reference audio", specs.map((s) => inputCell(s.inputs.referenceAudios, "tracks"))),
    row("A reference in the prompt", specs.map((s) => s.prompting.addressing.tokens.filter((t) => t.input === "image").map((t) => `<code>${esc(t.pattern.replace("{n}", "1"))}</code>`).join(" ") || "not addressed")),
    row("Makes its own sound", specs.map(audioCell)),
    row("Price basis", specs.map(priceCell)),
    row("Billed here, 10 s clip", keys.map((k) => uniq(measured(k).map((t) => money(t.costActualUsd)))), "measured"),
    row("Docs", specs.map((s) => `<a href="${esc(s.sources.model)}">Runware model page</a>`)),
  ];
  return `<table><thead>${head}</thead><tbody>${body.join("\n")}</tbody></table>`;
}

/** Sizes for the hand-back and the build log. */
export function sizeSummary(takes: TakesFile): string {
  const web = takes.takes.reduce((n, t) => n + t.measured.webBytes, 0);
  const orig = takes.takes.reduce((n, t) => n + t.measured.originalBytes, 0);
  return `web copies ${mib(web)}, originals ${mib(orig)}`;
}
