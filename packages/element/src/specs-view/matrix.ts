/** The models × facts matrix and the per-model cards of <model-specs>. */
import { INPUT_KINDS, type ModelSpec } from "../../../core/src/specs/types.ts";
import { el } from "../captions.ts";
import { cameraLine, durationLine, INPUT_LABEL, inputLine, link, outputLine, priceLine, syntaxLine } from "./format.ts";

const SHORT: Record<string, string> = {
  firstFrame: "First",
  lastFrame: "Last",
  keyframes: "Keys",
  referenceImages: "Ref img",
  referenceVideos: "Ref video",
  referenceAudios: "Ref audio",
  sourceVideo: "Source video",
  audioToVideo: "Audio→video",
  elements: "Elements",
};

export function matrix(specs: readonly ModelSpec[], onPick: (id: string) => void): HTMLElement {
  const head = el("tr", {}, el("th", { scope: "col" }, "Model"), ...INPUT_KINDS.map((k) => el("th", { scope: "col", title: INPUT_LABEL[k] }, SHORT[k]!)),
    ...["Durations", "Output", "Camera", "Prompt syntax", "Seed", "Price"].map((h) => el("th", { scope: "col" }, h)));
  const rows = specs.map((s) => {
    const name = el("button", { type: "button", title: `Open the ${s.name} card` }, s.name);
    name.addEventListener("click", () => onPick(s.id));
    return el(
      "tr",
      { "data-model": s.id },
      el("th", { scope: "row" }, name),
      ...INPUT_KINDS.map((k) => {
        const i = s.inputs[k];
        return el("td", { class: i.supported ? "yes" : "no", title: inputLine(i) }, i.supported ? (i.maxCount !== null ? `≤${i.maxCount}` : "yes") : "–");
      }),
      el("td", {}, durationLine(s)),
      el("td", {}, outputLine(s)),
      el("td", {}, cameraLine(s)),
      el("td", {}, el("code", {}, syntaxLine(s))),
      el("td", {}, s.prompting.seed.supported ? "yes" : "no"),
      el("td", {}, priceLine(s)),
    );
  });
  const table = el("table", { class: "matrix" }, el("thead", {}, head), el("tbody", {}, ...rows));
  return el("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Model spec matrix" }, table);
}

const list = (items: (Node | string)[]) => el("ul", {}, ...items.map((i) => el("li", {}, i)));

export function card(s: ModelSpec): HTMLElement {
  const inputs = el("dl", {});
  for (const k of INPUT_KINDS) {
    const i = s.inputs[k];
    if (!i.supported) continue;
    inputs.append(el("dt", {}, INPUT_LABEL[k]), el("dd", {}, `${inputLine(i)}${i.field ? ` — ${i.field}` : ""}${i.note ? `. ${i.note}` : ""}`));
  }
  const cannot = INPUT_KINDS.filter((k) => !s.inputs[k].supported).map((k) => INPUT_LABEL[k]);

  const cam = s.camera;
  const camera =
    cam.kind === "parameter"
      ? el(
          "div",
          {},
          el("p", {}, "Parameter ", el("code", {}, cam.field), cam.forbiddenWith.length ? `, not allowed beside ${cam.forbiddenWith.map((k) => INPUT_LABEL[k].toLowerCase()).join(", ")}.` : "."),
          el("div", { class: "chips" }, ...cam.values.map((v) => el("span", { class: "chip", title: v.meaning }, v.value))),
          cam.vocabulary.length ? el("p", {}, "Prompt words for the rest: ", ...cam.vocabulary.flatMap((t, i) => [i ? ", " : "", link(t.source, t.term)])) : null,
        )
      : el("div", {}, el("p", {}, "No camera parameter; the guide's own words:"), el("div", { class: "chips" }, ...cam.vocabulary.map((t) => link(t.source, t.term))));

  const guides = s.sources.guides.map((g) => link(g.url, g.title));
  return el(
    "article",
    { class: "card", "data-model": s.id, id: `card-${s.id}` },
    el("div", {}, el("h4", {}, s.name), el("span", { class: "id" }, `${s.lab} · ${s.air} · verified ${s.verifiedOn}`)),
    el("div", { class: "links" }, link(s.sources.model, "Model page"), link(s.sources.schema, "schema.json"), ...guides),
    el("div", {}, el("h5", {}, "Takes"), inputs, cannot.length ? el("p", { class: "note" }, `Not taken: ${cannot.join(", ")}.`) : null),
    s.combinations.length ? el("div", {}, el("h5", {}, "Combination rules"), list(s.combinations.map((c) => link(c.source, c.text)))) : null,
    el("div", {}, el("h5", {}, "Output"), el("p", {}, `${durationLine(s)} · ${outputLine(s)}${s.output.frameCountRule ? ` · ${s.output.frameCountRule}` : ""}`)),
    el(
      "div",
      {},
      el("h5", {}, "Prompting"),
      el("p", {}, "Address inputs as ", el("code", {}, syntaxLine(s)), `. ${s.prompting.addressing.numbering}`),
      list(s.prompting.rules.map((r) => link(r.source, r.text))),
      el("p", { class: "note" }, `Prompt ${s.prompting.maxChars === null ? "length not stated" : `up to ${s.prompting.maxChars} characters`}; seed ${s.prompting.seed.supported ? "yes" : "no"}.`),
    ),
    el("div", {}, el("h5", {}, "Camera"), camera),
    el(
      "div",
      {},
      el("h5", {}, "Price"),
      list([
        ...s.pricing.rates.map((r) => `${r.label}: $${r.usdPerSecond}/s`),
        ...s.pricing.surcharges.map((x) => `${x.label}: +$${x.usd} ${x.per === "input-video-second" ? "per second of input video" : "per image beyond five"}`),
      ]),
      el("p", { class: "note" }, link(s.pricing.source, "Source"), s.pricing.note ? ` · ${s.pricing.note}` : ""),
    ),
    el("details", {}, el("summary", {}, `Gaps and conflicts (${s.notes.length})`), list(s.notes)),
  );
}
