/**
 * Presets for <arena-generate>: a bundle URL, reference image URLs, a shot
 * and a model, so a host can open the element with an example already loaded,
 * and a published record can be opened back into it ("Run this yourself").
 * Fetches go to the host's own origin (or wherever the preset points); none
 * of them carries the key.
 */
import type { ArenaRecord } from "../../../core/src/record.ts";
import { MODEL_SPECS } from "../../../core/src/specs/index.ts";
import { parseGuideShot, type GuideShot } from "../../../../providers/runware-api/guide-bundle.ts";
import { GUIDE_MODEL_KEYS } from "../../../../providers/runware-api/guide-plan.ts";

export interface GeneratePreset {
  /** The bundle directory, holding bundle.json and the files it names. */
  bundle: string;
  references?: { character?: string; environment?: string };
  shot?: GuideShot;
  model?: string;
  /** Free text that replaces the composed prompt. */
  prompt?: string;
}

const NAME = /^[A-Za-z0-9._-]{1,255}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const url = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 2048 && !/^(javascript|data):/i.test(v.trim());

/** Validates an untrusted preset; throws with the first bad field. */
export function parsePreset(v: unknown): GeneratePreset {
  if (!isObj(v)) throw new Error("preset must be an object");
  if (!url(v.bundle)) throw new Error("preset.bundle must be a bundle directory URL");
  const out: GeneratePreset = { bundle: v.bundle as string };
  if (v.references !== undefined) {
    if (!isObj(v.references)) throw new Error("preset.references must be an object");
    out.references = {};
    for (const k of ["character", "environment"] as const) {
      const r = v.references[k];
      if (r === undefined) continue;
      if (!url(r)) throw new Error(`preset.references.${k} must be an image URL`);
      out.references[k] = r as string;
    }
  }
  if (v.shot !== undefined) {
    const shot = parseGuideShot(v.shot);
    if (!shot) throw new Error("preset.shot needs a subject (and an action)");
    out.shot = shot;
  }
  if (v.model !== undefined) {
    if (!(GUIDE_MODEL_KEYS as readonly string[]).includes(v.model as string)) throw new Error(`preset.model must be one of ${GUIDE_MODEL_KEYS.join(", ")}`);
    out.model = v.model as string;
  }
  if (v.prompt !== undefined) {
    if (typeof v.prompt !== "string" || v.prompt.length > 5000) throw new Error("preset.prompt must be text up to 5000 characters");
    out.prompt = v.prompt;
  }
  return out;
}

async function get(href: string): Promise<Blob> {
  const res = await fetch(href);
  if (!res.ok) throw new Error(`${new URL(href).pathname.split("/").pop()}: HTTP ${res.status}`);
  return res.blob();
}

/** Fetches bundle.json from a directory URL, then every file it names. */
export async function fetchBundle(dirUrl: string): Promise<{ files: Record<string, Blob>; dir: string }> {
  const dir = dirUrl.endsWith("/") ? dirUrl : `${dirUrl}/`;
  const manifest = JSON.parse(await (await get(new URL("bundle.json", dir).href)).text()) as Record<string, unknown>;
  const files: Record<string, Blob> = { "bundle.json": new Blob([JSON.stringify(manifest)], { type: "application/json" }) };
  const optional = new Set([manifest.recipe, manifest.camera, manifest.firstFrameStyled]);
  for (const k of ["video", "audio", "firstFrame", "beats", "recipe", "meta", "camera"]) {
    const n = manifest[k];
    if (typeof n !== "string" || !NAME.test(n)) continue;
    try {
      files[n] = await get(new URL(n, dir).href);
    } catch (e) {
      if (!optional.has(n)) throw e;
    }
  }
  return { files, dir };
}

/** A reference image from a URL, with that URL kept for the record. */
export async function fetchReference(href: string): Promise<{ blob: Blob; src: string; name: string }> {
  const blob = await get(href);
  return { blob, src: href, name: new URL(href).pathname.split("/").pop() || "reference.png" };
}

/**
 * A preset that reruns a record's first lane: its bundle (the guide video's
 * directory), the reference images it was sent, its shot and its model.
 * Null when the record has no guide or no lane the generate flow can run.
 */
export function presetFromRecord(record: ArenaRecord, base: string): GeneratePreset | null {
  if (!record.guide) return null;
  const lane = record.lanes.find((l) => l.shot || l.composed) ?? record.lanes[0];
  if (!lane) return null;
  const spec = MODEL_SPECS.find((s) => s.air === lane.model || s.id === lane.model || s.id === lane.composed?.model);
  const model = spec && (GUIDE_MODEL_KEYS as readonly string[]).includes(spec.id) ? spec.id : undefined;
  if (!model) return null;
  const video = new URL(record.guide.video.src, base);
  const preset: GeneratePreset = { bundle: new URL(".", video).href, model };
  const shot = lane.shot ?? record.shot;
  if (shot) {
    preset.shot = { subject: shot.subject, action: shot.action, ...(shot.environment ? { environment: shot.environment } : {}), ...(shot.legend ? { legend: shot.legend } : {}), camera: shot.camera };
    // Image inputs were sent in the shot's reference order: character, then environment.
    const images = lane.inputsSent.filter((i) => i.role === "referenceImage" || i.role === "frameImage");
    const ids = shot.references.filter((r) => r.kind === "image").map((r) => r.id);
    images.forEach((img, i) => {
      const id = ids[i];
      if (id === "character" || id === "environment") preset.references = { ...preset.references, [id]: new URL(img.src, base).href };
    });
  }
  if (!lane.composed) preset.prompt = lane.prompt;
  return preset;
}
