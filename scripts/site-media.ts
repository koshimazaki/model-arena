/**
 * Media for the blog site: for each take chosen in site/manifest.json, a web
 * copy, a poster and the untouched original in site-media/ (gitignored, goes
 * to R2), and the measured facts in site/takes.json (committed).
 *
 *   SITE_SOURCE=<studio .local folder> npm run site:media
 *
 * The source folder holds the studio's jobs.json and media/<job id>.mp4. It is
 * only read. Nothing from jobs.json is copied except the fields written below.
 * Needs ffmpeg and ffprobe on PATH.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeWeb, extractPoster, probe, webImage } from "./lib/site-ffmpeg.ts";
import { checkScene, findJob, type Job, type Manifest, type TakeFacts } from "./lib/site-takes.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, process.env.SITE_MEDIA_DIR ?? "site-media");
const source = process.env.SITE_SOURCE;
if (!source) {
  console.error("Set SITE_SOURCE to the studio's .local folder (it holds jobs.json and media/).");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(ROOT, "site/manifest.json"), "utf8")) as Manifest;
const jobs = (JSON.parse(readFileSync(join(source, "jobs.json"), "utf8")) as { jobs: Job[] }).jobs;
mkdirSync(OUT, { recursive: true });

const takes: TakeFacts[] = [];
const references: Record<string, { web: string; original: string; width: number; height: number }> = {};
let failed = false;

for (const scene of manifest.scenes) {
  const chosen = Object.entries(scene.takes).map(([model, t]) => ({ model, job: findJob(jobs, t.id) }));
  const problems = checkScene(chosen.map((c) => c.job), manifest, chosen.map((c) => c.model));
  if (problems.length) {
    failed = true;
    for (const p of problems) console.error(`${scene.id}: ${p}`);
    continue;
  }

  for (const { model, job } of chosen) {
    const id8 = job.id.slice(0, 8);
    const src = join(source, "media", `${job.id}.mp4`);
    if (!existsSync(src)) {
      failed = true;
      console.error(`${scene.id}/${model}: ${src} is missing`);
      continue;
    }
    const stem = `${scene.id}-${model}-${id8}`;
    const original = `${stem}-original.mp4`;
    const web = `${stem}.mp4`;
    const poster = `${stem}.jpg`;
    console.log(`${stem}: probing, encoding, poster`);
    const facts = probe(src);
    copyFileSync(src, join(OUT, original));
    encodeWeb(src, join(OUT, web), facts.hasAudio);
    const posterAt = extractPoster(src, join(OUT, poster));
    const wall = (Date.parse(job.updatedAt) - Date.parse(job.createdAt)) / 1000;
    takes.push({
      scene: scene.id,
      model,
      jobId: job.id,
      prompt: job.prompt,
      requested: { duration: job.duration, resolution: job.resolution, aspectRatio: job.aspectRatio, references: job.imageReferences?.length ?? 0 },
      measured: { ...facts, originalBytes: statSync(src).size, webBytes: statSync(join(OUT, web)).size, posterAt },
      costActualUsd: job.costActualUsd ?? null,
      costEstimateUsd: job.costEstimateUsd ?? null,
      wallClockSeconds: Number.isFinite(wall) ? Math.round(wall * 10) / 10 : null,
      files: { web, poster, original },
    });
  }

  // The reference image, when the manifest names one: a path inside the source folder (read only).
  if (scene.reference) {
    const refPath = resolve(source, scene.reference);
    if (!existsSync(refPath)) {
      failed = true;
      console.error(`${scene.id}: reference ${scene.reference} is missing in the source folder`);
      continue;
    }
    // The studio stores stills as <job id>.image; name the copy by what the bytes are.
    const head = readFileSync(refPath).subarray(0, 4);
    const sniffed = head[0] === 0x89 && head[1] === 0x50 ? ".png" : head[0] === 0xff && head[1] === 0xd8 ? ".jpg" : "";
    const ext = sniffed || extname(scene.reference).toLowerCase() || ".png";
    const original = `${scene.id}-reference-original${ext}`;
    const webName = `${scene.id}-reference.jpg`;
    copyFileSync(refPath, join(OUT, original));
    const size = webImage(refPath, join(OUT, webName));
    references[scene.id] = { web: webName, original, ...size };
  }
}

if (failed) {
  console.error("site:media stopped: fix the manifest or the source and run it again. site/takes.json was not changed.");
  process.exit(1);
}
writeFileSync(join(ROOT, "site/takes.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), takes, references }, null, 2)}\n`);
const sum = (k: "webBytes" | "originalBytes") => takes.reduce((n, t) => n + t.measured[k], 0);
console.log(`${takes.length} takes · web ${(sum("webBytes") / 1048576).toFixed(1)} MiB · originals ${(sum("originalBytes") / 1048576).toFixed(1)} MiB → ${OUT}`);
