/** Styles for <model-specs>, on the same `--ma-*` tokens as <model-arena>. */
export const specStyles = /* css */ `
.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
section[hidden] { display: none; }
section > h3 { font-size: 14px; margin: 0 0 8px; font-weight: 600; }
.scroll { overflow-x: auto; max-width: 100%; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); }
table.matrix { border-collapse: collapse; width: 100%; min-width: 860px; font-size: 13px; }
.matrix th, .matrix td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--ma-line); }
.matrix thead th { font-weight: 600; color: var(--ma-muted); background: var(--ma-input); position: sticky; top: 0; }
.matrix tbody th { font-weight: 600; white-space: nowrap; }
.matrix tbody th button { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.matrix tbody th button:focus-visible { outline: 2px solid var(--ma-accent); }
.matrix .no { color: var(--ma-muted); opacity: 0.7; }
.matrix .yes { color: var(--ma-accent); }
.matrix code, .card code, .out code { font: 12px var(--ma-mono); }
.cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
article.card { border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg); padding: 12px; display: grid; gap: 10px; min-width: 0; font-size: 13px; }
article.card.focus { outline: 2px solid var(--ma-accent); }
.card h4 { margin: 0; font-size: 15px; }
.card h5 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ma-muted); font-weight: 600; }
.card ul { margin: 0; padding-left: 18px; display: grid; gap: 3px; }
.card dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 10px; margin: 0; }
.card dt { color: var(--ma-muted); }
.card dd { margin: 0; overflow-wrap: anywhere; }
.card a, .out a { color: var(--ma-accent); overflow-wrap: anywhere; }
.links { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font: 12px var(--ma-mono); background: var(--ma-chip); border: 1px solid var(--ma-line); border-radius: 5px; padding: 1px 6px; }
details summary { cursor: pointer; color: var(--ma-muted); }
.composer form { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); align-items: end; }
.composer label { display: grid; gap: 4px; font-size: 12px; color: var(--ma-muted); min-width: 0; }
.composer input[type="text"], .composer input[type="number"], .composer select {
  font: 14px var(--ma-font); color: var(--ma-fg); background: var(--ma-input); border: 1px solid var(--ma-line);
  border-radius: 6px; padding: 6px 8px; min-height: 34px; width: 100%; min-width: 0;
}
.composer fieldset { border: 1px solid var(--ma-line); border-radius: 6px; padding: 6px 10px; margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; grid-column: 1 / -1; }
.composer legend { font-size: 12px; color: var(--ma-muted); padding: 0 4px; }
.composer fieldset label { display: inline-flex; flex-direction: row; gap: 6px; align-items: center; color: var(--ma-fg); font-size: 13px; }
.outs { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); margin-top: 12px; }
.out { border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg); padding: 10px; display: grid; gap: 8px; min-width: 0; font-size: 13px; }
.out .row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: space-between; }
.out pre { margin: 0; padding: 8px; font: 12px/1.45 var(--ma-mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--ma-input); border-radius: 6px; max-height: 16em; overflow: auto; }
.out ul { margin: 0; padding-left: 18px; display: grid; gap: 2px; }
.out .warn { color: var(--ma-warn); }
.shotline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
`;
