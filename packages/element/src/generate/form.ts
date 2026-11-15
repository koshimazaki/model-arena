/**
 * The controls of <arena-generate>, built once: bundle picker, model choice
 * (with each model's one line from the spec database), the shot fields, the
 * own-prompt override, two reference image slots, price cap and Run/Stop.
 * The element wires behaviour; this file only makes the nodes.
 */
import { guideModels } from "../../../../providers/runware-api/guide-plan.ts";
import { el } from "../captions.ts";

export const SHOT_FIELDS = [
  ["subject", "Subject", "Who or what moves"],
  ["environment", "Environment", "Where it happens"],
  ["action", "Action", "What it does along the path"],
  ["legend", "Colour legend", "e.g. The orange figure is the character"],
] as const;
export type ShotField = (typeof SHOT_FIELDS)[number][0];
export type RefRole = "character" | "environment";
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface RefSlot {
  node: HTMLElement;
  input: HTMLInputElement;
  shown: HTMLElement;
}

/** A drop zone plus file input for one reference image. */
export function refSlot(role: RefRole, onFile: (f: File | undefined) => void): RefSlot {
  const input = el("input", { type: "file", accept: IMAGE_TYPES.join(","), "data-field": role });
  const shown = el("span", { class: "row", "data-ref": role });
  const label = role === "character" ? "Character sheet (optional)" : "Environment image (optional)";
  const node = el("div", { class: "drop", "data-drop": role }, el("span", { class: "note" }, `${label}: drop an image or`), input, shown);
  node.addEventListener("dragover", (e) => (e.preventDefault(), node.classList.add("over")));
  node.addEventListener("dragleave", () => node.classList.remove("over"));
  node.addEventListener("drop", (e) => {
    e.preventDefault();
    node.classList.remove("over");
    onFile(e.dataTransfer?.files[0]);
  });
  input.addEventListener("change", () => onFile(input.files?.[0]));
  return { node, input, shown };
}

export function buildForm(attr: (name: string) => string | null) {
  const models = guideModels();
  const initial = models.some((m) => m.key === attr("model")) ? attr("model")! : models[0]!.key;
  const radios = models.map((m) => {
    const r = el("input", { type: "radio", name: "model", value: m.key, "data-model": m.key });
    r.checked = m.key === initial;
    return { m, r };
  });
  const modelSet = el(
    "fieldset",
    {},
    el("legend", {}, "Model"),
    el(
      "div",
      { class: "models" },
      ...radios.map(({ m, r }) =>
        el(
          "label",
          { class: "model-opt" },
          r,
          el("span", {}, m.name, m.use === "audio-first-frame" ? el("span", { class: "badge" }, "audio + first frame only") : null),
          el("span", { class: "line" }, m.line),
        ),
      ),
    ),
  );
  const fields = {} as Record<ShotField, HTMLInputElement>;
  const grid = el("div", { class: "fields" });
  for (const [k, label, hint] of SHOT_FIELDS) {
    fields[k] = el("input", { type: "text", maxlength: k === "legend" ? "300" : "500", placeholder: hint, "data-field": k, value: attr(k) ?? "" });
    grid.append(el("label", { class: "f" }, label, fields[k]));
  }
  const override = el("textarea", { maxlength: "5000", "data-field": "prompt", placeholder: "Leave empty to use the composed prompt" });
  override.value = attr("prompt") ?? "";
  const own = el("details", {}, el("summary", {}, "Write my own prompt instead"), override);
  own.open = Boolean(override.value);
  const shotSet = el("fieldset", {}, el("legend", {}, "Shot description"), grid, own);

  const bundleInput = el("input", { type: "file", multiple: "", accept: ".json,.mp4,.wav,.mp3,.png,.jpg", "data-field": "bundle" });
  const guideInfo = el("p", { class: "note", "data-guide": "" }, "No guide yet: choose the bundle's files.");
  const maxPrice = el("input", { type: "number", min: "0.1", max: "100", step: "0.1", value: attr("max-price") ?? "2", "data-field": "max-price" });
  const run = el("button", { type: "button", class: "primary", "data-action": "run" }, "Run");
  const stop = el("button", { type: "button", "data-action": "stop" }, "Stop");
  stop.hidden = true;
  return {
    radios,
    model: () => radios.find(({ r }) => r.checked)?.m.key ?? initial,
    setModel: (key: string) => radios.forEach(({ m, r }) => (r.checked = m.key === key)),
    modelSet,
    fields,
    override,
    own,
    shotSet,
    bundleInput,
    guideInfo,
    maxPrice,
    run,
    stop,
    preview: el("div", { "data-preview": "" }),
    estimate: el("p", { class: "note", "data-estimate": "" }),
    confirmSlot: el("div"),
    status: el("p", { class: "status", role: "status" }),
    error: el("p", { class: "err", role: "alert" }),
    result: el("div", { "data-result": "" }),
  };
}

export type Form = ReturnType<typeof buildForm>;
