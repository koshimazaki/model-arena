/**
 * Builds the static blog site into site-dist/ for Cloudflare Pages.
 *
 *   npm run build:site                                   preview: clips from media/ (npm run site:preview serves site-media/ there)
 *   MEDIA_BASE=https://<r2 public base>/ npm run build:site   production: clips from R2
 *
 * Runs after `vite build` (dist/model-arena.js). Reads site/manifest.json and
 * site/takes.json; needs no key, no source folder and no server. Clips are
 * never copied into site-dist/: they live on R2 (or in site-media/ for preview).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sceneFigure, sceneRecord, sizeSummary, specTable } from "./lib/site-html.ts";
import type { Manifest, TakesFile } from "./lib/site-takes.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site-dist");
const MAX_BYTES = 25 * 1024 * 1024;

const manifest = JSON.parse(readFileSync(join(ROOT, "site/manifest.json"), "utf8")) as Manifest;
const takes = JSON.parse(readFileSync(join(ROOT, "site/takes.json"), "utf8")) as TakesFile;

/** The one media base setting: MEDIA_BASE, else the manifest's. A relative folder or an https URL, ending in a slash. */
export function mediaBase(raw: string): string {
  const base = raw.endsWith("/") ? raw : `${raw}/`;
  if (/^https:\/\//.test(base)) return base;
  if (/^[a-z][a-z0-9+.-]*:/i.test(base) || base.startsWith("//") || base.includes("..")) throw new Error(`MEDIA_BASE must be a relative folder or an https URL, got ${raw}`);
  return base.replace(/^\.?\//, "");
}

const base = mediaBase(process.env.MEDIA_BASE ?? manifest.mediaBase);
const element = join(ROOT, "dist/model-arena.js");
if (!existsSync(element)) throw new Error("dist/model-arena.js is missing: run vite build first (npm run build:site does both).");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "arena"), { recursive: true });

// The element, its theme and the scene records.
copyFileSync(element, join(OUT, "model-arena.js"));
copyFileSync(join(ROOT, "packages/element/themes/dark-lime.css"), join(OUT, "dark-lime.css"));
const figures = new Map<string, string>();
for (const scene of manifest.scenes) {
  const file = `record-${scene.id}.json`;
  writeFileSync(join(OUT, file), `${JSON.stringify(sceneRecord(manifest, takes, scene.id, base), null, 2)}\n`);
  figures.set(scene.id, sceneFigure(manifest, takes, scene.id, base, file));
}

// The page: the template with the generated parts dropped in at its markers.
let page = readFileSync(join(ROOT, "site/index.html"), "utf8");
page = page.replace(/<!--@scene:([a-z0-9-]+)-->/g, (_, id: string) => {
  const html = figures.get(id);
  if (!html) throw new Error(`site/index.html names scene "${id}", which site/manifest.json does not have`);
  return html;
});
page = page.replace("<!--@specs-->", specTable(manifest, takes));
if (/<!--@/.test(page)) throw new Error("site/index.html has a marker the build does not know");
// Author notes (sources, "RADEK:" reminders) stay in the template; the published page carries no comments.
page = page.replace(/<!--[\s\S]*?-->\n?/g, "");
writeFileSync(join(OUT, "index.html"), page);
copyFileSync(join(ROOT, "site/specs.html"), join(OUT, "arena/specs.html"));
copyFileSync(join(ROOT, "site/_headers"), join(OUT, "_headers"));

// Checks Cloudflare Pages cares about: no file over 25 MiB, nothing that should not ship.
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const problems: string[] = [];
for (const f of walk(OUT)) {
  const rel = relative(OUT, f);
  if (statSync(f).size > MAX_BYTES) problems.push(`${rel} is over 25 MiB`);
  if (/\.(mp4|mov|webm)$|(^|\/)\.env|jobs\.json$|\.key$/i.test(rel)) problems.push(`${rel} must not ship (clips go to R2; no keys or job logs)`);
}
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}

const files = walk(OUT);
console.log(`site-dist/: ${files.length} files, ${(files.reduce((n, f) => n + statSync(f).size, 0) / 1024).toFixed(0)} KiB; media base ${base}`);
console.log(`media for that base (site-media/): ${sizeSummary(takes)}`);
if (!/^https:\/\//.test(base))
  console.log("Preview build: clips load from a relative folder. For Cloudflare Pages, build with MEDIA_BASE=<R2 public URL>/ (docs/deploy.md).");
