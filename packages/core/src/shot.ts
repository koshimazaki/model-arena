/**
 * Runtime check for the neutral shot description a record may carry (the one
 * intent behind every lane's composed prompt). Records are fetched, so the
 * shot is validated like the rest before anything renders it.
 */
import type { ComposedPrompt, ReferenceKind, ReferenceRole, ShotDescription } from "./compose.ts";
import { CAMERA_MOVES, type CameraMove } from "./specs/types.ts";

const KINDS: readonly ReferenceKind[] = ["image", "video", "audio"];
export const REFERENCE_ROLES: readonly ReferenceRole[] = [
  "first-frame",
  "last-frame",
  "keyframe",
  "character",
  "product",
  "garment",
  "style",
  "setting",
  "motion",
  "source",
  "soundtrack",
];
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export class ShotError extends Error {
  constructor(public path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ShotError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown, path: string, max: number, optional = false) {
  if (optional && v === undefined) return;
  if (typeof v !== "string" || v.length > max || CONTROL.test(v)) throw new ShotError(path, `must be plain text up to ${max} characters`);
}

export function parseShot(v: unknown, path = "shot"): ShotDescription {
  if (!isObj(v)) throw new ShotError(path, "must be an object");
  text(v.subject, `${path}.subject`, 500);
  text(v.action, `${path}.action`, 500);
  text(v.environment, `${path}.environment`, 500, true);
  text(v.legend, `${path}.legend`, 300, true);
  text(v.focus, `${path}.focus`, 200, true);
  text(v.audio, `${path}.audio`, 500, true);
  if (v.camera !== "guide" && !CAMERA_MOVES.includes(v.camera as CameraMove))
    throw new ShotError(`${path}.camera`, `must be "guide" or one of ${CAMERA_MOVES.join(", ")}`);
  if (typeof v.duration !== "number" || !(v.duration > 0 && v.duration <= 60)) throw new ShotError(`${path}.duration`, "must be 1-60 seconds");
  if (!Array.isArray(v.references) || v.references.length > 20) throw new ShotError(`${path}.references`, "must be an array of up to 20");
  v.references.forEach((r, i) => {
    const p = `${path}.references[${i}]`;
    if (!isObj(r) || typeof r.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id)) throw new ShotError(`${p}.id`, "must be a short id");
    if (!KINDS.includes(r.kind as ReferenceKind)) throw new ShotError(`${p}.kind`, `must be one of ${KINDS.join(", ")}`);
    if (!REFERENCE_ROLES.includes(r.role as ReferenceRole)) throw new ShotError(`${p}.role`, `must be one of ${REFERENCE_ROLES.join(", ")}`);
    text(r.keep, `${p}.keep`, 200, true);
    text(r.replaces, `${p}.replaces`, 200, true);
  });
  if (v.beats !== undefined) {
    if (!Array.isArray(v.beats) || v.beats.length > 20) throw new ShotError(`${path}.beats`, "must be an array of up to 20");
    v.beats.forEach((b, i) => {
      if (!isObj(b) || typeof b.start !== "number" || typeof b.end !== "number" || !(b.end > b.start && b.start >= 0))
        throw new ShotError(`${path}.beats[${i}]`, "must have start < end, in seconds");
      text(b.text, `${path}.beats[${i}].text`, 300);
    });
  }
  return v as unknown as ShotDescription;
}

/** One line for a caption: the intent in plain words. */
export function shotSummary(s: ShotDescription): string {
  const refs = s.references.map((r) => `${r.role} ${r.kind}`).join(", ");
  return `${s.subject} ${s.action}${s.environment ? `, ${s.environment}` : ""}. Camera: ${s.camera === "guide" ? "from the guide" : s.camera}. ${s.duration} s${refs ? `. References: ${refs}` : ""}${s.audio ? `. Sound: ${s.audio}` : ""}.`;
}

/** The record marker for a lane whose prompt came from the composer. */
export function composedMarker(c: ComposedPrompt): { model: string; notes?: string[]; dropped?: string[] } {
  return {
    model: c.model,
    ...(c.notes.length ? { notes: c.notes.slice(0, 40) } : {}),
    ...(c.dropped.length ? { dropped: c.dropped.slice(0, 40).map((d) => `${d.ref}: ${d.reason}`) } : {}),
  };
}
