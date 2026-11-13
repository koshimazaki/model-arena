/**
 * <arena-player src="output.mp4" controls="none">: one output video that
 * follows the host's clock. The host calls `seek(t)`, `play()`, `pause()`, or
 * sets `currentTime` every frame; the element seeks only when the video is
 * paused or has drifted more than one frame (1 / `fps`, default 24) from the
 * host's time, so it stays within a frame without stuttering.
 *
 * Attributes: `src` (http, https, blob or a relative URL), `controls`
 * ("none": no controls at all; otherwise the browser's own), `muted`
 * (muted by default, since the host plays the music; `muted="false"` for the
 * clip's own sound), `fps`, `label`, `theme`.
 * Events: `arena-player-ready` (detail.duration), `arena-player-error`.
 */
import { el, mediaUrl } from "./captions.ts";
import { tokens } from "./tokens.ts";

const here = () => (typeof location === "undefined" ? "http://localhost/" : location.href);

/** Whether to seek the video to the host's time: when paused, or more than one frame off. */
export function needsSeek(videoTime: number, hostTime: number, paused: boolean, fps = 24): boolean {
  if (!Number.isFinite(hostTime)) return false;
  return paused ? Math.abs(videoTime - hostTime) > 1e-3 : Math.abs(videoTime - hostTime) > 1 / fps;
}

const css = /* css */ `
${tokens}
:host { display: block; position: relative; background: #000; border-radius: var(--ma-radius); overflow: hidden; aspect-ratio: 16 / 9; }
video { width: 100%; height: 100%; display: block; object-fit: contain; }
.err { position: absolute; inset: auto 8px 8px 8px; margin: 0; font: 12px var(--ma-font); color: var(--ma-warn); }
.err:empty { display: none; }
`;

export class ArenaPlayer extends HTMLElement {
  static observedAttributes = ["src", "controls", "muted", "label"];
  readonly video: HTMLVideoElement;
  private root: ShadowRoot;
  private err: HTMLElement;
  private target = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.video = el("video", { playsinline: "", preload: "auto", "data-player": "" });
    this.video.muted = true;
    this.video.controls = true;
    this.err = el("p", { class: "err", role: "status" });
    this.video.addEventListener("loadedmetadata", () => {
      this.dispatchEvent(new CustomEvent("arena-player-ready", { bubbles: true, composed: true, detail: { duration: this.video.duration } }));
      if (this.target) this.video.currentTime = Math.min(this.target, this.video.duration || this.target);
    });
    this.video.addEventListener("error", () => {
      this.err.textContent = "The clip did not load.";
      this.dispatchEvent(new CustomEvent("arena-player-error", { bubbles: true, composed: true, detail: { message: this.err.textContent } }));
    });
    this.root.replaceChildren(el("style", {}, css), this.video, this.err);
  }

  attributeChangedCallback(name: string) {
    if (name === "src") {
      const url = mediaUrl(this.getAttribute("src") ?? "", here());
      this.err.textContent = "";
      if (url) this.video.src = url;
      else this.video.removeAttribute("src");
    }
    if (name === "controls") this.video.controls = this.getAttribute("controls") !== "none";
    if (name === "muted") this.video.muted = this.getAttribute("muted") !== "false";
    if (name === "label") this.video.setAttribute("aria-label", this.getAttribute("label") ?? "Generated clip");
  }

  private get fps(): number {
    const n = Number(this.getAttribute("fps"));
    return n > 0 && n <= 240 ? n : 24;
  }

  get duration(): number {
    return this.video.duration;
  }

  get paused(): boolean {
    return this.video.paused;
  }

  get muted(): boolean {
    return this.video.muted;
  }

  set muted(v: boolean) {
    this.video.muted = v;
  }

  get currentTime(): number {
    return this.video.currentTime;
  }

  /** The host's time, every frame if it likes; the video seeks only when it must. */
  set currentTime(t: number) {
    this.follow(t);
  }

  follow(t: number) {
    const d = this.video.duration;
    const time = Math.max(0, Number.isFinite(d) && d > 0 ? Math.min(t, d) : t);
    this.target = time;
    if (needsSeek(this.video.currentTime, time, this.video.paused, this.fps)) this.video.currentTime = time;
  }

  seek(t: number) {
    this.target = Math.max(0, t);
    this.video.currentTime = this.target;
  }

  async play(): Promise<void> {
    try {
      await this.video.play();
    } catch (e) {
      // A browser that refuses play() with sound before a gesture: the host decides what to do.
      this.err.textContent = (e as Error).name === "NotAllowedError" ? "Press play on the page to start the clip." : "";
    }
  }

  pause() {
    this.video.pause();
  }
}

export function definePlayer(name = "arena-player") {
  if (!customElements.get(name)) customElements.define(name, ArenaPlayer);
}
