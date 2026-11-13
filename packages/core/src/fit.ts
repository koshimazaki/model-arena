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
  /** A cap on reference video plus reference audio seconds together (H3: 15 s). */
  sharedSeconds?: { max: number };
}

export interface FitMedia {
  name: string;
  /** `hasAudio`: whether a video already carries its own sound track. */
  info?: { width?: number; height?: number; seconds?: number; fps?: number | null; bytes?: number; hasAudio?: boolean };
}

export interface FitInput<M extends FitMedia> {
  modelName: string;
  guideVideo?: M;
  firstFrame?: M;
  /** A character or product still that replaces the guide's placeholder figure. */
  character?: M;
  /** An environment or setting still, a reference image after the character. */
  environment?: M;
  audio?: M;
  keyframes?: { media: M; frame: number | "first" | "last" }[];
  /** Refuse rather than drop the audio when a model's shared seconds cap is passed. */
  requireAudio?: boolean;
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
  // Images and clips need different fixes: a resize or crop in any editor, or an ffmpeg scale.
  const image = /image/.test(role);
  if (lim.minSide && w && h && (w < lim.minSide || h < lim.minSide))
    out.push(
      `${model} needs ${role} at least ${lim.minSide} px on each side; ${m.name} is ${w}×${h}. ` +
        (image
          ? `Use a larger image: export or resize it so its shorter side is at least ${lim.minSide} px (1024 px is a safe size).`
          : `Scale it first, e.g. ffmpeg -i in.mp4 -vf scale=-2:${lim.minSide <= 720 ? 720 : lim.minSide} -c:a copy out.mp4`),
    );
  if (lim.maxSide && w && h && (w > lim.maxSide || h > lim.maxSide))
    out.push(`${model} takes ${role} up to ${lim.maxSide} px a side; ${m.name} is ${w}×${h}.${image ? ` Resize it so its longer side is ${lim.maxSide} px or less.` : ""}`);
  if (lim.minRatio && w && h && (w / h < lim.minRatio || w / h > (lim.maxRatio ?? Infinity)))
    out.push(
      `${model} takes ${role} with aspect ${lim.minRatio}-${lim.maxRatio}; ${m.name} is ${(w / h).toFixed(2)}.${image ? " Crop it closer to square: no side more than 2.5 times the other." : ""}`,
    );
  if (s !== undefined && lim.minSeconds !== undefined && s < lim.minSeconds)
    out.push(`${model} needs ${role} of at least ${lim.minSeconds} s; ${m.name} is ${s.toFixed(2)} s.`);
  if (s !== undefined && lim.maxSeconds !== undefined && s > lim.maxSeconds)
    out.push(`${model} takes ${role} up to ${lim.maxSeconds} s; ${m.name} is ${s.toFixed(2)} s. Trim it first.`);
  if (fps && lim.minFps && (fps < lim.minFps || fps > (lim.maxFps ?? Infinity)))
    out.push(`${model} takes ${role} at ${lim.minFps}-${lim.maxFps} fps; ${m.name} is ${fps} fps.`);
  if (bytes && lim.maxBytes && bytes > lim.maxBytes)
    out.push(
      `${model} takes ${role} up to ${Math.round(lim.maxBytes / 1048576)} MB; ${m.name} is ${(bytes / 1048576).toFixed(1)} MB.${image ? " Save it as a JPEG or at a smaller size." : ""}`,
    );
  return out;
}

const sum = (list: FitMedia[]) =>
  list.reduce<number | undefined>((n, m) => (n === undefined || m.info?.seconds === undefined ? undefined : n + m.info.seconds), 0);

/**
 * The shared video + audio seconds rule. Over the cap, the separate audio is
 * not sent and a note says so (the guide video carries the timing); only a
 * caller that requires the audio gets a refusal instead.
 */
export function sharedSeconds(model: string, caps: ModelCaps, videos: FitMedia[], audios: FitMedia[], requireAudio = false): { drop: boolean; note?: string; problem?: string } {
  const max = caps.sharedSeconds?.max;
  const vs = sum(videos);
  const as = sum(audios);
  if (max === undefined || !audios.length || vs === undefined || as === undefined || vs + as <= max) return { drop: false };
  const fmt = (n: number) => `${Math.round(n * 100) / 100} s`;
  if (requireAudio)
    return {
      drop: false,
      problem: `${model} takes reference video and audio up to ${max} s together; got ${fmt(vs)} of video and ${fmt(as)} of audio, and the audio is required. Use a guide of ${fmt(Math.max(0, max - as))} or less, or allow the lane to run without the separate audio.`,
    };
  return {
    drop: true,
    note: `Music not sent to ${model}: video and audio together may not exceed ${max} s; timing comes from the guide video (${fmt(vs)} of video, ${fmt(as)} of audio).`,
  };
}

export function fitLane<M extends FitMedia>(caps: ModelCaps, input: FitInput<M>): FitResult<M> {
  const model = input.modelName;
  const out: FitResult<M> = { referenceVideos: [], referenceAudios: [], referenceImages: [], frameImages: [], notes: [] };
  const problems: string[] = [];
  const { guideVideo, firstFrame, character, environment, audio, keyframes = [] } = input;

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
    // The character goes first among reference images, so it is image 1 (or the first
    // image after the frame images on Kling), matching the composer's numbering.
    if (character) {
      if (!caps.referenceImages) refuse(`${model} takes no reference image for the character.`);
      else {
        problems.push(...checkMedia(model, "reference images", character, caps.referenceImages));
        out.referenceImages.push(character);
      }
    }
    if (environment) {
      if (!caps.referenceImages) refuse(`${model} takes no reference image for the environment.`);
      else {
        problems.push(...checkMedia(model, "reference images", environment, caps.referenceImages));
        out.referenceImages.push(environment);
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
    const shared = sharedSeconds(model, caps, out.referenceVideos, out.referenceAudios, input.requireAudio);
    if (shared.problem) refuse(shared.problem);
    if (shared.drop) {
      out.referenceAudios = [];
      out.notes.push(shared.note!);
    }
    if (keyframes.length) refuse(`${model} is fed the whole clip; keyframes belong to the FLUX 3 Video lane.`);
  } else if (caps.approach === "audio-first-frame") {
    if (character) refuse(`${model} takes no character reference beside a guide; pass the still as --first-frame instead.`);
    if (environment) refuse(`${model} takes one image only; pass the environment still as --first-frame instead.`);
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
    if (character || environment) refuse(`${model} takes no reference images; pass the still as --first-frame instead.`);
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
