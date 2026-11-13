/** Styles for <arena-generate> and <arena-gallery>; every value is a --ma-* token. */
import { TOKEN_NAMES, tokens } from "../tokens.ts";

/** Nested elements declare their own defaults on :host; this hands them the outer values instead. */
const passTokens = TOKEN_NAMES.map((t) => `${t}: inherit;`).join(" ");

export const generateStyles = /* css */ `
${tokens}
:host { display: block; width: 100%; max-width: 100%; color: var(--ma-fg); background: var(--ma-card); border: 1px solid var(--ma-line); border-radius: var(--ma-radius-lg); font: 400 14px/1.5 var(--ma-font); container-type: inline-size; overflow: hidden; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { display: grid; gap: 14px; padding: 16px; min-width: 0; }
h3 { margin: 0; font-size: 15px; font-weight: 600; }
fieldset { border: 1px solid var(--ma-line); border-radius: var(--ma-radius); margin: 0; padding: 10px 12px; display: grid; gap: 8px; min-width: 0; }
legend { padding: 0 4px; font-size: 12px; color: var(--ma-muted); }
.models { display: grid; gap: 6px; }
.model-opt { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: start; padding: 6px 8px; border-radius: var(--ma-radius); border: 1px solid transparent; cursor: pointer; }
.model-opt:has(input:checked) { border-color: var(--ma-accent); background: var(--ma-bg); }
.model-opt .line { grid-column: 2; font-size: 12px; color: var(--ma-muted); }
.badge { display: inline-block; margin-left: 6px; font: 11px var(--ma-mono); padding: 1px 6px; border-radius: 4px; background: var(--ma-chip); color: var(--ma-warn); }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@container (max-width: 560px) { .fields { grid-template-columns: 1fr; } .pair, .compare-grid { grid-template-columns: 1fr !important; } }
label.f { display: grid; gap: 3px; min-width: 0; font-size: 12px; color: var(--ma-muted); }
input[type="text"], input[type="number"], textarea { width: 100%; min-width: 0; font: 13px var(--ma-font); color: var(--ma-fg); background: var(--ma-input); border: 1px solid var(--ma-line); border-radius: var(--ma-radius); padding: 6px 8px; }
textarea { min-height: 72px; resize: vertical; }
input[type="number"] { max-width: 120px; }
button, .btn { font: inherit; cursor: pointer; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-input); color: var(--ma-fg); padding: 4px 12px; min-height: 34px; text-decoration: none; display: inline-flex; align-items: center; }
button.primary { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); font-weight: 600; min-width: 96px; }
button:disabled { opacity: 0.5; cursor: default; }
button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--ma-accent); outline-offset: 2px; }
.row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; min-width: 0; }
.row.spread { justify-content: space-between; }
.note { margin: 0; font-size: 12px; color: var(--ma-muted); }
.err { margin: 0; color: var(--ma-warn); font-size: 13px; }
.err:empty, .status:empty { display: none; }
.status { margin: 0; font: 12px var(--ma-mono); color: var(--ma-muted); }
.drop { border: 1px dashed var(--ma-line); border-radius: var(--ma-radius); padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.drop.over { border-color: var(--ma-accent); }
.drop img { width: 56px; height: 56px; object-fit: cover; border-radius: 4px; }
.preview { display: grid; gap: 8px; min-width: 0; }
.prompt-card { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); background: var(--ma-bg); min-width: 0; }
.prompt-card .line, .prompt-card .tags { margin: 0; font-size: 12px; color: var(--ma-muted); }
.prompt-card a, a { color: var(--ma-fg); font-size: 12px; }
pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 var(--ma-mono); background: var(--ma-input); border-radius: 6px; padding: 8px; max-height: 260px; overflow: auto; }
.notes { margin: 0; padding-left: 18px; font-size: 12px; color: var(--ma-muted); }
.compare summary { cursor: pointer; font-size: 13px; }
.compare-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.confirm { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--ma-accent); border-radius: var(--ma-radius); background: var(--ma-bg); }
.result { display: grid; gap: 10px; min-width: 0; }
.caption { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.caption strong { font-weight: 600; }
.switch { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--ma-line); border-radius: 8px; overflow: hidden; max-width: 100%; }
.switch button { border: 0; border-radius: 0; background: transparent; color: var(--ma-muted); min-height: 32px; }
.switch button + button { border-left: 1px solid var(--ma-line); }
.switch button[aria-pressed="true"] { background: var(--ma-accent); color: var(--ma-accent-fg); }
.empty { padding: 32px 16px; text-align: center; color: var(--ma-muted); }
.empty strong { display: block; color: var(--ma-fg); font-size: 15px; margin-bottom: 4px; }
model-arena, arena-key { ${passTokens} }
`;
