/**
 * <model-arena src="record.json" layout="three-up">
 *
 * Plays a comparison record's lanes side by side on one shared clock: play
 * all, play one alone, seek, one playhead across every lane, and a caption
 * under each clip saying what the model was given, what ran, what it cost and
 * how long it took. Set `src` to fetch a record, or the `record` property to
 * hand one in. No framework, no server.
 */
import { SharedClock, type ClockState } from "../../core/src/clock.ts";
import { parseRecord, type ArenaRecord } from "../../core/src/record.ts";
import { caption, el, mediaUrl } from "./captions.ts";
import { styles } from "./styles.ts";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

export class ModelArena extends HTMLElement {
  static observedAttributes = ["src", "layout"];

  private root: ShadowRoot;
  private clock = new SharedClock();
  private unsubscribe?: () => void;
  private current?: ArenaRecord;
  private base = typeof location === "undefined" ? "http://localhost/" : location.href;
  private load = 0;
  private ui?: {
    play: HTMLButtonElement;
    scrub: HTMLInputElement;
    time: HTMLElement;
    error: HTMLElement;
    bars: HTMLElement[];
    solos: Map<string, HTMLButtonElement>;
  };
  private scrubbing = false;
  private onHide = () => document.hidden && this.clock.hide();

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    document.addEventListener("visibilitychange", this.onHide);
    if (!this.current && !this.getAttribute("src")) this.message("Set src to a record URL.");
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this.onHide);
    this.clock.hide();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (name === "src" && value && value !== old) void this.fetchRecord(value);
    if (name === "layout" && this.current) this.render(this.current);
  }

  get record(): ArenaRecord | undefined {
    return this.current;
  }

  /** Hands in a record directly; media paths resolve against `baseUrl` (default: the page). */
  setRecord(record: unknown, baseUrl = typeof location === "undefined" ? "http://localhost/" : location.href) {
    this.load++;
    try {
      this.base = baseUrl;
      this.render(parseRecord(record));
    } catch (e) {
      this.message(`This record cannot be shown: ${(e as Error).message}`);
    }
  }

  set record(record: unknown) {
    this.setRecord(record);
  }

  private async fetchRecord(src: string) {
    const attempt = ++this.load;
    this.message("Loading…");
    try {
      const url = new URL(src, location.href).href;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (attempt !== this.load) return;
      this.base = url;
      this.render(parseRecord(json));
    } catch (e) {
      if (attempt === this.load) this.message(`Could not load ${src}: ${(e as Error).message}`);
    }
  }

  private message(text: string) {
    this.teardown();
    this.root.replaceChildren(el("style", {}, styles), el("p", { class: "note" }, text));
  }

  private teardown() {
    this.unsubscribe?.();
    this.clock.hide();
    this.clock = new SharedClock();
    this.ui = undefined;
  }

  private render(record: ArenaRecord) {
    this.teardown();
    this.current = record;
    const layout = this.getAttribute("layout") ?? "three-up";
    const columns = layout === "three-up" ? Math.min(3, record.lanes.length) : 3;

    const play = el("button", { class: "primary", type: "button" }, "Play all");
    play.addEventListener("click", () => void this.clock.play());
    const scrub = el("input", { type: "range", min: "0", max: "0", step: String(1 / 24), value: "0", "aria-label": "Playhead" });
    scrub.addEventListener("input", () => {
      this.scrubbing = true;
      this.clock.seek(Number(scrub.value));
    });
    scrub.addEventListener("change", () => (this.scrubbing = false));
    const time = el("span", { class: "time" }, "0:00.0 / 0:00.0");
    const error = el("div", { class: "error", role: "status" });

    const bars: HTMLElement[] = [];
    const solos = new Map<string, HTMLButtonElement>();
    const lanes = el("div", { class: "lanes" });
    lanes.style.setProperty("--ma-columns", String(columns));

    for (const lane of record.lanes) {
      const src = lane.output ? mediaUrl(lane.output.src, this.base) : null;
      const screen = el("div", { class: "screen" });
      if (src) {
        const video = el("video", { src, muted: "", playsinline: "", preload: "auto", "aria-label": lane.label ?? lane.model });
        video.muted = true;
        video.addEventListener("loadedmetadata", () => this.clock.loaded());
        video.addEventListener("error", () => error.textContent = `${lane.label ?? lane.id}: the clip did not load.`);
        screen.append(video);
        this.clock.add(lane.id, video);
      } else screen.append(el("div", { class: "badge" }, lane.status === "pending" ? "Not run yet" : "No output"));
      if (lane.status === "placeholder") screen.append(el("div", { class: "badge" }, "Placeholder clip"));
      const bar = el("span");
      screen.append(el("div", { class: "playhead" }, bar));
      bars.push(bar);
      const { node, solo } = caption(lane, this.base, () => void this.clock.solo(lane.id));
      if (!src) solo.disabled = true;
      solos.set(lane.id, solo);
      lanes.append(
        el("article", { class: `lane${record.preferredLane === lane.id ? " preferred" : ""}`, "data-lane": lane.id }, screen, node),
      );
    }

    const head = el(
      "div",
      { class: "head" },
      el("h2", {}, record.title),
      el("span", { class: "meta" }, `${record.lanes.length} lanes${record.preferredLane ? ` · preferred: ${record.preferredLane}` : ""}`),
    );
    const observations = record.observations?.length
      ? el("ul", { class: "note" }, ...record.observations.map((o) => el("li", {}, o)))
      : null;

    this.root.replaceChildren(
      el("style", {}, styles),
      head,
      el("div", { class: "transport" }, play, scrub, time),
      error,
      lanes,
      ...(observations ? [observations] : []),
    );
    this.ui = { play, scrub, time, error, bars, solos };
    this.unsubscribe = this.clock.subscribe((s) => this.update(s));
  }

  private update(s: ClockState) {
    const ui = this.ui;
    if (!ui) return;
    ui.play.textContent = s.playing ? "Pause" : "Play all";
    ui.scrub.max = String(s.duration || 0);
    if (!this.scrubbing) ui.scrub.value = String(s.time);
    ui.time.textContent = `${fmt(s.time)} / ${fmt(s.duration)}`;
    const pct = s.duration ? `${Math.min(100, (s.time / s.duration) * 100)}%` : "0%";
    ui.bars.forEach((b) => (b.style.width = pct));
    for (const [id, b] of ui.solos) {
      b.textContent = s.soloing === id ? "Stop" : "Play alone";
      b.setAttribute("aria-pressed", String(s.soloing === id));
    }
    if (s.error) ui.error.textContent = s.error;
  }
}

export function define(name = "model-arena") {
  if (!customElements.get(name)) customElements.define(name, ModelArena);
}
