/**
 * Record schema, version 1. The JSON Schemas in `../schema/` are the published
 * contract; these types mirror them, and `parseRecord` is the dependency-free
 * runtime check the element runs before it renders anything it fetched.
 */

export const SCHEMA_VERSION = 1 as const;

export interface MediaRef {
  src: string;
  contentType?: string;
  width?: number;
  height?: number;
  fps?: number;
  seconds?: number;
  bytes?: number;
  label?: string;
}

export interface GuideBundle {
  schemaVersion: 1;
  id?: string;
  title?: string;
  video: MediaRef;
  audio?: MediaRef;
  firstFrame?: MediaRef;
  firstFrameStyled?: MediaRef;
  passes?: Record<string, MediaRef>;
  keyframes?: { time: number; src: string }[];
  beats?: number[];
  recipe?: Record<string, unknown>;
  meta?: {
    author?: string;
    createdAt?: string;
    licences?: { asset: string; licence: string; source?: string; attribution?: string }[];
    [key: string]: unknown;
  };
}

export type InputRole =
  | "referenceVideo"
  | "referenceImage"
  | "referenceAudio"
  | "frameImage"
  | "audio"
  | "video";

export interface InputSent {
  role: InputRole;
  /** Where the reader can see the input: a local path, a URL, or a media UUID. */
  src: string;
  frame?: string | number;
  label?: string;
}

/** A raw frame 0 of the guide, B a restyled still, C no first frame. */
export type FirstFrameVariant = "A" | "B" | "C";

export interface Lane {
  id: string;
  label?: string;
  provider: string;
  /** The model asked for: an AIR id, or `auto` for the router. */
  model: string;
  modelName?: string;
  /** The model that actually ran; null when the provider did not say. */
  modelRan: string | null;
  prompt: string;
  inputsSent: InputSent[];
  firstFrameVariant: FirstFrameVariant;
  output: { src: string; contentType?: string; remoteUrl?: string } | null;
  costUsd: number | null;
  /** Wall-clock seconds from submission to result. */
  generationSeconds: number | null;
  durationSeconds?: number | "auto";
  taskUUID?: string;
  routing?: { maxPrice?: number; requirements?: string };
  settings?: Record<string, unknown>;
  status?: "ready" | "pending" | "error" | "placeholder";
  note?: string;
}

export interface ArenaRecord {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt?: string;
  guide?: GuideBundle;
  lanes: Lane[];
  observations?: string[];
  preferredLane?: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROLES: readonly InputRole[] = [
  "referenceVideo",
  "referenceImage",
  "referenceAudio",
  "frameImage",
  "audio",
  "video",
];
// Control characters are refused before any text reaches the page.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export class RecordError extends Error {
  constructor(public path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "RecordError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, path: string, max: number, min = 0): string {
  if (typeof v !== "string") throw new RecordError(path, "must be a string");
  if (v.length < min || v.length > max)
    throw new RecordError(path, `must be ${min}-${max} characters`);
  if (CONTROL.test(v)) throw new RecordError(path, "must be plain text");
  return v;
}

function optText(v: unknown, path: string, max: number) {
  if (v !== undefined) text(v, path, max);
}

function numOrNull(v: unknown, path: string) {
  if (v === null) return;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    throw new RecordError(path, "must be a non-negative number or null");
}

function media(v: unknown, path: string) {
  if (!isObj(v)) throw new RecordError(path, "must be an object");
  text(v.src, `${path}.src`, 2048, 1);
  for (const k of ["width", "height", "fps", "seconds", "bytes"] as const)
    if (v[k] !== undefined && (typeof v[k] !== "number" || !((v[k] as number) >= 0)))
      throw new RecordError(`${path}.${k}`, "must be a non-negative number");
}

export function parseGuide(v: unknown, path = "guide"): GuideBundle {
  if (!isObj(v)) throw new RecordError(path, "must be an object");
  if (v.schemaVersion !== 1) throw new RecordError(`${path}.schemaVersion`, "must be 1");
  media(v.video, `${path}.video`);
  for (const k of ["audio", "firstFrame", "firstFrameStyled"] as const)
    if (v[k] !== undefined) media(v[k], `${path}.${k}`);
  if (v.beats !== undefined) {
    if (!Array.isArray(v.beats) || v.beats.some((b) => typeof b !== "number" || b < 0))
      throw new RecordError(`${path}.beats`, "must be non-negative seconds");
  }
  return v as unknown as GuideBundle;
}

function lane(v: unknown, path: string): Lane {
  if (!isObj(v)) throw new RecordError(path, "must be an object");
  if (typeof v.id !== "string" || !SLUG.test(v.id)) throw new RecordError(`${path}.id`, "must be a slug");
  optText(v.label, `${path}.label`, 120);
  text(v.provider, `${path}.provider`, 40, 1);
  text(v.model, `${path}.model`, 120, 1);
  if (v.modelRan !== null) text(v.modelRan, `${path}.modelRan`, 120, 1);
  text(v.prompt, `${path}.prompt`, 50000);
  if (!Array.isArray(v.inputsSent)) throw new RecordError(`${path}.inputsSent`, "must be an array");
  v.inputsSent.forEach((input, i) => {
    const p = `${path}.inputsSent[${i}]`;
    if (!isObj(input) || !ROLES.includes(input.role as InputRole))
      throw new RecordError(p, `role must be one of ${ROLES.join(", ")}`);
    text(input.src, `${p}.src`, 2048, 1);
  });
  if (!["A", "B", "C"].includes(v.firstFrameVariant as string))
    throw new RecordError(`${path}.firstFrameVariant`, "must be A, B or C");
  if (v.output !== null) {
    if (!isObj(v.output)) throw new RecordError(`${path}.output`, "must be an object or null");
    text(v.output.src, `${path}.output.src`, 2048, 1);
  }
  numOrNull(v.costUsd, `${path}.costUsd`);
  numOrNull(v.generationSeconds, `${path}.generationSeconds`);
  optText(v.note, `${path}.note`, 2000);
  return v as unknown as Lane;
}

/** Validates an untrusted record; throws `RecordError` naming the first bad field. */
export function parseRecord(v: unknown): ArenaRecord {
  if (!isObj(v)) throw new RecordError("record", "must be an object");
  if (v.schemaVersion !== SCHEMA_VERSION)
    throw new RecordError("schemaVersion", `must be ${SCHEMA_VERSION}`);
  if (typeof v.id !== "string" || !SLUG.test(v.id)) throw new RecordError("id", "must be a slug");
  text(v.title, "title", 200, 1);
  if (v.guide !== undefined) parseGuide(v.guide);
  if (!Array.isArray(v.lanes) || v.lanes.length < 1 || v.lanes.length > 12)
    throw new RecordError("lanes", "must hold 1-12 lanes");
  const lanes = v.lanes.map((l, i) => lane(l, `lanes[${i}]`));
  const ids = new Set(lanes.map((l) => l.id));
  if (ids.size !== lanes.length) throw new RecordError("lanes", "lane ids must be distinct");
  if (v.preferredLane !== undefined && !ids.has(v.preferredLane as string))
    throw new RecordError("preferredLane", "must name a lane in this record");
  if (v.observations !== undefined) {
    if (!Array.isArray(v.observations)) throw new RecordError("observations", "must be an array");
    v.observations.forEach((o, i) => text(o, `observations[${i}]`, 2000));
  }
  return v as unknown as ArenaRecord;
}
