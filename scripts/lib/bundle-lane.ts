/**
 * `run-lane --bundle <dir>`: a Motion Studio (or Beat Path) bundle directory
 * through `planGuideLane`, the same planner `<arena-generate>` uses, so for
 * the same files both send the same task. The shot comes from `--shot`
 * (a `{ subject, environment, action, legend }` file) or the bundle's
 * recipe.json; `--prompt` replaces the composed prompt.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadGuideBundle, loadImage, parseGuideShot, type BundleEntry } from "../../providers/runware-api/guide-bundle.ts";
import { GUIDE_MODEL_KEYS, planGuideLane } from "../../providers/runware-api/guide-plan.ts";
import type { LaneRequest } from "../../providers/types.ts";
import type { ComposedLane } from "./shot.ts";

export async function fileEntry(path: string): Promise<BundleEntry> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`${path} is not a file.`);
  return { name: basename(path), size: info.size, bytes: async () => new Uint8Array(await readFile(path)) };
}

export interface BundleFlags {
  bundle: string;
  model: string;
  shot?: string;
  prompt?: string;
  character?: string;
  resolution?: string;
  guide?: string;
  audio?: string;
  "first-frame"?: string;
  duration?: string;
  camera?: string;
}

export type BundleRequest = LaneRequest & { composed?: ComposedLane; sources: string[] };

export async function buildBundleRequest(o: BundleFlags): Promise<BundleRequest> {
  for (const f of ["guide", "audio", "first-frame", "duration", "camera"] as const)
    if (o[f] !== undefined) throw new Error(`--${f} cannot be used with --bundle; the bundle and its shot decide it.`);
  if (!(GUIDE_MODEL_KEYS as readonly string[]).includes(o.model))
    throw new Error(`--bundle runs ${GUIDE_MODEL_KEYS.join(", ")}; got "${o.model}".`);
  const dir = o.bundle;
  const names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
  const guide = await loadGuideBundle(await Promise.all(names.map((n) => fileEntry(join(dir, n)))));
  let shot = guide.shot;
  if (o.shot) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(o.shot, "utf8"));
    } catch (e) {
      throw new Error(`--shot ${o.shot}: ${(e as Error).message}`, { cause: e });
    }
    shot = parseGuideShot(json);
    if (!shot) throw new Error(`--shot ${o.shot}: with --bundle, give { "subject", "action", "environment"?, "legend"? }.`);
  }
  const character = o.character ? await loadImage(await fileEntry(o.character)) : undefined;
  const lp = planGuideLane({ guide, model: o.model, shot, prompt: o.prompt, character, resolution: o.resolution });
  return {
    ...lp.request,
    composed: { shot: lp.shot, composed: lp.composed, marker: lp.marker ?? { model: lp.composed.model } },
    sources: [...names.map((n) => join(dir, n)), ...(o.character ? [o.character] : [])],
  };
}
