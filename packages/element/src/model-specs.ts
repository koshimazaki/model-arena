/**
 * <model-specs models="kling-4,seedance-2.5" view="matrix|cards|composer">
 *
 * Renders the model spec database for developers: a matrix of models against
 * inputs, limits, camera, prompt syntax and price; a card per model with its
 * rules and links to the API page and guides; and a live composer that turns
 * one shot description into each model's prompt and params. Same `--ma-*`
 * tokens as <model-arena>; no framework, no network.
 */
import { COMPARISON_MODELS } from "../../core/src/compose.ts";
import { MODEL_SPECS } from "../../core/src/specs/index.ts";
import { el } from "./captions.ts";
import { composerPanel } from "./specs-view/composer.ts";
import { card, matrix } from "./specs-view/matrix.ts";
import { specStyles } from "./specs-view/styles.ts";
import { styles } from "./styles.ts";

type View = "matrix" | "cards" | "composer";
const VIEWS: { id: View; label: string }[] = [
  { id: "matrix", label: "Compare" },
  { id: "cards", label: "Per model" },
  { id: "composer", label: "Compose a shot" },
];

export class ModelSpecs extends HTMLElement {
  static observedAttributes = ["models", "view"];
  private root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(_name: string, old: string | null, value: string | null) {
    if (old !== value && this.isConnected) this.render();
  }

  private specs() {
    const wanted = (this.getAttribute("models") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return wanted.length ? MODEL_SPECS.filter((s) => wanted.includes(s.id)) : MODEL_SPECS;
  }

  private render() {
    const specs = this.specs();
    const only = this.getAttribute("view") as View | null;
    const initial = specs.map((s) => s.id).filter((id) => (COMPARISON_MODELS as readonly string[]).includes(id));
    const cards = el("div", { class: "cards" }, ...specs.map(card));
    const sections: Record<View, HTMLElement> = {
      matrix: el("section", { "data-view": "matrix" }, matrix(specs, (id) => this.show("cards", id)), el("p", { class: "note" }, "Hover a cell for limits; open a model for its rules and sources.")),
      cards: el("section", { "data-view": "cards" }, cards),
      composer: el("section", { "data-view": "composer" }, composerPanel(specs, initial.length ? initial : specs.map((s) => s.id))),
    };
    const tabs = el("div", { class: "seg", role: "tablist", "aria-label": "View" });
    for (const v of VIEWS) {
      const b = el("button", { type: "button", role: "tab", "data-view": v.id, "aria-selected": "false" }, v.label);
      b.addEventListener("click", () => this.show(v.id));
      tabs.append(b);
    }
    const head = el(
      "div",
      { class: "head" },
      el("div", { class: "title" }, el("h2", {}, "What each model takes"), el("span", { class: "meta" }, `${specs.length} video models on Runware · from their schemas and guides`)),
      only ? null : el("div", { class: "controls" }, tabs),
    );
    this.root.replaceChildren(el("style", {}, styles + specStyles), head, el("div", { class: "body" }, ...Object.values(sections)));
    // A single-view embed shows that view only; otherwise all three stack, with tabs to jump.
    if (only && sections[only]) for (const [k, s] of Object.entries(sections)) s.hidden = k !== only;
  }

  /** Scrolls to a view (and a model's card), marking the tab. */
  show(view: View, model?: string) {
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[role="tab"]')) b.setAttribute("aria-selected", String(b.dataset.view === view));
    const section = this.root.querySelector<HTMLElement>(`section[data-view="${view}"]`);
    if (section?.hidden && !this.getAttribute("view")) section.hidden = false;
    const target = model ? this.root.querySelector<HTMLElement>(`#card-${CSS.escape(model)}`) : section;
    this.root.querySelectorAll(".card.focus").forEach((c) => c.classList.remove("focus"));
    if (model) target?.classList.add("focus");
    target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }
}

export function defineSpecs(name = "model-specs") {
  if (!customElements.get(name)) customElements.define(name, ModelSpecs);
}
