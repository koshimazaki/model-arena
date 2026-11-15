/**
 * layout="inputs": everything a model was given beside what it made. A
 * compact strip of the reference images (character sheet, environment), then
 * the guide and one to three outputs in one row on one playhead, each output
 * with its model, cost, seconds and composed prompt. The record's audio plays
 * once, from the guide's audio file; the outputs' own sound is muted unless
 * the reader turns "Clip sound" on, which mutes the guide audio instead.
 */
import type { InputSent, Lane } from "../../../core/src/record.ts";
import { el, mediaUrl } from "../captions.ts";
import { progress, screen, transport } from "../transport.ts";
import { costLine, secondsLine, type View, type ViewContext } from "./arena.ts";

const isGuideLane = (l: Lane) => l.model === "guide" || l.provider === "none";
const IMAGE_ROLES = new Set<InputSent["role"]>(["referenceImage", "frameImage"]);
const NAMES: Record<string, string> = { character: "Character sheet", environment: "Environment", frame0: "Guide frame 0" };

/** The reference images the record's lanes were sent, deduplicated, named by the shot's reference ids where known. */
export function referenceStrip(lanes: Lane[]): { src: string; label: string }[] {
  const out = new Map<string, string>();
  for (const lane of lanes) {
    const ids = (lane.shot?.references ?? []).filter((r) => r.kind === "image").map((r) => r.id);
    lane.inputsSent.filter((i) => IMAGE_ROLES.has(i.role)).forEach((i, n) => {
      if (!out.has(i.src)) out.set(i.src, NAMES[ids[n] ?? ""] ?? i.label ?? "Reference image");
    });
  }
  return [...out].map(([src, label]) => ({ src, label }));
}

export function inputsView(ctx: ViewContext): View {
  const { record, base } = ctx;
  const clock = ctx.clock();
  const t = transport(ctx.clock, "Play all");
  const bars: HTMLElement[] = [];
  const outputs = record.lanes.filter((l) => !isGuideLane(l) && l.output).slice(0, 3);

  const strip = referenceStrip(record.lanes);
  const refs = strip.length
    ? el(
        "ul",
        { class: "ref-strip", "aria-label": "Reference images sent" },
        ...strip.map((r) => {
          const url = mediaUrl(r.src, base);
          return el("li", {}, url ? el("img", { src: url, alt: r.label, loading: "lazy" }) : el("div", { class: "ph" }, "image"), el("span", {}, r.label));
        }),
      )
    : null;

  const row = el("div", { class: "inputs-row" });
  row.style.setProperty("--ma-columns", String(1 + Math.max(1, outputs.length)));
  const guideSrc = record.guide ? mediaUrl(record.guide.video.src, base) : null;
  const g = screen(guideSrc, "Guide", ctx.error);
  if (g.video) {
    g.video.addEventListener("loadedmetadata", () => clock.loaded());
    clock.add("guide-clip", g.video);
  }
  bars.push(g.bar);
  row.append(el("figure", { class: "side", "data-lane": "guide" }, g.node, el("figcaption", {}, el("span", { class: "model" }, "Guide"), el("span", { class: "id" }, record.guide?.title ?? "The clip every model was given"))));

  // The record's one audio track: the guide's audio, on the same clock.
  const audioSrc = record.guide?.audio ? mediaUrl(record.guide.audio.src, base) : null;
  let audio: HTMLAudioElement | undefined;
  if (audioSrc) {
    audio = el("audio", { src: audioSrc, preload: "auto", "data-track": "guide-audio" });
    audio.addEventListener("loadedmetadata", () => clock.loaded());
    clock.add("guide-audio", audio);
  }

  const outVideos: HTMLVideoElement[] = [];
  for (const lane of outputs) {
    const poster = lane.output!.poster ? mediaUrl(lane.output!.poster, base) : null;
    const s = screen(mediaUrl(lane.output!.src, base), lane.label ?? lane.modelName ?? lane.model, ctx.error, lane.status === "placeholder" ? "Placeholder clip" : undefined, poster);
    if (s.video) {
      s.video.addEventListener("loadedmetadata", () => clock.loaded());
      clock.add(lane.id, s.video);
      outVideos.push(s.video);
    }
    bars.push(s.bar);
    row.append(
      el(
        "figure",
        { class: "side", "data-lane": lane.id },
        s.node,
        el("figcaption", {}, el("span", { class: "model" }, lane.label ?? lane.modelName ?? lane.model), el("span", { class: "id" }, `${costLine(lane)} · ${secondsLine(lane)}`)),
        el("details", { class: "lane-prompt" }, el("summary", {}, lane.composed ? "Composed prompt" : "Prompt"), el("pre", {}, lane.prompt || "(no prompt)")),
      ),
    );
  }
  if (!outputs.length) row.append(el("p", { class: "note" }, "This record has no outputs yet."));

  const sound = el("button", { type: "button", class: "small", "aria-pressed": "false", "data-action": "clip-sound" }, "Clip sound: off");
  const setSound = (on: boolean) => {
    for (const v of outVideos) v.muted = !on;
    if (audio) audio.muted = on;
    sound.setAttribute("aria-pressed", String(on));
    sound.textContent = `Clip sound: ${on ? "on" : "off"}`;
  };
  sound.addEventListener("click", () => setSound(sound.getAttribute("aria-pressed") !== "true"));
  setSound(false);

  return {
    controls: [sound],
    nodes: [...(refs ? [refs] : []), row, t.node, ...(audio ? [audio] : [])],
    update(s) {
      t.update(s);
      const pct = progress(s);
      bars.forEach((b) => (b.style.width = pct));
    },
  };
}
