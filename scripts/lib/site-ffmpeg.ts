/** ffprobe and ffmpeg calls for the site media: measure the original, encode the web copy, pick a poster. */
import { execFileSync, spawnSync } from "node:child_process";
import type { MediaFacts } from "./site-takes.ts";

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Facts measured on the file itself. Frames are counted by decoding, not read from the header. */
export function probe(file: string): MediaFacts {
  const info = JSON.parse(
    run("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames:format=duration", "-of", "json", file]),
  ) as { streams: Record<string, string | number>[]; format: { duration: string } };
  const v = info.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`${file}: no video stream`);
  const rate = String(v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate);
  const [n, d] = rate.split("/").map(Number);
  const fps = d ? n! / d : n!;
  return {
    width: Number(v.width),
    height: Number(v.height),
    fps: Math.round(fps * 1000) / 1000,
    fpsText: rate,
    frames: Number(v.nb_read_frames),
    seconds: Math.round(Number(info.format.duration) * 1000) / 1000,
    hasAudio: info.streams.some((s) => s.codec_type === "audio"),
    videoCodec: String(v.codec_name),
  };
}

/** H.264 yuv420p, at most 720 px tall, CRF 26, faststart; AAC audio kept when the source has it. */
export function encodeWeb(src: string, out: string, hasAudio: boolean) {
  run("ffmpeg", [
    "-v", "error", "-y", "-i", src,
    "-vf", "scale=-2:'min(720,ih)'",
    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-profile:v", "high",
    ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-movflags", "+faststart", out,
  ]);
}

/** Mean luma (0-255) of the frame at `t` seconds. */
function lumaAt(src: string, t: number): number {
  // metadata=print writes to stderr.
  const r = spawnSync("ffmpeg", ["-v", "info", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], {
    encoding: "utf8",
  });
  return Number(/YAVG=([\d.]+)/.exec(`${r.stdout}${r.stderr}`)?.[1] ?? 0);
}

/** A poster JPEG from the first early frame that is not near-black; returns its time in seconds. */
export function extractPoster(src: string, out: string): number {
  let at = 0.5;
  for (const t of [0.5, 1, 1.5, 2, 3]) {
    let y: number;
    try {
      y = lumaAt(src, t);
    } catch {
      y = 0;
    }
    if (y > 24) {
      at = t;
      break;
    }
  }
  run("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", src, "-frames:v", "1", "-vf", "scale=-2:'min(720,ih)'", "-q:v", "4", out]);
  return at;
}

/** A JPEG copy at most 1600 px wide, for showing a reference image on the page; returns the source size. */
export function webImage(src: string, out: string): { width: number; height: number } {
  run("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", "scale='min(1600,iw)':-2", "-q:v", "3", out]);
  const s = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", src])) as { streams: { width: number; height: number }[] };
  return { width: s.streams[0]!.width, height: s.streams[0]!.height };
}
