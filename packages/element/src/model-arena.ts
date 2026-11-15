/**
 * <model-arena src="record.json" layout="arena|guidance|three-up">
 *
 * Plays a comparison record's clips on one shared clock. `src` may point at
 * one record or at a record set, whose records become tabs above the view.
 *
 * - layout="arena": the same shot from each model; play all, play alone,
 *   captions with model name, cost per clip and seconds.
 * - layout="guidance": the Motion Studio guide beside one model's output,
 *   a model switcher, how that model is steered, what it received and its
 *   composed prompt. `model` picks the first lane shown.
 * - layout="inputs": reference images as a strip, the guide and one to three
 *   outputs on one playhead with their prompts; the guide's audio plays once.
 * - layout="three-up" (default): every lane with its full caption.
 *
 * The element fills its container's width and works down to 360 px. No
 * framework, no server.
 */
import { SharedClock } from "../../core/src/clock.ts";
import { shotSummary } from "../../core/src/shot.ts";
import { parseRecord, type ArenaRecord } from "../../core/src/record.ts";
import { isRecordSet, parseRecordSet, type RecordSet } from "../../core/src/record-set.ts";
import { el } from "./captions.ts";
import { styles } from "./styles.ts";
import { arenaView, fitState, type ArenaState, type View } from "./views/arena.ts";
import { guidanceView } from "./views/guidance.ts";
import { inputsView } from "./views/inputs.ts";
import { lanesView } from "./views/lanes.ts";

const here = () => (typeof location === "undefined" ? "http://localhost/" : location.href);

export class ModelArena extends HTMLElement {
  static observedAttributes = ["src", "layout", "tab"];

  private root: ShadowRoot;
  private clock = new SharedClock();
  private unsubscribe?: () => void;
  private current?: ArenaRecord;
  private set?: { data: RecordSet; base: string; cache: Map<string, { record: ArenaRecord; base: string }> };
  private tabId?: string;
  private arenaState?: ArenaState;
  private base = here();
  private load = 0;
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
    if (name === "src" && value && value !== old) void this.fetchSource(value);
    if (name === "layout" && this.current) this.render(this.current);
    if (name === "tab" && value && this.set && value !== this.tabId) void this.showTab(value);
  }

  get record(): ArenaRecord | undefined {
    return this.current;
  }

  set record(record: unknown) {
    this.setRecord(record);
  }

  /** Hands in a record or a record set; media and tab paths resolve against `baseUrl` (default: the page). */
  setRecord(data: unknown, baseUrl = here()) {
    const attempt = ++this.load;
    const fail = (e: unknown) => this.message(`This record cannot be shown: ${(e as Error).message}`);
    try {
      // A single record renders synchronously; a set loads its first tab.
      this.accept(data, baseUrl, attempt).catch(fail);
    } catch (e) {
      fail(e);
    }
  }

  /** Not async on purpose: a bad record throws synchronously, so the message shows at once. */
  private accept(data: unknown, baseUrl: string, attempt: number): Promise<void> {
    if (isRecordSet(data)) {
      this.set = { data: parseRecordSet(data), base: baseUrl, cache: new Map() };
      return this.showTab(this.getAttribute("tab") ?? this.set.data.tabs[0]!.id, attempt);
    }
    const record = parseRecord(data);
    this.set = undefined;
    this.tabId = undefined;
    this.base = baseUrl;
    this.render(record);
    return Promise.resolve();
  }

  private async fetchJson(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async fetchSource(src: string) {
    const attempt = ++this.load;
    this.message("Loading…");
    try {
      const url = new URL(src, here()).href;
      const json = await this.fetchJson(url);
      if (attempt !== this.load) return;
      await this.accept(json, url, attempt);
    } catch (e) {
      if (attempt === this.load) this.message(`Could not load ${src}: ${(e as Error).message}`);
    }
  }

  private async showTab(id: string, attempt = ++this.load) {
    const set = this.set;
    if (!set) return;
    const tab = set.data.tabs.find((t) => t.id === id) ?? set.data.tabs[0]!;
    this.tabId = tab.id;
    try {
      let hit = set.cache.get(tab.id);
      if (!hit) {
        if (tab.record) hit = { record: parseRecord(tab.record), base: set.base };
        else {
          const url = new URL(tab.src!, set.base).href;
          hit = { record: parseRecord(await this.fetchJson(url)), base: url };
        }
        set.cache.set(tab.id, hit);
      }
      if (attempt !== this.load) return;
      this.base = hit.base;
      this.render(hit.record);
    } catch (e) {
      if (attempt === this.load) this.message(`Could not load the "${tab.label}" tab: ${(e as Error).message}`);
    }
  }

  private message(text: string) {
    this.teardown();
    const tabs = this.tabs();
    this.root.replaceChildren(
      el("style", {}, styles),
      ...(tabs ? [el("div", { class: "head" }, el("div", { class: "controls" }, tabs))] : []),
      el("div", { class: "body" }, el("p", { class: "note" }, text)),
    );
  }

  private teardown() {
    this.unsubscribe?.();
    this.clock.hide();
    this.clock = new SharedClock();
  }

  private tabs(): HTMLElement | null {
    const set = this.set;
    if (!set || set.data.tabs.length < 2) return null;
    const bar = el("div", { class: "seg tabs", role: "tablist", "aria-label": "Test" });
    const ids = set.data.tabs.map((t) => t.id);
    for (const t of set.data.tabs) {
      const on = t.id === this.tabId;
      const b = el("button", { type: "button", role: "tab", "aria-selected": String(on), tabindex: on ? "0" : "-1", "data-tab": t.id }, t.label);
      b.addEventListener("click", () => void this.showTab(t.id));
      b.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = ids[(ids.indexOf(t.id) + step + ids.length) % ids.length]!;
        void this.showTab(next).then(() => (this.root.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus());
      });
      bar.append(b);
    }
    return bar;
  }

  private render(record: ArenaRecord) {
    this.teardown();
    this.current = record;
    const layout = this.getAttribute("layout") ?? "three-up";
    const error = el("div", { class: "error", role: "status" });
    const ctx = { record, base: this.base, clock: () => this.clock, error: (msg: string) => (error.textContent = msg) };
    let view: View;
    if (layout === "arena") {
      this.arenaState = fitState(record, this.arenaState);
      view = arenaView(ctx, this.arenaState, (next) => {
        this.arenaState = next;
        this.render(record);
      });
    } else if (layout === "inputs") view = inputsView(ctx);
    else view = layout === "guidance" ? guidanceView(ctx, this.getAttribute("model")) : lanesView(ctx, layout);

    const tabs = this.tabs();
    const controls = [...(tabs ? [tabs] : []), ...(view.controls ?? [])];
    const head = el(
      "div",
      { class: "head" },
      el("div", { class: "title" }, el("h2", {}, record.title), el("span", { class: "meta" }, `${record.lanes.length} lanes`)),
      controls.length ? el("div", { class: "controls" }, ...controls) : null,
    );
    // The one intent behind every composed lane prompt, when the record carries it.
    const intent = record.shot
      ? el("p", { class: "intent" }, el("span", { class: "id" }, "One shot description, composed per model: "), shotSummary(record.shot))
      : null;
    this.root.replaceChildren(el("style", {}, styles), head, ...(intent ? [intent] : []), error, el("div", { class: "body" }, ...view.nodes));
    this.dataset.layout = layout;
    this.unsubscribe = this.clock.subscribe((s) => {
      view.update(s);
      if (s.error) error.textContent = s.error;
    });
  }
}

export function define(name = "model-arena") {
  if (!customElements.get(name)) customElements.define(name, ModelArena);
}
