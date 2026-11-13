/**
 * The design tokens every element reads: colours, radii, gap and fonts, as
 * `--ma-*` custom properties with neutral defaults (greys, no brand colour).
 * A host maps its own tokens from outside, which wins over `:host`:
 *   model-arena, arena-generate, arena-key, arena-gallery { --ma-accent: var(--brand); }
 * theme="light" forces the light set; theme="auto" follows prefers-color-scheme.
 * The table is in docs/embed.md.
 */

const DARK = `
  --ma-bg: #18181b; --ma-card: #1f1f23; --ma-fg: #f4f4f5; --ma-muted: #a1a1aa;
  --ma-line: #3f3f46; --ma-input: #27272a; --ma-chip: #2e2e33;
  --ma-accent: #e4e4e7; --ma-accent-fg: #18181b; --ma-warn: #fbbf24; --ma-ok: #86efac;`;

const LIGHT = `
  --ma-bg: #ffffff; --ma-card: #f7f7f8; --ma-fg: #18181b; --ma-muted: #52525b;
  --ma-line: #d4d4d8; --ma-input: #efeff1; --ma-chip: #e7e7ea;
  --ma-accent: #27272a; --ma-accent-fg: #ffffff; --ma-warn: #9a5800; --ma-ok: #166534;`;

const SHAPE = `
  --ma-radius: 7px; --ma-radius-lg: 12px; --ma-gap: 8px;
  --ma-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace;`;

/** `:host` defaults plus the light and auto variants, for every element's shadow styles. */
export const tokens = /* css */ `
:host {${DARK}${SHAPE} }
:host([theme="light"]) {${LIGHT} }
@media (prefers-color-scheme: light) { :host([theme="auto"]) {${LIGHT} } }
`;

/** The token names, for the docs table and tests. */
export const TOKEN_NAMES = [
  "--ma-bg", "--ma-card", "--ma-fg", "--ma-muted", "--ma-line", "--ma-input", "--ma-chip",
  "--ma-accent", "--ma-accent-fg", "--ma-warn", "--ma-ok", "--ma-radius", "--ma-radius-lg", "--ma-gap", "--ma-font", "--ma-mono",
] as const;
