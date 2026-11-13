/**
 * <arena-gallery src="runs.json">: published comparison records, playable
 * without a key. A switcher picks the record; a view toggle shows the guide
 * beside one output ("Guide beside output", the guidance layout) or every
 * output ("All outputs"). Under the player: the shot the lane's prompt came
 * from, so a reader sees this path, this prompt, this output.
 *
 * `src` is a JSON array of records or of record URLs (relative to the list),
 * or `{ "records": [...] }`. Media paths resolve against each record's URL.
 * Property `records`; method `add(record, baseUrl?)` (e.g. from
 * <arena-generate>'s `arena-gallery-add`). With no records it shows
 * "No published runs yet".
 */
import type { ShotDescription } from "../../core/src/compose.ts";
import { parseRecord, type ArenaRecord } from "../../core/src/record.ts";
import { el } from "./captions.ts";
import { generateStyles } from "./generate/styles.ts";
import { define as defineArena, type ModelArena } from "./model-arena.ts";

interface Entry {
  record: ArenaRecord;
  base: string;
}

const here = () => (typeof location === "undefined" ? "http://localhost/" : location.href);
const MAX = 50;

/** One line from a lane's (or the record's) shot: subject, environment, action, legend. */
export function shotLine(s: ShotDescription | undefined): string | null {
  if (!s) return null;
  return [`${s.subject} ${s.action}`.trim(), s.environment, s.legend].filter(Boolean).join(" · ");
}

export class ArenaGallery extends HTMLElement {
  static observedAttributes = ["src"];
  private root: ShadowRoot;
  private entries: Entry[] = [];
  private index = 0;
  private view: "guidance" | "arena" = "guidance";
  private skipped: string[] = [];
  private load = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    defineArena();
    if (!this.getAttribute("src")) this.render();
  }

  attributeChangedCallback(_n: string, old: string | null, value: string | null) {
    if (value && value !== old) void this.fetchList(value);
  }

  get records(): ArenaRecord[] {
    return this.entries.map((e) => e.record);
  }

  set records(list: unknown[]) {
    this.entries = [];
    this.skipped = [];
    for (const r of Array.isArray(list) ? list.slice(0, MAX) : []) this.accept(r, here());
    this.index = 0;
    this.render();
  }

  /** Adds a record and shows it. Returns false when it does not validate. */
  add(record: unknown, baseUrl = here()): boolean {
    const ok = this.accept(record, baseUrl);
    if (ok) this.index = this.entries.length - 1;
    this.render();
    return ok;
  }

  private accept(v: unknown, base: string): boolean {
    try {
      const record = parseRecord(v);
      const at = this.entries.findIndex((e) => e.record.id === record.id);
      if (at >= 0) this.entries[at] = { record, base };
      else this.entries.push({ record, base });
      return true;
    } catch (e) {
      this.skipped.push((e as Error).message);
      return false;
    }
  }

  private async fetchList(src: string) {
    const attempt = ++this.load;
    try {
      const url = new URL(src, here()).href;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      const list = Array.isArray(json) ? json : Array.isArray((json as { records?: unknown }).records) ? (json as { records: unknown[] }).records : null;
      if (!list) throw new Error("expected an array of records");
      const entries: Entry[] = [];
      this.skipped = [];
      for (const item of list.slice(0, MAX)) {
        if (typeof item === "string") {
          const rUrl = new URL(item, url).href;
          const r = await fetch(rUrl);
          if (!r.ok) {
            this.skipped.push(`${item}: HTTP ${r.status}`);
            continue;
          }
          entries.push(...this.tryParse(await r.json(), rUrl));
        } else entries.push(...this.tryParse(item, url));
      }
      if (attempt !== this.load) return;
      this.entries = entries;
      this.index = 0;
      this.render();
    } catch (e) {
      if (attempt === this.load) this.render(`Could not load ${src}: ${(e as Error).message}`);
    }
  }

  private tryParse(v: unknown, base: string): Entry[] {
    try {
      return [{ record: parseRecord(v), base }];
    } catch (e) {
      this.skipped.push((e as Error).message);
      return [];
    }
  }

  private render(problem?: string) {
    const style = el("style", {}, generateStyles);
    if (!this.entries.length) {
      this.root.replaceChildren(
        style,
        el("div", { class: "empty", "data-empty": "" }, el("strong", {}, "No published runs yet"), problem ?? "Runs added to the gallery show up here, playable without a key."),
      );
      return;
    }
    const entry = this.entries[Math.min(this.index, this.entries.length - 1)]!;
    const hasGuide = Boolean(entry.record.guide);
    const view = hasGuide ? this.view : "arena";

    const pick = el("div", { class: "switch", role: "group", "aria-label": "Run" });
    this.entries.forEach((e, i) => {
      const b = el("button", { type: "button", "aria-pressed": String(e === entry), "data-record": e.record.id }, e.record.title.slice(0, 48));
      b.addEventListener("click", () => ((this.index = i), this.render()));
      pick.append(b);
    });
    const views = el("div", { class: "switch", role: "group", "aria-label": "View" });
    for (const [id, label] of [["guidance", "Guide beside output"], ["arena", "All outputs"]] as const) {
      const b = el("button", { type: "button", "aria-pressed": String(view === id), "data-view": id }, label);
      b.disabled = id === "guidance" && !hasGuide;
      b.addEventListener("click", () => ((this.view = id), this.render()));
      views.append(b);
    }
    const arena = document.createElement("model-arena") as ModelArena;
    arena.setAttribute("layout", view);
    arena.setRecord(entry.record, entry.base);
    const lane = entry.record.lanes.find((l) => l.shot) ?? entry.record.lanes[0];
    const shot = shotLine(lane?.shot ?? entry.record.shot);
    this.root.replaceChildren(
      style,
      el(
        "div",
        { class: "wrap" },
        el("div", { class: "row spread" }, pick, views),
        arena,
        shot ? el("p", { class: "caption", "data-shot": "" }, el("strong", {}, "Shot: "), shot) : null,
        this.skipped.length ? el("p", { class: "note" }, `${this.skipped.length} record(s) skipped: ${this.skipped[0]}`) : null,
      ),
    );
  }
}

export function defineGallery(name = "arena-gallery") {
  if (!customElements.get(name)) customElements.define(name, ArenaGallery);
}
