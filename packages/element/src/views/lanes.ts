/**
 * The full-caption lanes view (layout="three-up", the default): every clip
 * with what the model was given, the first-frame variant, cost, seconds and
 * the model that ran.
 */
import { caption, el, mediaUrl } from "../captions.ts";
import { progress, screen, transport } from "../transport.ts";
import type { View, ViewContext } from "./arena.ts";

export function lanesView(ctx: ViewContext, layout: string): View {
  const { record, base } = ctx;
  const t = transport(ctx.clock);
  const bars: HTMLElement[] = [];
  const solos = new Map<string, HTMLButtonElement>();
  const lanes = el("div", { class: "lanes" });
  lanes.style.setProperty("--ma-columns", String(layout === "three-up" ? Math.min(3, record.lanes.length) : 3));

  for (const lane of record.lanes) {
    const src = lane.output ? mediaUrl(lane.output.src, base) : null;
    const s = screen(src, lane.label ?? lane.model, ctx.error, lane.status === "placeholder" ? "Placeholder clip" : lane.status === "pending" ? "Not run yet" : undefined);
    if (s.video) {
      s.video.addEventListener("loadedmetadata", () => ctx.clock().loaded());
      ctx.clock().add(lane.id, s.video);
    }
    bars.push(s.bar);
    const { node, solo } = caption(lane, base, () => void ctx.clock().solo(lane.id));
    if (!s.video) solo.disabled = true;
    solos.set(lane.id, solo);
    lanes.append(el("article", { class: `lane${record.preferredLane === lane.id ? " preferred" : ""}`, "data-lane": lane.id }, s.node, node));
  }
  const observations = record.observations?.length ? el("ul", { class: "note" }, ...record.observations.map((o) => el("li", {}, o))) : null;

  return {
    nodes: [t.node, lanes, ...(observations ? [observations] : [])],
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
