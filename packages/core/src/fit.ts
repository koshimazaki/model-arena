/**
 * Lane fitting: adapts a guide to what one model accepts, or refuses with a
 * message that says why and what to do instead. Capabilities come from each
 * model's published schema (see providers/runware-api/models.ts); this file
 * holds only the rules, so it stays provider-agnostic.
 */

export interface MediaLimits {
  max: number;
  minSeconds?: number;
  maxSeconds?: number;
  totalMaxSeconds?: number;
  minSide?: number;
  maxSide?: number;
  minFps?: number;
  maxFps?: number;
  maxBytes?: number;
  minRatio?: number;
  maxRatio?: number;
}

export interface ModelCaps {
  /** How the guide reaches this model. */
  approach: "reference-video" | "audio-first-frame" | "keyframes" | "router";
  referenceVideos?: MediaLimits;
  referenceAudios?: MediaLimits;
  referenceImages?: MediaLimits;
  frameImages?: MediaLimits & { indexPositions: boolean };
  /** Whether a start frame may sit beside reference videos or images. */
  startFrameWithReferences: boolean;
  /** LTX-style audio drive: the audio plus one reference image. */
  drivingAudio?: MediaLimits;
}

export interface FitMedia {
  name: string;
  info?: { width?: number; height?: number; seconds?: number; fps?: number | null; bytes?: number };
}

export interface FitInput<M extends FitMedia> {
  modelName: string;
  guideVideo?: M;
  firstFrame?: M;
  audio?: M;
  keyframes?: { media: M; frame: number | "first" | "last" }[];
}

export interface FitResult<M> {
  referenceVideos: M[];
  referenceAudios: M[];
  referenceImages: M[];
  frameImages: { media: M; frame: number | "first" | "last" }[];
  drivingAudio?: M;
  notes: string[];
}

export class FitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FitError";
  }
}

/** Problems with one file against one limit set, in plain words. */
export function checkMedia(model: string, role: string, m: FitMedia, lim: MediaLimits): string[] {
  const out: string[] = [];
  const i = m.info;
  if (!i) return out;
  const { width: w, height: h, seconds: s, fps, bytes } = i;
  if (lim.minSide && w && h && (w < lim.minSide || h < lim.minSide))
    out.push(
      `${model} needs ${role} at least ${lim.minSide} px on each side; ${m.name} is ${w}×${h}. ` +
        `Scale it first, e.g. ffmpeg -i in.mp4 -vf scale=-2:${lim.minSide <= 720 ? 720 : lim.minSide} -c:a copy out.mp4`,
    );
  if (lim.maxSide && w && h && (w > lim.maxSide || h > lim.maxSide))
    out.push(`${model} takes ${role} up to ${lim.maxSide} px a side; ${m.name} is ${w}×${h}.`);
  if (lim.minRatio && w && h && (w / h < lim.minRatio || w / h > (lim.maxRatio ?? Infinity)))
    out.push(`${model} takes ${role} with aspect ${lim.minRatio}-${lim.maxRatio}; ${m.name} is ${(w / h).toFixed(2)}.`);
  if (s !== undefined && lim.minSeconds !== undefined && s < lim.minSeconds)
    out.push(`${model} needs ${role} of at least ${lim.minSeconds} s; ${m.name} is ${s.toFixed(2)} s.`);
  if (s !== undefined && lim.maxSeconds !== undefined && s > lim.maxSeconds)
    out.push(`${model} takes ${role} up to ${lim.maxSeconds} s; ${m.name} is ${s.toFixed(2)} s. Trim it first.`);
  if (fps && lim.minFps && (fps < lim.minFps || fps > (lim.maxFps ?? Infinity)))
    out.push(`${model} takes ${role} at ${lim.minFps}-${lim.maxFps} fps; ${m.name} is ${fps} fps.`);
  if (bytes && lim.maxBytes && bytes > lim.maxBytes)
    out.push(`${model} takes ${role} up to ${Math.round(lim.maxBytes / 1048576)} MB; ${m.name} is ${(bytes / 1048576).toFixed(1)} MB.`);
  return out;
}

export function fitLane<M extends FitMedia>(caps: ModelCaps, input: FitInput<M>): FitResult<M> {
  const model = input.modelName;
  const out: FitResult<M> = { referenceVideos: [], referenceAudios: [], referenceImages: [], frameImages: [], notes: [] };
  const problems: string[] = [];
  const { guideVideo, firstFrame, audio, keyframes = [] } = input;

  const refuse = (msg: string) => problems.push(msg);

  if (caps.approach === "reference-video" || caps.approach === "router") {
    if (!guideVideo && caps.approach === "reference-video") refuse(`${model} is a reference-video lane; pass the guide clip.`);
    if (guideVideo) {
      if (!caps.referenceVideos && caps.approach === "reference-video") refuse(`${model} takes no reference video.`);
      else {
        if (caps.referenceVideos) problems.push(...checkMedia(model, "reference videos", guideVideo, caps.referenceVideos));
        out.referenceVideos.push(guideVideo);
      }
    }
    if (firstFrame) {
      if (caps.startFrameWithReferences && caps.frameImages) out.frameImages.push({ media: firstFrame, frame: "first" });
      else if (caps.referenceImages) {
        out.referenceImages.push(firstFrame);
        out.notes.push(
          `${model} refuses a start frame beside reference videos, so the first frame goes in as an image reference.`,
        );
      } else refuse(`${model} cannot take the first frame with a reference video.`);
    }
    if (audio) {
      if (!caps.referenceAudios) refuse(`${model} takes no reference audio; drop --audio for this lane.`);
      else {
        problems.push(...checkMedia(model, "reference audio", audio, caps.referenceAudios));
        out.referenceAudios.push(audio);
      }
    }
    if (keyframes.length) refuse(`${model} is fed the whole clip; keyframes belong to the FLUX 3 Video lane.`);
  } else if (caps.approach === "audio-first-frame") {
    if (guideVideo) refuse(`${model} takes no reference video. Pass --audio and --first-frame instead of --guide.`);
    if (keyframes.length) refuse(`${model} takes a first frame (and optionally a last), not keyframes.`);
    if (audio) {
      if (!caps.drivingAudio) refuse(`${model} takes no audio input.`);
      else {
        if (!firstFrame) refuse(`${model} needs a reference image beside the audio; pass --first-frame.`);
        problems.push(...checkMedia(model, "audio", audio, caps.drivingAudio));
        out.drivingAudio = audio;
        if (firstFrame) {
          out.referenceImages.push(firstFrame);
          out.notes.push(
            `${model} with audio takes the still as inputs.referenceImages (its schema forbids frameImages beside audio); the clip length follows the audio.`,
          );
        }
      }
    } else if (firstFrame) out.frameImages.push({ media: firstFrame, frame: "first" });
    else refuse(`${model} needs --first-frame (and --audio for the audio-driven mode).`);
  } else {
    // keyframes (FLUX 3 Video)
    if (guideVideo) refuse(`${model} uses its video input only to extend a clip; send keyframes or a first frame instead.`);
    if (audio) refuse(`${model} takes no audio input.`);
    if (firstFrame) out.frameImages.push({ media: firstFrame, frame: "first" });
    for (const k of keyframes) {
      if (typeof k.frame === "number" && !caps.frameImages?.indexPositions)
        refuse(`${model} only places frames first or last.`);
      out.frameImages.push(k);
    }
    if (!out.frameImages.length) refuse(`${model} needs --first-frame or keyframes.`);
  }

  if (caps.frameImages && out.frameImages.length > caps.frameImages.max)
    refuse(`${model} takes at most ${caps.frameImages.max} frame images; got ${out.frameImages.length}.`);
  if (caps.referenceImages && out.referenceImages.length > caps.referenceImages.max)
    refuse(`${model} takes at most ${caps.referenceImages.max} reference images.`);

  if (problems.length) throw new FitError(problems.join("\n"));
  return out;
}
