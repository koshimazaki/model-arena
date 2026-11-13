/**
 * The prompt before Run: the chosen model's composed prompt with the
 * reference tags it uses, a line on what it takes from the guide, a link to
 * its prompting guide, and "Compare prompts" with Kling, Seedance and MiniMax
 * side by side for the same shot. Pure DOM from `previewPrompt`, so the
 * preview is exactly the prompt `planGuideLane` sends.
 */
import type { GuideShot } from "../../../../providers/runware-api/guide-bundle.ts";
import { comparePrompts, previewPrompt, type GuideFacts } from "../../../../providers/runware-api/guide-plan.ts";
import { el } from "../captions.ts";

function tags(p: ReturnType<typeof previewPrompt>): string {
  const used = p.composed.used.filter((u) => u.address).map((u) => `${u.address} = ${u.ref === "guide" ? "the guide clip" : u.ref === "audio" ? "the guide's audio" : "your character sheet"}`);
  return used.length ? `Reference tags: ${used.join(", ")}` : "Reference tags: none; this model is not addressed by tags.";
}

function one(p: ReturnType<typeof previewPrompt>, compact = false): HTMLElement {
  const dropped = p.composed.dropped.map((d) => `${d.ref}: ${d.reason}`);
  const notes = [...p.notes, ...dropped];
  return el(
    "div",
    { class: compact ? "prompt-card compact" : "prompt-card", "data-model": p.model.key },
    el("div", { class: "row spread" }, el("strong", {}, p.model.name), el("a", { href: p.model.guide.url, target: "_blank", rel: "noopener noreferrer" }, `Prompting guide: ${p.model.guide.title}`)),
    compact ? null : el("p", { class: "line" }, p.model.line),
    el("pre", { "data-prompt": p.model.key }, p.composed.prompt),
    el("p", { class: "tags" }, tags(p)),
    notes.length ? el("ul", { class: "notes" }, ...notes.map((n) => el("li", {}, n))) : null,
  );
}

export interface PreviewInput {
  shot: GuideShot | null;
  override: string;
  model: string;
  facts: GuideFacts;
}

/** The preview block; empty with a hint until the shot has a subject. */
export function promptPreview(i: PreviewInput): HTMLElement {
  if (i.override.trim())
    return el(
      "div",
      { class: "preview" },
      el("p", { class: "note" }, "Your own prompt replaces the composed one; the model gets exactly this text."),
      el("pre", { "data-prompt": i.model }, i.override.trim()),
    );
  if (!i.shot || !i.shot.subject.trim()) return el("div", { class: "preview" }, el("p", { class: "note" }, "Describe the subject to see the prompt each model gets."));
  let chosen: HTMLElement;
  try {
    chosen = one(previewPrompt(i.shot, i.model, i.facts));
  } catch (e) {
    chosen = el("p", { class: "err" }, (e as Error).message);
  }
  const compare = el(
    "details",
    { class: "compare" },
    el("summary", {}, "Compare prompts"),
    el("div", { class: "compare-grid" }, ...comparePrompts(i.shot, i.facts).map((p) => one(p, true))),
  );
  return el("div", { class: "preview" }, chosen, compare);
}
