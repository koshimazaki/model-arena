/**
 * <arena-generate>: run a guide bundle through one video model with the
 * reader's own key, then play the guide and the result on one clock.
 *
 * Attributes: `subject`, `environment`, `action`, `legend` (the shot; the
 * bundle's recipe.json `shot` fills any left out), `prompt` (free text that
 * replaces the composed prompt), `model` (kling-4 default), `max-price` (USD,
 * default 2), `guide-src` (a bundle directory URL), `preset` (a preset JSON
 * URL: bundle, references, shot, model), `key-panel` (the id of an
 * <arena-key>; otherwise the first on the page, otherwise its own), `theme`.
 * Properties: `guide` (FileList, File[] or name → Blob), `references`
 * ({ character?, environment? } as Blobs), `preset` (an object), `fetch` and
 * `pollOptions` (a fake provider), `confirm` (replaces the inline cost check).
 * Method: `loadPreset(preset, baseUrl?)`.
 * Events: `arena-generate-progress`, `arena-generate-result`,
 * `arena-generate-error`, `arena-gallery-add` (detail.record).
 */
import type { ArenaRecord } from "../../../core/src/record.ts";
import type { FetchLike } from "../../../../providers/runware-api/client.ts";
import { entriesOf, generateFromGuide, GenerateError, reference, type CostQuestion, type GenerateOptions, type ReferenceInput } from "../../../../providers/runware-api/generate.ts";
import { loadGuideBundle, type GuideShot, type LoadedGuide } from "../../../../providers/runware-api/guide-bundle.ts";
import { planGuideLane } from "../../../../providers/runware-api/guide-plan.ts";
import type { LaneMedia } from "../../../../providers/types.ts";
import { el, usd } from "../captions.ts";
import { defineKey, type ArenaKey } from "../key-panel.ts";
import { buildForm, refSlot, SHOT_FIELDS, type Form, type RefRole, type RefSlot, type ShotField } from "./form.ts";
import { fetchBundle, fetchReference, parsePreset, type GeneratePreset } from "./preset.ts";
import { promptPreview } from "./prompt-preview.ts";
import { resultView } from "./result-view.ts";
import { generateStyles } from "./styles.ts";

const here = () => (typeof location === "undefined" ? "http://localhost/" : location.href);
type BundleFiles = Iterable<File> | ArrayLike<File> | Record<string, Blob>;
interface HeldRef {
  input: ReferenceInput;
  media: LaneMedia;
  url: string;
}

export class ArenaGenerate extends HTMLElement {
  static observedAttributes = ["guide-src", "preset"];
  /** A fake or wrapped fetch for the provider; the page's fetch otherwise. */
  fetch?: FetchLike;
  pollOptions?: GenerateOptions["poll"];
  /** Replaces the inline "spend up to" check. */
  confirm?: (q: CostQuestion) => boolean | Promise<boolean>;

  private root: ShadowRoot;
  private urls = new Map<string, string>();
  private base = here();
  private loaded?: LoadedGuide;
  private refs: Partial<Record<RefRole, HeldRef>> = {};
  private slots?: Record<RefRole, RefSlot>;
  private abort?: AbortController;
  private ownKey?: ArenaKey;
  private ui?: Form;
  private pending?: Promise<void>;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (!this.ui) this.build();
    const preset = this.getAttribute("preset");
    const src = this.getAttribute("guide-src");
    if (preset && !this.loaded) void this.fetchPreset(preset);
    else if (src && !this.loaded) void this.loadFrom(src);
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (!this.ui || !value || value === old) return;
    if (name === "preset") void this.fetchPreset(value);
    else void this.loadFrom(value);
  }

  /** A bundle: FileList, File[] or name → Blob. */
  set guide(src: BundleFiles) {
    this.pending = this.setGuide(src, here());
  }

  /** The loaded guide, or undefined. */
  get guide(): LoadedGuide | undefined {
    return this.loaded;
  }

  /** Host-supplied reference images; a missing role is cleared. */
  set references(r: { character?: ReferenceInput; environment?: ReferenceInput } | undefined) {
    this.pending = Promise.all([this.setRef("character", r?.character), this.setRef("environment", r?.environment)]).then(() => undefined);
  }

  get references(): { character?: ReferenceInput; environment?: ReferenceInput } {
    return { ...(this.refs.character ? { character: this.refs.character.input } : {}), ...(this.refs.environment ? { environment: this.refs.environment.input } : {}) };
  }

  set preset(p: GeneratePreset) {
    this.pending = this.loadPreset(p);
  }

  /** Resolves once the last guide, references or preset handed in has loaded. */
  whenReady(): Promise<void> {
    return this.pending ?? Promise.resolve();
  }

  /** Loads a bundle, its references, shot and model; URLs resolve against `baseUrl`. */
  async loadPreset(p: unknown, baseUrl = here()): Promise<void> {
    if (!this.ui) this.build();
    const ui = this.ui!;
    try {
      const preset = parsePreset(p);
      const abs = (u: string) => new URL(u, baseUrl).href;
      const { files, dir } = await fetchBundle(abs(preset.bundle));
      await this.setGuide(files, dir, true);
      for (const role of ["character", "environment"] as const) {
        const u = preset.references?.[role];
        await this.setRef(role, u ? await fetchReference(abs(u)) : undefined);
      }
      if (preset.shot) for (const [k] of SHOT_FIELDS) ui.fields[k].value = preset.shot[k] ?? "";
      if (preset.model) ui.setModel(preset.model);
      ui.override.value = preset.prompt ?? "";
      ui.own.open = Boolean(ui.override.value);
      this.refresh();
    } catch (e) {
      this.fail(`Could not load the preset: ${(e as Error).message}`);
    }
  }

  private async fetchPreset(src: string) {
    try {
      const href = new URL(src, here()).href;
      const res = await fetch(href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.pending = this.loadPreset(await res.json(), href);
      await this.pending;
    } catch (e) {
      this.fail(`Could not load the preset: ${(e as Error).message}`);
    }
  }

  private async loadFrom(src: string) {
    try {
      const { files, dir } = await fetchBundle(new URL(src, here()).href);
      this.pending = this.setGuide(files, dir, true);
      await this.pending;
    } catch (e) {
      this.fail(`Could not load the guide bundle: ${(e as Error).message}`);
    }
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

  private async setGuide(src: BundleFiles, base: string, published = false) {
    const ui = this.ui ?? (this.build(), this.ui!);
    try {
      const map = new Map<string, Blob>();
      const list = Array.isArray(src) || (src as ArrayLike<File>).length !== undefined ? Array.from(src as ArrayLike<File>) : null;
      if (list) for (const f of list) map.set(f.name.split(/[\\/]/).pop()!, f);
      else for (const [k, b] of Object.entries(src as Record<string, Blob>)) map.set(k, b);
      // A bundle fetched from a URL is published: the record points at it, so the gallery can play it later.
      const loaded = await loadGuideBundle(entriesOf(src), published ? { base } : {});
      for (const [n, u] of this.urls) if (!Object.values(this.refs).some((r) => r?.media.displaySrc === n)) URL.revokeObjectURL(u);
      this.urls = new Map([...map].filter(([n]) => !n.endsWith(".json")).map(([n, b]) => [n, URL.createObjectURL(b)]));
      for (const r of Object.values(this.refs)) if (r) this.urls.set(r.media.displaySrc ?? r.media.name, r.url);
      this.base = base;
      this.loaded = loaded;
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

  private async setRef(role: RefRole, input: ReferenceInput | undefined) {
    if (!this.ui) this.build();
    const slot = this.slots![role];
    const old = this.refs[role];
    if (old) URL.revokeObjectURL(old.url);
    delete this.refs[role];
    slot.shown.replaceChildren();
    if (input) {
      try {
        const media = (await reference(input, role))!;
        const blob = input instanceof Blob ? input : input.blob;
        const url = URL.createObjectURL(blob);
        this.refs[role] = { input, media, url };
        this.urls.set(media.displaySrc ?? media.name, url);
        const clear = el("button", { type: "button", "data-action": `clear-${role}` }, "Remove");
        clear.addEventListener("click", () => void this.setRef(role, undefined).then(() => this.refresh()));
        slot.shown.append(el("img", { src: url, alt: role === "character" ? "Character sheet" : "Environment" }), el("span", { class: "note" }, `${media.name}${media.info?.width ? ` · ${media.info.width}×${media.info.height}` : ""}`), clear);
      } catch (e) {
        this.fail((e as Error).message, "refused");
      }
    }
    this.refresh();
  }

  private fail(msg: string, code = "bad-bundle") {
    if (this.ui) this.ui.error.textContent = msg;
    this.dispatchEvent(new CustomEvent("arena-generate-error", { bubbles: true, composed: true, detail: { code, message: msg } }));
  }

  private refresh() {
    const ui = this.ui!;
    const facts = {
      seconds: this.loaded?.seconds ?? 5,
      hasAudio: this.loaded ? Boolean(this.loaded.audio) : true,
      hasCharacter: Boolean(this.refs.character),
      hasEnvironment: Boolean(this.refs.environment),
      audioInVideo: this.loaded?.meta.audioInVideo === true,
      audioSeconds: this.loaded?.audio?.info?.seconds,
    };
    ui.preview.replaceChildren(promptPreview({ shot: this.shot(), override: ui.override.value, model: ui.model(), facts }));
    let text = "Load a guide bundle to see the estimate.";
    if (this.loaded) {
      try {
        const lp = planGuideLane({ guide: this.loaded, model: ui.model(), shot: this.shot() ?? undefined, prompt: ui.override.value, character: this.refs.character?.media, environment: this.refs.environment?.media });
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
        references: this.references,
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
          this.dispatchEvent(new CustomEvent("arena-gallery-add", { bubbles: true, composed: true, detail: { record, base: this.base } })),
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

  private build() {
    const ui = buildForm((n) => this.getAttribute(n));
    this.ui = ui;
    this.slots = {
      character: refSlot("character", (f) => void this.setRef("character", f)),
      environment: refSlot("environment", (f) => void this.setRef("environment", f)),
    };
    ui.bundleInput.addEventListener("change", () => ui.bundleInput.files?.length && void (this.pending = this.setGuide(ui.bundleInput.files, here())));
    ui.run.addEventListener("click", () => void this.run());
    ui.stop.addEventListener("click", () => this.abort?.abort());
    for (const input of [...Object.values(ui.fields), ui.override]) input.addEventListener("input", () => this.refresh());
    for (const { r } of ui.radios) r.addEventListener("change", () => this.refresh());

    const keySlot = el("div");
    if (!this.keySource()) {
      defineKey();
      this.ownKey = document.createElement("arena-key") as ArenaKey;
      keySlot.append(this.ownKey);
    }
    this.root.replaceChildren(
      el("style", {}, generateStyles),
      el(
        "div",
        { class: "wrap" },
        el("h3", {}, "Generate from this guide"),
        keySlot,
        el("div", { class: "row" }, ui.bundleInput, ui.guideInfo),
        ui.modelSet,
        ui.shotSet,
        el("fieldset", {}, el("legend", {}, "Reference images"), this.slots.character.node, this.slots.environment.node),
        ui.preview,
        el("div", { class: "row" }, el("label", { class: "f" }, "Price cap, USD", ui.maxPrice), ui.run, ui.stop),
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
