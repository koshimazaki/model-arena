/**
 * <arena-generate>: run a guide bundle through one video model with the
 * reader's own key, then play the guide and the result on one clock.
 *
 * Attributes: `subject`, `environment`, `action`, `legend` (the shot; the
 * bundle's recipe.json `shot` fills any left out), `prompt` (free text that
 * replaces the composed prompt), `model` (kling-4 default), `max-price` (USD,
 * default 2), `guide-src` (a bundle directory URL), `key-panel` (the id of an
 * <arena-key>; otherwise the first on the page, otherwise its own), `theme`.
 * Properties: `guide` (FileList, File[] or name → Blob), `fetch` and
 * `pollOptions` (a fake provider), `confirm` (replaces the inline cost check).
 * Events: `arena-generate-progress`, `arena-generate-result`,
 * `arena-generate-error`, `arena-gallery-add` (detail.record).
 */
import type { ArenaRecord } from "../../../core/src/record.ts";
import type { FetchLike } from "../../../../providers/runware-api/client.ts";
import { blobEntry, entriesOf, generateFromGuide, GenerateError, type CostQuestion, type GenerateOptions } from "../../../../providers/runware-api/generate.ts";
import { loadGuideBundle, loadImage, type GuideShot, type LoadedGuide } from "../../../../providers/runware-api/guide-bundle.ts";
import { guideModels, planGuideLane } from "../../../../providers/runware-api/guide-plan.ts";
import type { LaneMedia } from "../../../../providers/types.ts";
import { el, usd } from "../captions.ts";
import { defineKey, type ArenaKey } from "../key-panel.ts";
import { promptPreview } from "./prompt-preview.ts";
import { resultView } from "./result-view.ts";
import { generateStyles } from "./styles.ts";

const SHOT_FIELDS = [
  ["subject", "Subject", "Who or what moves"],
  ["environment", "Environment", "Where it happens"],
  ["action", "Action", "What it does along the path"],
  ["legend", "Colour legend", "e.g. The orange figure is the character"],
] as const;
type ShotField = (typeof SHOT_FIELDS)[number][0];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const here = () => (typeof location === "undefined" ? "http://localhost/" : location.href);

export class ArenaGenerate extends HTMLElement {
  static observedAttributes = ["guide-src"];
  /** A fake or wrapped fetch for the provider; the page's fetch otherwise. */
  fetch?: FetchLike;
  pollOptions?: GenerateOptions["poll"];
  /** Replaces the inline "spend up to" check. */
  confirm?: (q: CostQuestion) => boolean | Promise<boolean>;

  private root: ShadowRoot;
  private urls = new Map<string, string>();
  private base = here();
  private loaded?: LoadedGuide;
  private character?: { media: LaneMedia; blob: Blob; url: string };
  private abort?: AbortController;
  private ownKey?: ArenaKey;
  private ui?: {
    model: () => string;
    fields: Record<ShotField, HTMLInputElement>;
    override: HTMLTextAreaElement;
    maxPrice: HTMLInputElement;
    guideInfo: HTMLElement;
    charSlot: HTMLElement;
    preview: HTMLElement;
    estimate: HTMLElement;
    run: HTMLButtonElement;
    stop: HTMLButtonElement;
    confirmSlot: HTMLElement;
    status: HTMLElement;
    error: HTMLElement;
    result: HTMLElement;
  };

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (!this.ui) this.build();
    const src = this.getAttribute("guide-src");
    if (src && !this.loaded) void this.fetchGuide(src);
  }

  attributeChangedCallback(_n: string, old: string | null, value: string | null) {
    if (this.ui && value && value !== old) void this.fetchGuide(value);
  }

  /** A bundle: FileList, File[] or name → Blob. */
  set guide(src: Iterable<File> | ArrayLike<File> | Record<string, Blob>) {
    void this.setGuide(src, here());
  }

  /** The loaded guide, or undefined. */
  get guide(): LoadedGuide | undefined {
    return this.loaded;
  }

  private keySource(): ArenaKey | undefined {
    const id = this.getAttribute("key-panel");
    const named = id ? (document.getElementById(id) as ArenaKey | null) : null;
    if (named && typeof named.getKey === "function") return named;
    const any = document.querySelector("arena-key") as ArenaKey | null;
    return any && typeof any.getKey === "function" ? any : this.ownKey;
  }

  private shot(): GuideShot | null {
    const f = this.ui!.fields;
    const v = (k: ShotField) => f[k].value.trim();
    if (!v("subject")) return null;
    return { subject: v("subject"), action: v("action"), ...(v("environment") ? { environment: v("environment") } : {}), ...(v("legend") ? { legend: v("legend") } : {}) };
  }

  private async fetchGuide(src: string) {
    try {
      const dir = new URL(src.endsWith("/") ? src : `${src}/`, here()).href;
      const get = async (name: string) => {
        const res = await fetch(new URL(name, dir).href);
        if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
        return res.blob();
      };
      const manifest = JSON.parse(await (await get("bundle.json")).text()) as Record<string, unknown>;
      const names = ["video", "audio", "firstFrame", "beats", "recipe", "meta", "camera"].map((k) => manifest[k]).filter((n): n is string => typeof n === "string" && /^[A-Za-z0-9._-]{1,255}$/.test(n));
      const files: Record<string, Blob> = { "bundle.json": new Blob([JSON.stringify(manifest)], { type: "application/json" }) };
      for (const n of names) {
        try {
          files[n] = await get(n);
        } catch (e) {
          if (n !== manifest.recipe && n !== manifest.camera) throw e;
        }
      }
      await this.setGuide(files, dir);
    } catch (e) {
      this.fail(`Could not load the guide bundle: ${(e as Error).message}`);
    }
  }

  private async setGuide(src: Iterable<File> | ArrayLike<File> | Record<string, Blob>, base: string) {
    const ui = this.ui ?? (this.build(), this.ui!);
    try {
      const entries = entriesOf(src);
      const map = new Map<string, Blob>();
      const list = Array.isArray(src) || (src as ArrayLike<File>).length !== undefined ? Array.from(src as ArrayLike<File>) : null;
      if (list) for (const f of list) map.set(f.name.split(/[\\/]/).pop()!, f);
      else for (const [k, b] of Object.entries(src as Record<string, Blob>)) map.set(k, b);
      const loaded = await loadGuideBundle(entries);
      for (const u of this.urls.values()) if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      this.urls = new Map([...map].filter(([n]) => !n.endsWith(".json")).map(([n, b]) => [n, URL.createObjectURL(b)]));
      this.base = base;
      this.loaded = loaded;
      // The recipe's shot fills every field the page left empty.
      for (const [k] of SHOT_FIELDS) {
        const val = loaded.shot?.[k];
        if (val && !ui.fields[k].value && !this.getAttribute(k)) ui.fields[k].value = val;
      }
      const m = loaded.meta;
      ui.guideInfo.textContent = `Guide: ${loaded.video.name} · ${m.width}×${m.height} · ${m.fps} fps · ${loaded.seconds} s${loaded.audio ? ` · audio ${loaded.audio.name}` : " · no audio"}`;
      ui.error.textContent = "";
      this.refresh();
    } catch (e) {
      this.fail((e as Error).message);
    }
  }

  private fail(msg: string, code = "bad-bundle") {
    if (this.ui) this.ui.error.textContent = msg;
    this.dispatchEvent(new CustomEvent("arena-generate-error", { bubbles: true, composed: true, detail: { code, message: msg } }));
  }

  private refresh() {
    const ui = this.ui!;
    const facts = { seconds: this.loaded?.seconds ?? 5, hasAudio: this.loaded ? Boolean(this.loaded.audio) : true, hasCharacter: Boolean(this.character) };
    ui.preview.replaceChildren(promptPreview({ shot: this.shot(), override: ui.override.value, model: ui.model(), facts }));
    let text = "Load a guide bundle to see the estimate.";
    if (this.loaded) {
      try {
        const lp = planGuideLane({ guide: this.loaded, model: ui.model(), shot: this.shot() ?? undefined, prompt: ui.override.value, character: this.character?.media });
        text = `Estimated ${usd(lp.plan.estimate.usd)} (${lp.plan.estimate.basis}). Sends: ${lp.plan.inputsSent.map((i) => `${i.role} ${i.label}`).join(", ")}.`;
      } catch (e) {
        text = (e as Error).message;
      }
    }
    ui.estimate.textContent = text;
    ui.run.disabled = !this.loaded || Boolean(this.abort);
  }

  private askInline(q: CostQuestion): Promise<boolean> {
    const slot = this.ui!.confirmSlot;
    return new Promise((resolve) => {
      const yes = el("button", { type: "button", class: "primary", "data-action": "confirm" }, `Spend up to ${usd(q.usd)}`);
      const no = el("button", { type: "button", "data-action": "cancel" }, "Cancel");
      const done = (v: boolean) => (slot.replaceChildren(), resolve(v));
      yes.addEventListener("click", () => done(true));
      no.addEventListener("click", () => done(false));
      slot.replaceChildren(
        el("div", { class: "confirm", role: "group", "aria-label": "Confirm cost" }, el("p", { class: "caption" }, `${q.modelName}: estimated ${usd(q.usd)} (${q.basis}); your cap is ${usd(q.maxPrice)}.`), el("div", { class: "row" }, yes, no)),
      );
      yes.focus();
    });
  }

  private async run() {
    const ui = this.ui!;
    if (!this.loaded) return;
    const key = this.keySource();
    if (!key?.connected) return this.fail("Connect your Runware key first.", "invalid-key");
    this.abort = new AbortController();
    ui.run.disabled = true;
    ui.stop.hidden = false;
    ui.error.textContent = "";
    ui.result.replaceChildren();
    try {
      const r = await generateFromGuide({
        guide: this.loaded,
        model: ui.model(),
        shot: this.shot() ?? undefined,
        prompt: ui.override.value,
        characterImage: this.character?.blob,
        maxPrice: Number(ui.maxPrice.value),
        key: key.getKey,
        confirm: this.confirm ?? ((q) => this.askInline(q)),
        signal: this.abort.signal,
        fetch: this.fetch,
        poll: this.pollOptions,
        onProgress: (p) => {
          ui.status.textContent = `${p.stage}: ${p.message}${p.progress !== undefined ? ` ${p.progress}%` : ""}`;
          this.dispatchEvent(new CustomEvent("arena-generate-progress", { bubbles: true, composed: true, detail: { ...p } }));
        },
      });
      ui.result.replaceChildren(
        resultView(r, this.urls, this.base, (record: ArenaRecord) =>
          this.dispatchEvent(new CustomEvent("arena-gallery-add", { bubbles: true, composed: true, detail: { record } })),
        ),
      );
      const { task: _task, ...detail } = r;
      this.dispatchEvent(new CustomEvent("arena-generate-result", { bubbles: true, composed: true, detail }));
    } catch (e) {
      const err = e instanceof GenerateError ? e : new GenerateError("provider", (e as Error).message);
      this.fail(err.message, err.code);
    } finally {
      this.abort = undefined;
      ui.stop.hidden = true;
      ui.confirmSlot.replaceChildren();
      this.refresh();
    }
  }

  private async pickCharacter(file: File | undefined) {
    const ui = this.ui!;
    if (this.character) URL.revokeObjectURL(this.character.url);
    this.character = undefined;
    ui.charSlot.replaceChildren();
    if (file) {
      if (!IMAGE_TYPES.includes(file.type) || file.size > 30 * 1048576) this.fail("The character sheet must be a PNG, JPEG or WebP image up to 30 MB.", "refused");
      else {
        const media = await loadImage(blobEntry(file, file.name));
        const url = URL.createObjectURL(file);
        this.character = { media, blob: file, url };
        const clear = el("button", { type: "button", "data-action": "clear-character" }, "Remove");
        clear.addEventListener("click", () => void this.pickCharacter(undefined));
        ui.charSlot.append(el("img", { src: url, alt: "Character sheet" }), el("span", { class: "note" }, `${file.name}${media.info?.width ? ` · ${media.info.width}×${media.info.height}` : ""}`), clear);
      }
    }
    this.refresh();
  }

  private build() {
    const models = guideModels();
    const initial = models.some((m) => m.key === this.getAttribute("model")) ? this.getAttribute("model")! : models[0]!.key;
    const radios = models.map((m) => {
      const r = el("input", { type: "radio", name: "model", value: m.key, "data-model": m.key });
      r.checked = m.key === initial;
      return { m, r };
    });
    const modelSet = el(
      "fieldset",
      {},
      el("legend", {}, "Model"),
      el("div", { class: "models" }, ...radios.map(({ m, r }) =>
        el("label", { class: "model-opt" }, r, el("span", {}, m.name, m.use === "audio-first-frame" ? el("span", { class: "badge" }, "audio + first frame only") : null), el("span", { class: "line" }, m.line)),
      )),
    );
    const fields = {} as Record<ShotField, HTMLInputElement>;
    const shotSet = el("fieldset", {}, el("legend", {}, "Shot description"));
    const grid = el("div", { class: "fields" });
    for (const [k, label, hint] of SHOT_FIELDS) {
      fields[k] = el("input", { type: "text", maxlength: k === "legend" ? "300" : "500", placeholder: hint, "data-field": k, value: this.getAttribute(k) ?? "" });
      grid.append(el("label", { class: "f" }, label, fields[k]));
    }
    const override = el("textarea", { maxlength: "5000", "data-field": "prompt", placeholder: "Leave empty to use the composed prompt" });
    override.value = this.getAttribute("prompt") ?? "";
    const own = el("details", {}, el("summary", {}, "Write my own prompt instead"), override);
    if (override.value) own.open = true;
    shotSet.append(grid, own);

    const charInput = el("input", { type: "file", accept: IMAGE_TYPES.join(","), "data-field": "character" });
    const charSlot = el("span", { class: "row" });
    const drop = el("div", { class: "drop", "data-drop": "character" }, el("span", { class: "note" }, "Character sheet (optional): drop an image or"), charInput, charSlot);
    drop.addEventListener("dragover", (e) => (e.preventDefault(), drop.classList.add("over")));
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      void this.pickCharacter(e.dataTransfer?.files[0]);
    });
    charInput.addEventListener("change", () => void this.pickCharacter(charInput.files?.[0]));

    const bundleInput = el("input", { type: "file", multiple: "", accept: ".json,.mp4,.wav,.mp3,.png,.jpg", "data-field": "bundle" });
    bundleInput.addEventListener("change", () => bundleInput.files?.length && void this.setGuide(bundleInput.files, here()));
    const guideInfo = el("p", { class: "note", "data-guide": "" }, "No guide yet: choose the bundle's files.");

    const maxPrice = el("input", { type: "number", min: "0.1", max: "100", step: "0.1", value: this.getAttribute("max-price") ?? "2", "data-field": "max-price" });
    const run = el("button", { type: "button", class: "primary", "data-action": "run" }, "Run");
    const stop = el("button", { type: "button", "data-action": "stop" }, "Stop");
    stop.hidden = true;
    run.addEventListener("click", () => void this.run());
    stop.addEventListener("click", () => this.abort?.abort());

    const ui = {
      model: () => radios.find(({ r }) => r.checked)?.m.key ?? initial,
      fields,
      override,
      maxPrice,
      guideInfo,
      charSlot,
      preview: el("div", { "data-preview": "" }),
      estimate: el("p", { class: "note", "data-estimate": "" }),
      run,
      stop,
      confirmSlot: el("div"),
      status: el("p", { class: "status", role: "status" }),
      error: el("p", { class: "err", role: "alert" }),
      result: el("div", { "data-result": "" }),
    };
    this.ui = ui;
    for (const input of [...Object.values(fields), override]) input.addEventListener("input", () => this.refresh());
    for (const { r } of radios) r.addEventListener("change", () => this.refresh());

    const keySlot = el("div");
    if (!this.keySource()) {
      defineKey();
      this.ownKey = el("arena-key" as "div") as unknown as ArenaKey;
      keySlot.append(this.ownKey);
    }
    this.root.replaceChildren(
      el("style", {}, generateStyles),
      el(
        "div",
        { class: "wrap" },
        el("h3", {}, "Generate from this guide"),
        keySlot,
        el("div", { class: "row" }, bundleInput, guideInfo),
        modelSet,
        shotSet,
        drop,
        ui.preview,
        el("div", { class: "row" }, el("label", { class: "f" }, "Price cap, USD", maxPrice), run, stop),
        ui.estimate,
        ui.confirmSlot,
        ui.status,
        ui.error,
        ui.result,
      ),
    );
    this.refresh();
  }
}

export function defineGenerate(name = "arena-generate") {
  if (!customElements.get(name)) customElements.define(name, ArenaGenerate);
}
