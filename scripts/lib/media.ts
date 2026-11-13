/** Local files to LaneMedia for the CLI: bytes to a data URI, plus probed facts. */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { probeMp4 } from "../../packages/core/src/mp4.ts";
import { imageSize } from "../../providers/runware-api/guide-bundle.ts";
import type { LaneMedia } from "../../providers/types.ts";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

const MAX_BYTES = 300 * 1024 * 1024;

/** Duration of a PCM WAV from its header, or undefined. */
export function wavSeconds(b: Uint8Array): number | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.byteLength < 44 || String.fromCharCode(...b.subarray(0, 4)) !== "RIFF") return undefined;
  let p = 12;
  let byteRate = 0;
  while (p + 8 <= b.byteLength) {
    const id = String.fromCharCode(...b.subarray(p, p + 4));
    const size = v.getUint32(p + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(p + 16, true);
    if (id === "data") return byteRate ? size / byteRate : undefined;
    p += 8 + size + (size % 2);
  }
  return undefined;
}

/** A local path or an https URL as LaneMedia. URLs are passed through untouched. */
export async function loadMedia(pathOrUrl: string, kind: "video" | "image" | "audio"): Promise<LaneMedia> {
  if (/^https:\/\//.test(pathOrUrl)) {
    const name = basename(new URL(pathOrUrl).pathname) || kind;
    return { name, contentType: TYPES[extname(name).toLowerCase()] ?? `${kind}/*`, ref: pathOrUrl, displaySrc: pathOrUrl };
  }
  if (/^[a-z]+:/i.test(pathOrUrl) && !/^[a-z]:\\/i.test(pathOrUrl))
    throw new Error(`${pathOrUrl}: use a local file path or an https URL.`);
  const info = await stat(pathOrUrl);
  if (!info.isFile()) throw new Error(`${pathOrUrl} is not a file.`);
  if (info.size > MAX_BYTES) throw new Error(`${pathOrUrl} is over 300 MB.`);
  const ext = extname(pathOrUrl).toLowerCase();
  const contentType = TYPES[ext];
  if (!contentType || !contentType.startsWith(kind))
    throw new Error(`${pathOrUrl}: expected a ${kind} file (${Object.keys(TYPES).join(", ")}).`);
  const bytes = new Uint8Array(await readFile(pathOrUrl));
  const media: LaneMedia = {
    name: basename(pathOrUrl),
    contentType,
    ref: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
    info: { bytes: info.size },
  };
  if (ext === ".mp4" || ext === ".m4a" || ext === ".mov") {
    try {
      const p = probeMp4(bytes);
      media.info = { ...media.info, width: p.width, height: p.height, seconds: p.seconds, fps: p.fps };
    } catch (e) {
      if (kind === "video") throw new Error(`${pathOrUrl}: ${(e as Error).message}`, { cause: e });
    }
  }
  if (kind === "image") {
    // PNG, JPEG or WebP header: each model's pixel and aspect limits are then checked before upload.
    const size = imageSize(bytes);
    if (size) media.info = { ...media.info, ...size };
  }
  if (ext === ".wav") {
    const s = wavSeconds(bytes);
    if (s !== undefined) media.info = { ...media.info, seconds: s };
  }
  return media;
}

/** The same media with its bytes elided, for printing upload tasks. */
export const elide = (ref: string) =>
  ref.startsWith("data:") ? `${ref.slice(0, ref.indexOf(",") + 1)}<${Math.round((ref.length * 3) / 4 / 1024)} KB base64 elided>` : ref;
