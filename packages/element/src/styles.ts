/**
 * Shadow-DOM styles. Every colour and size is a CSS variable, so a theme is
 * a stylesheet that sets `--ma-*` on `model-arena` from outside. Defaults are
 * neutral, with a dark variant from prefers-color-scheme.
 */
export const styles = /* css */ `
:host {
  --ma-bg: #ffffff;
  --ma-fg: #16181d;
  --ma-muted: #5b6270;
  --ma-line: #dde1e7;
  --ma-panel: #f5f6f8;
  --ma-accent: #2f6fde;
  --ma-accent-fg: #ffffff;
  --ma-warn: #a45a00;
  --ma-radius: 10px;
  --ma-gap: 12px;
  --ma-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  display: block;
  color: var(--ma-fg);
  background: var(--ma-bg);
  font: 14px/1.45 var(--ma-font);
  container-type: inline-size;
}
@media (prefers-color-scheme: dark) {
  :host {
    --ma-bg: #121418;
    --ma-fg: #e8eaee;
    --ma-muted: #9aa3b2;
    --ma-line: #2a2f38;
    --ma-panel: #1b1f26;
    --ma-accent: #6d9cff;
    --ma-accent-fg: #0c0f14;
    --ma-warn: #f0a24a;
  }
}
* { box-sizing: border-box; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; margin-bottom: var(--ma-gap); }
.head h2 { font-size: 18px; margin: 0; font-weight: 600; }
.head .meta { color: var(--ma-muted); font-size: 13px; }
.transport {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
  padding: 8px 12px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius);
  background: var(--ma-panel); margin-bottom: var(--ma-gap);
}
button {
  font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: 6px;
  background: var(--ma-bg); color: var(--ma-fg); padding: 4px 10px; min-height: 32px;
}
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); min-width: 96px; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
input[type="range"] { width: 100%; accent-color: var(--ma-accent); }
.time { font: 12px var(--ma-mono); color: var(--ma-muted); white-space: nowrap; }
.error { color: var(--ma-warn); font-size: 13px; margin: -4px 0 var(--ma-gap); min-height: 0; }
.error:empty { display: none; }
.lanes { display: grid; gap: var(--ma-gap); grid-template-columns: repeat(var(--ma-columns, 3), minmax(0, 1fr)); }
@container (max-width: 720px) { .lanes { grid-template-columns: minmax(0, 1fr); } }
.lane { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); overflow: hidden; background: var(--ma-panel); }
.lane.preferred { border-color: var(--ma-accent); }
.screen { position: relative; background: #000; aspect-ratio: 16 / 9; }
.screen video { width: 100%; height: 100%; display: block; object-fit: contain; }
.playhead { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.15); }
.playhead span { display: block; height: 100%; width: 0; background: var(--ma-accent); }
.badge { position: absolute; top: 8px; left: 8px; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.7); color: #fff; }
.caption { padding: 10px 12px 12px; display: grid; gap: 8px; font-size: 13px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.model { font-weight: 600; font-size: 14px; }
.id { font: 12px var(--ma-mono); color: var(--ma-muted); overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
dt { color: var(--ma-muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.prompt { display: grid; gap: 4px; }
.prompt pre { margin: 0; padding: 6px 8px; font: 12px/1.4 var(--ma-mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--ma-bg); border: 1px solid var(--ma-line); border-radius: 6px; max-height: 8.5em; overflow: auto; }
.inputs { display: flex; flex-wrap: wrap; gap: 8px; }
.input { display: grid; gap: 2px; width: 96px; font-size: 11px; color: var(--ma-muted); }
.input img, .input video { width: 96px; height: 54px; object-fit: cover; border-radius: 4px; background: #000; display: block; }
.input .ph { width: 96px; height: 54px; border-radius: 4px; border: 1px dashed var(--ma-line); display: grid; place-items: center; }
.input span { overflow-wrap: anywhere; }
.note { color: var(--ma-muted); font-style: italic; }
.small { font-size: 12px; padding: 2px 8px; min-height: 28px; }
`;
