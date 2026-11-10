/**
 * layout="arena": the same shot from several models, on one clock. The reader
 * picks how many to compare (2-5) and a layout for that count, and each tile
 * has a model menu so one model can be swapped for another. Every tile shows
 * the model, its cost per clip and its seconds; play all, or play one alone.
 * A lane that has not run shows the list price as a lower bound and says so.
 */
import type { ClockState, SharedClock } from "../../../core/src/clock.ts";
import type { ArenaRecord, Lane } from "../../../core/src/record.ts";
import { el, mediaUrl, secs, usd } from "../captions.ts";
import { laneSpec, listPrice } from "../steering.ts";
import { progress, screen, transport } from "../transport.ts";

export interface ViewContext {
  record: ArenaRecord;
  base: string;
  clock: () => SharedClock;
  error: (msg: string) => void;
}

export interface View {
  /** Controls for the panel head, beside the test tabs. */
  controls?: Node[];
  nodes: Node[];
  update(s: ClockState): void;
}

/** What the reader chose; kept by the element across test tabs. */
export interface ArenaState {
  count: number;
  layout: string;
  /** Lane ids, one per tile. */
  picks: string[];
}

export const LAYOUTS: Record<number, [string, string][]> = {
  2: [["2-side", "Side by side"], ["2-stack", "Stacked"]],
  3: [["3-row", "Row of 3"], ["3-hero", "1 big + 2"]],
  4: [["4-grid", "2 × 2"], ["4-row", "Row of 4"]],
  5: [["5-3-2", "3 + 2"], ["5-hero", "1 big + 4"]],
};

/** "$0.94 per clip", or the list price for a lane that has not run. */
export function costLine(lane: Lane): string {
  if (lane.costUsd !== null) return `${usd(lane.costUsd)} per clip`;
  const list = listPrice(lane, laneSpec(lane));
  if (!list) return "Cost not recorded";
  return `List price from ${usd(list.usd)} per clip${list.excludes ? ` plus ${list.excludes}` : ""} (not run)`;
}

/** The short tile label: cost and seconds. */
export function tileMeta(lane: Lane): string {
  const list = lane.costUsd === null ? listPrice(lane, laneSpec(lane)) : null;
  const cost = lane.costUsd !== null ? usd(lane.costUsd) : list ? `from ${usd(list.usd)}` : "$ —";
  const took = lane.generationSeconds !== null ? secs(lane.generationSeconds) : "— s";
  return `${cost} · ${took}`;
}

export function secondsLine(lane: Lane): string {
  const length = typeof lane.durationSeconds === "number" ? `${lane.durationSeconds} s clip` : null;
  const took = lane.generationSeconds !== null ? `${secs(lane.generationSeconds)} to generate` : "generation time not recorded";
  return [length, took].filter(Boolean).join(" · ");
}

/** Clamps a saved state to what this record offers. */
export function fitState(record: ArenaRecord, prev?: Partial<ArenaState>): ArenaState {
  const ids = record.lanes.map((l) => l.id);
  const max = Math.max(1, Math.min(5, ids.length));
  const count = Math.min(max, Math.max(Math.min(2, max), prev?.count ?? Math.min(3, max)));
  const options = LAYOUTS[count] ?? [["single", "Single"]];
  const layout = options.some(([v]) => v === prev?.layout) ? prev!.layout! : options[0]![0];
  const picks: string[] = [];
  const kept = (prev?.picks ?? []).filter((id) => ids.includes(id));
  for (let i = 0; i < count; i++) picks.push(kept[i] ?? ids.find((id) => !picks.includes(id) && !kept.includes(id)) ?? ids[i % ids.length]!);
  return { count, layout, picks };
}

function seg(label: string, items: [string, string][], current: string, onPick: (v: string) => void): HTMLElement {
  const g = el("div", { class: "seg", role: "group", "aria-label": label });
  for (const [value, text] of items) {
    const b = el("button", { type: "button", "aria-pressed": String(value === current) }, text);
    b.addEventListener("click", () => onPick(value));
    g.append(b);
  }
  return g;
}

export function arenaView(ctx: ViewContext, state: ArenaState, onState: (s: ArenaState) => void): View {
  const { record, base } = ctx;
  const t = transport(ctx.clock);
  const stage = el("div", { class: "stage", "data-layout": state.layout });
  const bars: HTMLElement[] = [];
  const solos = new Map<string, HTMLButtonElement>();
  const byId = new Map(record.lanes.map((l) => [l.id, l]));
  const counts = [2, 3, 4, 5].filter((n) => n <= record.lanes.length);

  const controls =
    counts.length > 0
      ? [
          seg("How many models", counts.map((n) => [String(n), `${n} models`]), String(state.count), (v) => onState(fitState(record, { ...state, count: Number(v), layout: undefined }))),
          seg("Layout", LAYOUTS[state.count] ?? [], state.layout, (v) => onState({ ...state, layout: v })),
        ]
      : [];

  state.picks.forEach((laneId, i) => {
    const lane = byId.get(laneId)!;
    const tileId = `tile-${i}`;
    const name = lane.label ?? lane.modelName ?? lane.model;
    const src = lane.output ? mediaUrl(lane.output.src, base) : null;
    const s = screen(src, name, ctx.error, lane.status === "placeholder" ? "Placeholder" : undefined);
    if (s.video) {
      s.video.addEventListener("loadedmetadata", () => ctx.clock().loaded());
      ctx.clock().add(tileId, s.video);
    }
    bars.push(s.bar);

    const menu = el("select", { "aria-label": `Model for tile ${i + 1}` });
    for (const l of record.lanes) {
      const o = el("option", { value: l.id }, l.label ?? l.modelName ?? l.model);
      o.selected = l.id === laneId;
      menu.append(o);
    }
    menu.addEventListener("change", () => onState({ ...state, picks: state.picks.map((p, j) => (j === i ? menu.value : p)) }));
    const solo = el("button", { class: "small solo", type: "button", "aria-pressed": "false" }, "Play alone");
    solo.addEventListener("click", () => void ctx.clock().solo(tileId));
    if (!s.video) solo.disabled = true;
    solos.set(tileId, solo);
    const meta = el("span", { class: "meta", title: `${costLine(lane)} · ${secondsLine(lane)}` }, tileMeta(lane));

    stage.append(
      el(
        "figure",
        { class: `tile${record.preferredLane === lane.id ? " preferred" : ""}`, "data-lane": lane.id },
        s.node,
        el("figcaption", { class: "overlay" }, menu, solo, meta),
      ),
    );
  });

  const observations = record.observations?.length ? el("ul", { class: "note" }, ...record.observations.map((o) => el("li", {}, o))) : null;
  return {
    controls,
    nodes: [t.node, stage, ...(observations ? [observations] : [])],
    update(s) {
      t.update(s);
      const pct = progress(s);
      bars.forEach((b) => (b.style.width = pct));
      for (const [id, b] of solos) {
        b.textContent = s.soloing === id ? "Stop" : "Play alone";
        b.setAttribute("aria-pressed", String(s.soloing === id));
      }
    },
  };
}
