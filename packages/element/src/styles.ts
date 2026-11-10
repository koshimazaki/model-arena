/**
 * Shadow-DOM styles. Every colour, font and radius is a `--ma-*` custom
 * property on the element, so a host page overrides any of them from outside:
 *   model-arena { --ma-accent: hotpink; }
 * The defaults are the Runware blog's dark tokens (read 10 Nov 2026), because
 * that blog is dark-only. theme="auto" follows prefers-color-scheme with a
 * light variant; theme="light" forces it. Fonts are named, not loaded: the
 * host page loads Figtree and JetBrains Mono, and system fonts stand in.
 */
import { viewStyles } from "./styles-views.ts";

const LIGHT = `
  --ma-bg: #ffffff; --ma-card: #f6f6f6; --ma-fg: #161616; --ma-muted: #555555;
  --ma-line: #d4d4d4; --ma-input: #ececec; --ma-chip: #e9e9e9;
  --ma-accent: #2f7d1e; --ma-accent-fg: #ffffff; --ma-warn: #9a5800;`;

export const styles = /* css */ `
:host {
  --ma-bg: #1a1a1a;
  --ma-card: #1c1c1c;
  --ma-fg: #f2f2f2;
  --ma-muted: #d9d9d9;
  --ma-line: #454545;
  --ma-input: #2e2e2e;
  --ma-chip: #292929;
  --ma-accent: #afff9f;
  --ma-accent-fg: #1c1c1c;
  --ma-warn: #ffff7d;
  --ma-radius: 7px;
  --ma-radius-lg: 12px;
  --ma-gap: 8px;
  --ma-font: "Figtree", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --ma-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  display: block;
  width: 100%;
  max-width: 100%;
  color: var(--ma-fg);
  background: var(--ma-card);
  border: 1px solid var(--ma-line);
  border-radius: var(--ma-radius-lg);
  overflow: hidden;
  font: 400 14px/1.5 var(--ma-font);
  container-type: inline-size;
}
:host([theme="light"]) {${LIGHT} }
@media (prefers-color-scheme: light) { :host([theme="auto"]) {${LIGHT} } }
* { box-sizing: border-box; }
.head {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px 16px;
  padding: 12px 16px; border-bottom: 1px solid var(--ma-line);
}
.title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; min-width: 0; }
.head h2 { font-size: 15px; margin: 0; font-weight: 600; }
.head .meta { color: var(--ma-muted); font-size: 13px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.body { padding: 12px; display: grid; gap: 12px; min-width: 0; }
.intent { margin: 0; padding: 8px 16px; border-bottom: 1px solid var(--ma-line); font-size: 13px; color: var(--ma-muted); overflow-wrap: anywhere; }
.seg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--ma-line); border-radius: 8px; overflow: hidden; max-width: 100%; }
.seg button { background: transparent; color: var(--ma-muted); border: 0; border-radius: 0; font: 500 13px var(--ma-font); padding: 5px 11px; min-height: 32px; }
.seg button + button { border-left: 1px solid var(--ma-line); }
.seg button[aria-pressed="true"], .seg button[aria-selected="true"] { background: var(--ma-accent); color: var(--ma-accent-fg); }
button {
  font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: var(--ma-radius);
  background: var(--ma-input); color: var(--ma-fg); padding: 4px 10px; min-height: 32px;
}
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); font-weight: 600; min-width: 96px; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
.transport {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px;
  padding: 8px 12px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg);
}
input[type="range"] { width: 100%; min-width: 0; accent-color: var(--ma-accent); }
.time { font: 12px var(--ma-mono); color: var(--ma-muted); white-space: nowrap; }
@container (max-width: 400px) { .time { display: none; } .transport { grid-template-columns: auto minmax(0, 1fr); } }
.error { color: var(--ma-warn); font-size: 13px; padding: 8px 16px 0; }
.error:empty { display: none; }
.screen { position: relative; background: #000; aspect-ratio: 16 / 9; border-radius: var(--ma-radius); overflow: hidden; }
.screen video { width: 100%; height: 100%; display: block; object-fit: contain; }
.playhead { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.15); }
.playhead span { display: block; height: 100%; width: 0; background: var(--ma-accent); }
.badge { position: absolute; top: 8px; right: 8px; font: 11px var(--ma-mono); padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.7); color: #fff; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.row.spread { justify-content: space-between; }
.model { font-weight: 600; font-size: 14px; }
.id { font: 12px var(--ma-mono); color: var(--ma-muted); overflow-wrap: anywhere; }
.note { color: var(--ma-muted); font-style: italic; margin: 0; }
.small { font-size: 12px; padding: 2px 8px; min-height: 28px; }
${viewStyles}
`;
