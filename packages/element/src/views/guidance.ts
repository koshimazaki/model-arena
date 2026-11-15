/**
 * layout="guidance": camera control and guidance. Left, the Motion Studio
 * guide clip (the beat-synced mannequin and its camera move); right, the
 * selected model's output; both on one clock. Under them: a model switcher,
 * the three ways a model is steered with this model's way lit, an inputs strip
 * showing what it received (inputs it cannot take greyed out), and the
 * composed prompt with a copy button.
 */
import type { Lane } from "../../../core/src/record.ts";
import { el, mediaUrl } from "../captions.ts";
import { inputsStrip, laneSpec, STEERING, steering } from "../steering.ts";
import { progress, screen, transport } from "../transport.ts";
import { costLine, secondsLine, type View, type ViewContext } from "./arena.ts";

const isGuideLane = (l: Lane) => l.model === "guide" || l.provider === "none";

function copyButton(get: () => string): HTMLButtonElement {
  const b = el("button", { class: "small", type: "button" }, "Copy prompt");
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(get());
      b.textContent = "Copied";
    } catch {
      b.textContent = "Select and copy";
    }
    setTimeout(() => (b.textContent = "Copy prompt"), 1500);
  });
  return b;
}

export function guidanceView(ctx: ViewContext, initial?: string | null): View {
  const { record, base } = ctx;
  const lanes = record.lanes.filter((l) => !isGuideLane(l));
  let current = lanes.find((l) => l.id === initial) ?? lanes[0];
  const t = transport(ctx.clock, "Play both");

  const guideSrc = record.guide ? mediaUrl(record.guide.video.src, base) : null;
  const left = screen(guideSrc, "Guide", ctx.error);
  if (left.video) {
    left.video.addEventListener("loadedmetadata", () => ctx.clock().loaded());
    ctx.clock().add("guide-clip", left.video);
  }
  const leftFig = el(
    "figure",
    { class: "side" },
    left.node,
    el("figcaption", {}, el("span", { class: "model" }, "Guide"), el("span", { class: "id" }, record.guide ? (record.guide.title ?? "The clip every model was given") : "No guide clip in this record")),
  );

  const rightSlot = el("div", { class: "side-screen" });
  const rightName = el("span", { class: "model" });
  const rightMeta = el("span", { class: "id" });
  const rightFig = el("figure", { class: "side" }, rightSlot, el("figcaption", {}, rightName, rightMeta));
  let rightBar: HTMLElement = el("span");

  const switcher = el("div", { class: "switcher", role: "group", "aria-label": "Model" });
  const buttons = new Map<string, HTMLButtonElement>();
  for (const lane of lanes) {
    const b = el("button", { type: "button", "aria-pressed": "false", "data-lane": lane.id }, lane.label ?? lane.modelName ?? lane.model);
    b.addEventListener("click", () => select(lane));
    buttons.set(lane.id, b);
    switcher.append(b);
  }

  const modes = el("ol", { class: "modes", "aria-label": "Three ways a model is steered" });
  const modeNodes = new Map(
    STEERING.map((m) => {
      const li = el("li", { "data-mode": m.id }, el("strong", {}, m.title), el("span", {}, m.text));
      modes.append(li);
      return [m.id, li] as const;
    }),
  );

  const strip = el("ul", { class: "strip", "aria-label": "Inputs this model received" });
  const pre = el("pre");
  const promptBox = el(
    "div",
    { class: "composed" },
    el("div", { class: "row spread" }, el("span", { class: "id" }, "Composed prompt"), copyButton(() => current?.prompt ?? "")),
    pre,
  );
  const note = el("p", { class: "note" });

  function select(lane: Lane) {
    current = lane;
    const clock = ctx.clock();
    const at = clock.state.time;
    clock.pause();
    clock.remove("output");
    const src = lane.output ? mediaUrl(lane.output.src, base) : null;
    const name = lane.label ?? lane.modelName ?? lane.model;
    const s = screen(src, name, ctx.error, lane.status === "placeholder" ? "Placeholder clip" : undefined);
    if (s.video) {
      s.video.addEventListener("loadedmetadata", () => {
        clock.loaded();
        clock.seek(at);
      });
      clock.add("output", s.video);
    }
    rightSlot.replaceChildren(s.node);
    rightBar = s.bar;

    const mode = steering(lane);
    const modeTitle = STEERING.find((m) => m.id === mode)!.title;
    rightName.textContent = name;
    rightMeta.textContent = `Steered by: ${modeTitle} · ${costLine(lane)} · ${secondsLine(lane)}`;
    for (const [id, b] of buttons) b.setAttribute("aria-pressed", String(id === lane.id));
    for (const [id, li] of modeNodes) {
      li.classList.toggle("on", id === mode);
      if (id === mode) li.setAttribute("aria-current", "true");
      else li.removeAttribute("aria-current");
    }

    const spec = laneSpec(lane);
    strip.replaceChildren(
      ...inputsStrip(lane, spec).map((slot) =>
        el(
          "li",
          { class: `slot ${slot.state}`, "data-slot": slot.key, title: slot.state === "cannot" ? `${name} cannot take this input` : slot.detail },
          el("strong", {}, slot.label),
          el("span", {}, slot.detail),
        ),
      ),
    );
    pre.textContent = lane.prompt || "(no prompt)";
    note.textContent = lane.note ?? "";
    note.hidden = !lane.note;
  }

  if (current) select(current);
  const empty = lanes.length ? null : el("p", { class: "note" }, "This record has no model lanes to compare with the guide.");

  return {
    nodes: [el("div", { class: "pair" }, leftFig, rightFig), t.node, switcher, modes, strip, promptBox, note, ...(empty ? [empty] : [])],
    update(s) {
      t.update(s);
      const pct = progress(s);
      left.bar.style.width = pct;
      rightBar.style.width = pct;
    },
  };
}
