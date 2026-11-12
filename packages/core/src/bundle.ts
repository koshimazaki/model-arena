/**
 * Motion Studio bundle reader: the manifest form of the guide-bundle schema
 * (`bundle.json` naming each file, schemaVersion "0.x.y", synced at 0.4.0) and
 * the conversion to the inline guide a record embeds. Dependency-free, like
 * `parseRecord`; the JSON Schema `$defs/manifest`, `beats`, `meta` and `camera`
 * are the published contract.
 */

import { onsetBands, onsetList, RecordError, type GuideBundle, type Onset } from "./record.ts";

/** The Motion Studio schema version this reader was synced with. */
export const BUNDLE_SCHEMA_VERSION = "0.5.0";

export interface BundleManifest {
  schemaVersion: string;
  video: string;
  audio?: string;
  firstFrame: string;
  firstFrameStyled?: string;
  beats: string;
  recipe: string;
  meta: string;
  /** Optional (0.2.0): the camera track file. */
  camera?: string;
}

export interface BundleBeats {
  bpm: number;
  offsetSeconds: number;
  beatsPerBar: number;
  source: "manual" | "analysis";
  beats: number[];
  downbeats: number[];
  /** Optional (0.3.0). */
  onsets?: { low: Onset[]; mid: Onset[]; high: Onset[] };
  /** Optional (0.3.0). */
  peaks?: Onset[];
}

export const CHARACTER_KINDS = ["mannequin", "block", "stick", "blob", "glider", "file", "rigged"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export const ASSET_ROLES = [
  "video",
  "audio",
  "firstFrame",
  "character",
  "motion",
  "recipe",
  "beats",
  "camera",
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export interface BundleMeta {
  schemaVersion: string;
  width: number;
  height: number;
  fps: 24;
  frames: number;
  durationSeconds: number;
  view: string;
  character: { kind: CharacterKind; name: string };
  generator: { name: string; version: string; motion: string };
  audioInVideo: boolean;
  assets: { role: AssetRole; name: string; licence: string; file?: string }[];
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const MANIFEST_KEYS = ["schemaVersion", "video", "audio", "firstFrame", "firstFrameStyled", "beats", "recipe", "meta", "camera"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A file name inside the bundle directory: no separators, no parent hops. */
function file(v: unknown, path: string, ext?: RegExp): string {
  if (typeof v !== "string" || v.length < 1 || v.length > 255 || /[\\/]|^\.\.?$/.test(v))
    throw new RecordError(path, "must be a file name inside the bundle");
  if (ext && !ext.test(v)) throw new RecordError(path, `must match ${ext}`);
  return v;
}

function seconds(v: unknown, path: string): number[] {
  if (!Array.isArray(v) || v.some((b) => typeof b !== "number" || !(b >= 0)))
    throw new RecordError(path, "must be non-negative seconds");
  return v as number[];
}

/** Validates a `bundle.json`; refuses unknown keys, as the schema does. */
export function parseBundleManifest(v: unknown, path = "bundle"): BundleManifest {
  if (!isObj(v)) throw new RecordError(path, "must be an object");
  if (typeof v.schemaVersion !== "string" || !SEMVER.test(v.schemaVersion))
    throw new RecordError(`${path}.schemaVersion`, "must be x.y.z");
  for (const k of Object.keys(v))
    if (!MANIFEST_KEYS.includes(k)) throw new RecordError(`${path}.${k}`, "is not a bundle key");
  file(v.video, `${path}.video`, /\.mp4$/);
  file(v.firstFrame, `${path}.firstFrame`, /\.png$/);
  for (const k of ["beats", "recipe", "meta"] as const) file(v[k], `${path}.${k}`, /\.json$/);
  if (v.camera !== undefined) file(v.camera, `${path}.camera`, /\.json$/);
  for (const k of ["audio", "firstFrameStyled"] as const) if (v[k] !== undefined) file(v[k], `${path}.${k}`);
  return v as unknown as BundleManifest;
}

/** Validates a `beats.json`, including the optional 0.3.0 onsets and peaks. */
export function parseBundleBeats(v: unknown, path = "beats"): BundleBeats {
  if (!isObj(v)) throw new RecordError(path, "must be an object");
  if (typeof v.bpm !== "number" || !(v.bpm >= 40 && v.bpm <= 240)) throw new RecordError(`${path}.bpm`, "must be 40-240");
  if (typeof v.offsetSeconds !== "number" || !(v.offsetSeconds >= 0))
    throw new RecordError(`${path}.offsetSeconds`, "must be non-negative");
  if (!Number.isInteger(v.beatsPerBar) || (v.beatsPerBar as number) < 1)
    throw new RecordError(`${path}.beatsPerBar`, "must be a positive integer");
  if (v.source !== "manual" && v.source !== "analysis") throw new RecordError(`${path}.source`, "must be manual or analysis");
  seconds(v.beats, `${path}.beats`);
  seconds(v.downbeats, `${path}.downbeats`);
  if (v.onsets !== undefined) onsetBands(v.onsets, `${path}.onsets`);
  if (v.peaks !== undefined) onsetList(v.peaks, `${path}.peaks`);
  return v as unknown as BundleBeats;
}

/** Validates the parts of a `meta.json` the Arena reads: size, timing, character, licences. */
export function parseBundleMeta(v: unknown, path = "meta"): BundleMeta {
  if (!isObj(v)) throw new RecordError(path, "must be an object");
  for (const k of ["width", "height", "frames"] as const)
    if (!Number.isInteger(v[k]) || (v[k] as number) < 1) throw new RecordError(`${path}.${k}`, "must be a positive integer");
  if (v.fps !== 24) throw new RecordError(`${path}.fps`, "must be 24");
  const c = v.character;
  if (!isObj(c) || !CHARACTER_KINDS.includes(c.kind as CharacterKind) || typeof c.name !== "string")
    throw new RecordError(`${path}.character`, `kind must be one of ${CHARACTER_KINDS.join(", ")}`);
  if (!Array.isArray(v.assets) || v.assets.length < 1) throw new RecordError(`${path}.assets`, "must list at least one asset");
  v.assets.forEach((a, i) => {
    if (!isObj(a) || !ASSET_ROLES.includes(a.role as AssetRole)) throw new RecordError(`${path}.assets[${i}].role`, "unknown role");
    if (typeof a.licence !== "string" || a.licence.length < 1) throw new RecordError(`${path}.assets[${i}].licence`, "is required");
  });
  return v as unknown as BundleMeta;
}

export interface BundleFiles {
  manifest: unknown;
  beats: unknown;
  meta: unknown;
  recipe?: Record<string, unknown>;
}

/**
 * Turns a Motion Studio bundle into the inline guide a record embeds. `base`
 * is the bundle directory as the record will see it (a path or URL prefix).
 * Onsets, peaks, the camera track and the character survive the conversion.
 */
export function guideFromBundle(files: BundleFiles, base: string, id?: string): GuideBundle {
  const m = parseBundleManifest(files.manifest);
  const beats = parseBundleBeats(files.beats);
  const meta = parseBundleMeta(files.meta);
  const dir = base.endsWith("/") ? base : `${base}/`;
  const at = (f: string) => `${dir}${f}`;
  const fps = meta.fps;
  const guide: GuideBundle = {
    schemaVersion: 1,
    ...(id ? { id } : {}),
    video: { src: at(m.video), contentType: "video/mp4", width: meta.width, height: meta.height, fps, seconds: meta.durationSeconds },
    firstFrame: { src: at(m.firstFrame), contentType: "image/png", width: meta.width, height: meta.height },
    beats: beats.beats,
    ...(beats.onsets ? { onsets: beats.onsets } : {}),
    ...(beats.peaks ? { peaks: beats.peaks } : {}),
    ...(files.recipe ? { recipe: files.recipe } : {}),
    meta: {
      licences: meta.assets.map((a) => ({ asset: a.file ?? a.name, licence: a.licence })),
      bundleSchemaVersion: m.schemaVersion,
      character: meta.character,
      generator: meta.generator,
      bpm: beats.bpm,
      downbeats: beats.downbeats,
    },
  };
  if (m.audio) guide.audio = { src: at(m.audio) };
  if (m.firstFrameStyled) guide.firstFrameStyled = { src: at(m.firstFrameStyled) };
  if (m.camera) guide.camera = { src: at(m.camera), contentType: "application/json" };
  return guide;
}
