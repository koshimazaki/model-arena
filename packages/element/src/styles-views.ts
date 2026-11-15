/** Styles for the three views: arena tiles, the guidance panel and the full-caption lanes. */
export const viewStyles = /* css */ `
/* layout="arena": tiles keep 16:9 from the row height; hero tiles stretch. */
.stage { display: grid; gap: var(--ma-gap); min-width: 0; }
.tile { position: relative; margin: 0; min-width: 0; border-radius: var(--ma-radius); display: flex; flex-direction: column; gap: 6px; }
.tile-media { position: relative; aspect-ratio: 16 / 9; min-width: 0; }
.tile .screen { height: 100%; }
.tile-foot { display: flex; flex-wrap: wrap; gap: 2px 10px; font: 12px/1.5 var(--ma-mono); color: var(--ma-muted); }
.tile-foot a { color: var(--ma-fg); }
.tile.preferred .screen { box-shadow: 0 0 0 1px var(--ma-accent); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.overlay > * { pointer-events: auto; position: absolute; }
.overlay select {
  top: 8px; left: 8px; max-width: calc(100% - 16px); background: var(--ma-chip); color: var(--ma-fg);
  border: 1px solid var(--ma-line); border-radius: 6px; font: 500 12px var(--ma-font); padding: 3px 6px;
}
.overlay .solo { bottom: 10px; left: 8px; background: var(--ma-chip); }
.overlay .meta { bottom: 12px; right: 10px; font: 12px var(--ma-mono); color: var(--ma-muted); background: rgba(0,0,0,0.55); padding: 1px 6px; border-radius: 4px; }
.stage[data-layout="2-side"] { grid-template-columns: 1fr 1fr; }
.stage[data-layout="2-stack"] { grid-template-columns: 1fr; }
.stage[data-layout="3-row"] { grid-template-columns: repeat(3, 1fr); }
.stage[data-layout="3-hero"] { grid-template-columns: 2fr 1fr; }
.stage[data-layout="3-hero"] .tile:first-child { grid-row: span 2; }
.stage[data-layout="4-grid"] { grid-template-columns: 1fr 1fr; }
.stage[data-layout="4-row"] { grid-template-columns: repeat(4, 1fr); }
.stage[data-layout="5-3-2"] { grid-template-columns: repeat(6, 1fr); }
.stage[data-layout="5-3-2"] .tile { grid-column: span 2; }
.stage[data-layout="5-3-2"] .tile:nth-child(n+4) { grid-column: span 3; }
.stage[data-layout="5-hero"] { grid-template-columns: 2fr 1fr 1fr; }
.stage[data-layout="5-hero"] .tile:first-child { grid-row: span 2; }
.stage[data-layout="3-hero"] .tile:first-child .tile-media, .stage[data-layout="5-hero"] .tile:first-child .tile-media { flex: 1; aspect-ratio: auto; }
.stage[data-layout="4-row"] .overlay .solo { display: none; }
@container (max-width: 640px) {
  .stage[data-layout] { grid-template-columns: minmax(0, 1fr); }
  .stage[data-layout] .tile { grid-column: auto; grid-row: auto; }
  .stage[data-layout] .tile .tile-media { flex: none; aspect-ratio: 16 / 9; }
  .stage[data-layout="4-row"] .overlay .solo { display: inline-block; }
}

/* layout="guidance" */
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ma-gap); }
.side { margin: 0; min-width: 0; display: grid; gap: 6px; }
.side figcaption { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; }
.switcher { display: flex; flex-wrap: wrap; gap: 6px; }
.switcher button[aria-pressed="true"] { background: var(--ma-accent); color: var(--ma-accent-fg); border-color: var(--ma-accent); }
.modes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ma-gap); }
.modes li { border: 1px solid var(--ma-line); border-radius: var(--ma-radius-lg); padding: 10px 12px; display: grid; gap: 2px; color: var(--ma-muted); font-size: 13px; opacity: 0.6; }
.modes li strong { color: var(--ma-fg); font-size: 14px; }
.modes li.on { opacity: 1; border-color: var(--ma-accent); box-shadow: inset 0 0 0 1px var(--ma-accent); }
.strip { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.slot { border: 1px solid var(--ma-line); border-radius: var(--ma-radius); padding: 8px 10px; display: grid; gap: 2px; font-size: 12px; min-width: 0; overflow-wrap: anywhere; }
.slot strong { font-size: 13px; }
.slot.sent { border-color: var(--ma-accent); }
.slot.sent strong::before { content: "● "; color: var(--ma-accent); }
.slot.not-sent { color: var(--ma-muted); }
.slot.cannot { color: var(--ma-muted); opacity: 0.45; border-style: dashed; text-decoration: line-through; text-decoration-thickness: 1px; }
.composed { display: grid; gap: 6px; }
.composed pre { margin: 0; padding: 10px 12px; font: 12px/1.5 var(--ma-mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--ma-bg); border: 1px solid var(--ma-line); border-radius: var(--ma-radius); max-height: 14em; overflow: auto; }
@container (max-width: 640px) {
  .pair, .modes { grid-template-columns: minmax(0, 1fr); }
  .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* layout="three-up": full captions */
.lanes { display: grid; gap: var(--ma-gap); grid-template-columns: repeat(var(--ma-columns, 3), minmax(0, 1fr)); }
@container (max-width: 720px) { .lanes { grid-template-columns: minmax(0, 1fr); } }
.lane { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--ma-line); border-radius: var(--ma-radius); overflow: hidden; background: var(--ma-bg); }
.lane .screen { border-radius: 0; }
.lane.preferred { border-color: var(--ma-accent); }
.caption { padding: 10px 12px 12px; display: grid; gap: 8px; font-size: 13px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
dt { color: var(--ma-muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.prompt { display: grid; gap: 4px; }
.prompt pre { margin: 0; padding: 6px 8px; font: 12px/1.4 var(--ma-mono); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--ma-card); border: 1px solid var(--ma-line); border-radius: 6px; max-height: 8.5em; overflow: auto; }
.inputs { display: flex; flex-wrap: wrap; gap: 8px; }
.input { display: grid; gap: 2px; width: 96px; font-size: 11px; color: var(--ma-muted); }
.input img, .input video { width: 96px; height: 54px; object-fit: cover; border-radius: 4px; background: #000; display: block; }
.input .ph { width: 96px; height: 54px; border-radius: 4px; border: 1px dashed var(--ma-line); display: grid; place-items: center; }
.input span { overflow-wrap: anywhere; }
/* layout="inputs": reference strip, then guide + outputs on one row. */
.ref-strip { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.ref-strip li { display: grid; gap: 2px; width: 84px; font-size: 11px; color: var(--ma-muted); }
.ref-strip img, .ref-strip .ph { width: 84px; height: 56px; object-fit: cover; border-radius: 4px; border: 1px solid var(--ma-line); background: var(--ma-chip); }
.inputs-row { display: grid; grid-template-columns: repeat(var(--ma-columns, 2), minmax(0, 1fr)); gap: var(--ma-gap); min-width: 0; }
@container (max-width: 640px) { .inputs-row { grid-template-columns: 1fr; } }
.inputs-row .side { margin: 0; display: grid; gap: 6px; min-width: 0; align-content: start; }
.inputs-row figcaption { display: grid; gap: 2px; }
.lane-prompt summary { cursor: pointer; font-size: 12px; color: var(--ma-muted); }
.lane-prompt pre { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 var(--ma-mono); background: var(--ma-input); border-radius: 6px; padding: 6px; max-height: 200px; overflow: auto; }
`;
