/**
 * The live composer panel: one neutral shot in, one prompt and request params
 * per model out, side by side, recomputed on every keystroke. Pure: the
 * composer runs in the page and nothing is sent anywhere.
 */
import { compose, type ComposedPrompt, type ShotDescription, type ShotReference } from "../../../core/src/compose.ts";
import { CAMERA_MOVES, type CameraMove, type ModelSpec } from "../../../core/src/specs/types.ts";
import { el } from "../captions.ts";
import { copyButton, INPUT_LABEL, link } from "./format.ts";

const REFS: { ref: ShotReference; label: string; on: boolean }[] = [
  { ref: { id: "guide", kind: "video", role: "motion" }, label: "Motion guide video", on: true },
  { ref: { id: "character", kind: "image", role: "character", replaces: "the mannequin" }, label: "Character image (replaces the mannequin)", on: true },
  { ref: { id: "still", kind: "image", role: "first-frame" }, label: "First frame", on: false },
  { ref: { id: "product", kind: "image", role: "product" }, label: "Product image", on: false },
  { ref: { id: "beat", kind: "audio", role: "soundtrack" }, label: "Soundtrack audio", on: false },
];

const DEFAULT = {
  subject: "A figure in a plain grey jumpsuit",
  action: "performs the guide's motion beside two fruits on a wooden table",
  focus: "the figure",
  audio: "",
  duration: 5,
  camera: "push-in" as CameraMove,
};

function field(name: string, label: string, value: string, type = "text"): HTMLLabelElement {
  const input = el("input", { type, name, value, autocomplete: "off", ...(type === "number" ? { min: "1", max: "30", step: "1" } : { maxlength: "500" }) });
  return el("label", {}, label, input);
}

function out(c: ComposedPrompt, spec: ModelSpec): HTMLElement {
  const params = JSON.stringify(c.params, null, 1);
  const camera =
    c.camera.mode === "parameter" ? `parameter ${c.camera.field} = ${c.camera.value}` : c.camera.mode === "guide-video" ? "carried by the guide video" : "in the prompt words";
  const items = [
    ...c.used.map((u) => el("li", {}, `${u.ref} → ${u.field}${u.address ? ` as ${u.address}` : ""}${u.convertedFrom ? ` (wanted ${INPUT_LABEL[u.convertedFrom].toLowerCase()})` : ""}`)),
    ...c.dropped.map((d) => el("li", { class: "warn" }, `${d.ref} not sent: ${d.reason}`)),
    ...c.notes.map((n) => el("li", { class: "warn" }, n)),
  ];
  return el(
    "div",
    { class: "out", "data-model": c.model },
    el("div", { class: "row" }, el("span", { class: "model" }, c.name), link(spec.sources.guides[0]?.url ?? spec.sources.model, "Prompting guide")),
    el("pre", { "aria-label": `${c.name} prompt` }, c.prompt),
    el("div", { class: "row" }, el("span", { class: "id" }, `Camera: ${camera}`), copyButton("Copy prompt", () => c.prompt)),
    el("pre", { class: "params", "aria-label": `${c.name} params` }, params),
    el("div", { class: "row" }, el("span", { class: "id" }, "Request params"), copyButton("Copy params", () => params)),
    items.length ? el("ul", {}, ...items) : null,
  );
}

export function composerPanel(specs: readonly ModelSpec[], initialModels: string[]): HTMLElement {
  const form = el(
    "form",
    { "aria-label": "Shot description" },
    field("subject", "Subject", DEFAULT.subject),
    field("action", "Action", DEFAULT.action),
    field("focus", "Camera ends on", DEFAULT.focus),
    field("audio", "Sound (optional)", DEFAULT.audio),
    field("duration", "Seconds", String(DEFAULT.duration), "number"),
  );
  const camera = el("select", { name: "camera" }, ...CAMERA_MOVES.map((m) => el("option", { value: m }, m)));
  camera.value = DEFAULT.camera;
  form.append(el("label", {}, "Camera move", camera));
  const refBox = el("fieldset", {}, el("legend", {}, "Attached references"));
  const refChecks = REFS.map((r) => {
    const box = el("input", { type: "checkbox", name: `ref-${r.ref.id}` });
    box.checked = r.on;
    refBox.append(el("label", {}, box, r.label));
    return { box, ref: r.ref };
  });
  const modelBox = el("fieldset", {}, el("legend", {}, "Models"));
  const modelChecks = specs.map((s) => {
    const box = el("input", { type: "checkbox", name: `model-${s.id}` });
    box.checked = initialModels.includes(s.id);
    modelBox.append(el("label", {}, box, s.name));
    return { box, id: s.id };
  });
  form.append(refBox, modelBox);
  form.addEventListener("submit", (e) => e.preventDefault());

  const outs = el("div", { class: "outs", "aria-live": "polite" });
  const value = (name: string) => (form.querySelector(`[name="${name}"]`) as HTMLInputElement).value.trim();
  let shot: ShotDescription;
  const update = () => {
    const seconds = Number(value("duration"));
    shot = {
      subject: value("subject") || DEFAULT.subject,
      action: value("action") || DEFAULT.action,
      camera: camera.value as CameraMove,
      duration: Number.isFinite(seconds) && seconds > 0 ? Math.min(30, Math.round(seconds)) : DEFAULT.duration,
      references: refChecks.filter((r) => r.box.checked).map((r) => r.ref),
      ...(value("focus") ? { focus: value("focus") } : {}),
      ...(value("audio") ? { audio: value("audio") } : {}),
    };
    const ids = modelChecks.filter((m) => m.box.checked).map((m) => m.id);
    const byId = new Map(specs.map((s) => [s.id, s]));
    outs.replaceChildren(...compose(shot, ids).map((c) => out(c, byId.get(c.model)!)));
    if (!ids.length) outs.append(el("p", { class: "note" }, "Pick at least one model."));
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

  const shotLine = el(
    "div",
    { class: "shotline" },
    el("span", { class: "note" }, "The same shot, as a file for npm run lane -- --shot shot.json:"),
    copyButton("Copy shot JSON", () => JSON.stringify(shot, null, 2)),
  );
  return el("div", { class: "composer" }, form, shotLine, outs);
}
