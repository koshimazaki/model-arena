/** The shared transport (play, one playhead, time) and the clip screen, used by every view. */
import type { ClockState, SharedClock } from "../../core/src/clock.ts";
import { el } from "./captions.ts";

export const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

export interface Transport {
  node: HTMLElement;
  update(s: ClockState): void;
}

export function transport(clock: () => SharedClock, label = "Play all"): Transport {
  const play = el("button", { class: "primary", type: "button" }, label);
  play.addEventListener("click", () => void clock().play());
  const scrub = el("input", { type: "range", min: "0", max: "0", step: String(1 / 24), value: "0", "aria-label": "Playhead" });
  let scrubbing = false;
  scrub.addEventListener("input", () => {
    scrubbing = true;
    clock().seek(Number(scrub.value));
  });
  scrub.addEventListener("change", () => (scrubbing = false));
  const time = el("span", { class: "time" }, "0:00.0 / 0:00.0");
  return {
    node: el("div", { class: "transport" }, play, scrub, time),
    update(s) {
      play.textContent = s.playing ? "Pause" : label;
      scrub.max = String(s.duration || 0);
      if (!scrubbing) scrub.value = String(s.time);
      time.textContent = `${fmt(s.time)} / ${fmt(s.duration)}`;
    },
  };
}

/**
 * A muted, inline video in a 16:9 screen with a playhead bar; null src shows a badge instead.
 * Only metadata loads up front (the clock needs the length); `poster` shows until playback.
 */
export function screen(
  src: string | null,
  label: string,
  onError: (msg: string) => void,
  badge?: string,
  poster?: string | null,
): { node: HTMLElement; video?: HTMLVideoElement; bar: HTMLElement } {
  const node = el("div", { class: "screen" });
  let video: HTMLVideoElement | undefined;
  if (src) {
    video = el("video", { src, muted: "", playsinline: "", preload: "metadata", "aria-label": label, ...(poster ? { poster } : {}) });
    video.muted = true;
    video.addEventListener("error", () => onError(`${label}: the clip did not load.`));
    node.append(video);
  } else node.append(el("div", { class: "badge" }, "No output"));
  if (badge) node.append(el("div", { class: "badge" }, badge));
  const bar = el("span");
  node.append(el("div", { class: "playhead" }, bar));
  return { node, video, bar };
}

export const progress = (s: ClockState) => (s.duration ? `${Math.min(100, (s.time / s.duration) * 100)}%` : "0%");
