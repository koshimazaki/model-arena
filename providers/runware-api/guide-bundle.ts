/**
 * Reads a Motion Studio guide bundle (bundle.json, meta.json, beats.json, the
 * media and an optional recipe.json) from a list of named entries, so the
 * browser (File, Blob) and the CLI (files on disk) load it through one path
 * and so produce byte-identical tasks. Media facts come from meta.json, the
 * bundle's published contract; bytes become data URIs for `mediaStorage`.
 */
import {
  guideFromBundle,
  parseBundleBeats,
  parseBundleManifest,
  parseBundleMeta,
  type BundleBeats,
  type BundleManifest,
  type BundleMeta,
} from "../../packages/core/src/bundle.ts";
import type { GuideBundle } from "../../packages/core/src/record.ts";
import { CAMERA_MOVES, type CameraMove } from "../../packages/core/src/specs/types.ts";
import type { LaneMedia } from "../types.ts";

/** One file of a bundle, whatever holds it. */
export interface BundleEntry {
  name: string;
  size: number;
  bytes(): Promise<Uint8Array>;
}

/** The neutral shot a guide's recipe.json may carry (Beat Path writes one). */
export interface GuideShot {
  subject: string;
  environment?: string;
  action: string;
  /** How to read the guide's colours, e.g. "The orange figure is the character." */
  legend?: string;
  camera?: CameraMove;
}

export interface LoadedGuide {
  manifest: BundleManifest;
  meta: BundleMeta;
  beats: BundleBeats;
  recipe?: Record<string, unknown>;
  /** `recipe.shot`, when the recipe carries a valid one. */
  shot?: GuideShot;
  video: LaneMedia;
  audio?: LaneMedia;
  firstFrame: LaneMedia;
  seconds: number;
  /** The inline guide a record embeds, with media named relative to the record ("./guide.mp4"). */
  guide: GuideBundle;
}

export class GuideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideError";
  }
}

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};
const JSON_MAX = 2 * 1048576;
const MEDIA_MAX = 300 * 1048576;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** The content type from the file name, so every host labels a file the same way. */
export function typeOf(name: string): string | undefined {
  return TYPES[name.toLowerCase().split(".").pop() ?? ""];
}

/** Standard base64, the same in the browser and in Node. */
export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Width and height from a PNG or baseline/progressive JPEG header; undefined otherwise. */
export function imageSize(b: Uint8Array): { width: number; height: number } | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: v.getUint32(16), height: v.getUint32(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) return undefined;
      const marker = b[p + 1]!;
      const len = v.getUint16(p + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { height: v.getUint16(p + 5), width: v.getUint16(p + 7) };
      p += 2 + len;
    }
  }
  return undefined;
}

async function media(entry: BundleEntry, kind: "video" | "image" | "audio", info: LaneMedia["info"] = {}, displaySrc = entry.name): Promise<LaneMedia> {
  const contentType = typeOf(entry.name);
  if (!contentType?.startsWith(kind)) throw new GuideError(`${entry.name}: expected a ${kind} file.`);
  if (entry.size > MEDIA_MAX) throw new GuideError(`${entry.name} is over 300 MB.`);
  const bytes = await entry.bytes();
  const size = kind === "image" ? imageSize(bytes) : undefined;
  return {
    name: entry.name,
    contentType,
    ref: `data:${contentType};base64,${base64(bytes)}`,
    displaySrc,
    info: { ...info, ...size, bytes: entry.size },
  };
}

/**
 * A character sheet or environment still for the lane, its size read from the
 * header. `src` is where a record reader can see it (a URL); the name otherwise.
 */
export const loadImage = (entry: BundleEntry, src?: string) => media(entry, "image", {}, src ?? entry.name);

async function json(entry: BundleEntry | undefined, name: string): Promise<unknown> {
  if (!entry) throw new GuideError(`The bundle has no ${name}.`);
  if (entry.size > JSON_MAX) throw new GuideError(`${name} is over 2 MB.`);
  try {
    return JSON.parse(new TextDecoder().decode(await entry.bytes()));
  } catch {
    throw new GuideError(`${name} is not valid JSON.`);
  }
}

const str = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !CONTROL.test(v);

/** A shot object from untrusted JSON, or undefined when it is not one. */
export function parseGuideShot(v: unknown): GuideShot | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (!str(o.subject, 500) || !(o.action === undefined || o.action === "" || str(o.action, 500))) return undefined;
  const shot: GuideShot = { subject: (o.subject as string).trim(), action: typeof o.action === "string" ? o.action.trim() : "" };
  if (str(o.environment, 500)) shot.environment = (o.environment as string).trim();
  if (str(o.legend, 300)) shot.legend = (o.legend as string).trim();
  if (CAMERA_MOVES.includes(o.camera as CameraMove)) shot.camera = o.camera as CameraMove;
  return shot;
}

/** Loads a bundle from its entries; refuses a bundle that does not match the schema. */
/**
 * Loads a bundle from its entries; refuses a bundle that does not match the
 * schema. `base` is where the bundle is published (a directory URL), so the
 * record can point at it; without it media are named relative ("./guide.mp4").
 */
export async function loadGuideBundle(entries: Iterable<BundleEntry>, opts: { base?: string } = {}): Promise<LoadedGuide> {
  const base = opts.base ? (opts.base.endsWith("/") ? opts.base : `${opts.base}/`) : "./";
  const shown = (name: string) => (/^https?:\/\//.test(base) ? new URL(name, base).href : name);
  const byName = new Map<string, BundleEntry>();
  for (const e of entries) byName.set(e.name.split(/[\\/]/).pop()!, e);
  let manifest: BundleManifest, meta: BundleMeta, beats: BundleBeats;
  try {
    manifest = parseBundleManifest(await json(byName.get("bundle.json"), "bundle.json"));
    meta = parseBundleMeta(await json(byName.get(manifest.meta), manifest.meta));
    beats = parseBundleBeats(await json(byName.get(manifest.beats), manifest.beats));
  } catch (e) {
    throw e instanceof GuideError ? e : new GuideError(`The bundle does not match the guide-bundle schema: ${(e as Error).message}`);
  }
  const recipeEntry = byName.get(manifest.recipe);
  const recipe = recipeEntry ? ((await json(recipeEntry, manifest.recipe)) as Record<string, unknown>) : undefined;
  const need = (name: string) => {
    const e = byName.get(name);
    if (!e) throw new GuideError(`The bundle names ${name}, but that file is missing.`);
    return e;
  };
  const seconds = meta.durationSeconds;
  if (typeof seconds !== "number" || !(seconds > 0 && seconds <= 600)) throw new GuideError("meta.json: durationSeconds must be 0-600 seconds.");
  const video = await media(need(manifest.video), "video", { width: meta.width, height: meta.height, seconds, fps: meta.fps }, shown(manifest.video));
  const firstFrame = await media(need(manifest.firstFrame), "image", {}, shown(manifest.firstFrame));
  const audio = manifest.audio ? await media(need(manifest.audio), "audio", { seconds }, shown(manifest.audio)) : undefined;
  const guide = guideFromBundle({ manifest, beats, meta, ...(recipe ? { recipe } : {}) }, base, undefined);
  const shot = parseGuideShot(recipe?.shot);
  return { manifest, meta, beats, ...(recipe ? { recipe } : {}), ...(shot ? { shot } : {}), video, audio, firstFrame, seconds, guide };
}
