/**
 * Per-model facts for the Runware API, each read from that model's published
 * schema on 10 Nov 2026:
 *   https://runware.ai/docs/models/<slug>/schema.json
 * (the path uses the catalogue slug from https://runware.ai/docs/models/index.json,
 * not the AIR id). A field appears here only after its schema showed it.
 * Every task schema sets `additionalProperties: false`, so nothing else may be sent.
 */
import type { ModelCaps } from "../../packages/core/src/fit.ts";

export interface Rate {
  usdPerSecond: number;
  /** Which tier this rate is, as the schema's `x-pricing` labels it. */
  label: string;
  resolution?: string;
  videoInput?: boolean;
}

export interface RunwareModel {
  key: string;
  air: string;
  slug: string;
  name: string;
  caps: ModelCaps;
  prompt: { min: number; max: number; tokens?: string };
  duration:
    | { kind: "range"; min: number; max: number; auto: boolean }
    | { kind: "enum"; values: number[]; auto: boolean };
  /** Values for the `resolution` field, when the schema has one. */
  resolutions?: string[];
  defaultResolution?: string;
  /** Fixed width/height pairs for models sized that way instead (LTX). */
  sizes?: Record<string, { width: number; height: number }>;
  /** `settings.cameraMovement` values; only LTX-2.5 declares any. */
  cameraMovements?: string[];
  rates: Rate[];
  /** Extra per-second charge on the input video's length (H3: "uploaded video"). */
  inputVideoUsdPerSecond?: number;
  schemaUrl: string;
}

const schema = (slug: string) => `https://runware.ai/docs/models/${slug}/schema.json`;

const imageLimits = { max: 10, minSide: 300, maxBytes: 31457280, minRatio: 0.4, maxRatio: 2.5 };

export const KLING_4: RunwareModel = {
  key: "kling-4",
  air: "klingai:kling-video@4.0",
  slug: "klingai-video-4-0",
  name: "Kling VIDEO 4.0",
  caps: {
    approach: "reference-video",
    // x-constraints: each 700-4553 px, 24-60 fps, 3-30 s, <=300 MB; total <=30 s; <=5 videos.
    referenceVideos: {
      max: 5,
      minSeconds: 3,
      maxSeconds: 30,
      totalMaxSeconds: 30,
      minSide: 700,
      maxSide: 4553,
      minFps: 24,
      maxFps: 60,
      maxBytes: 314572800,
      minRatio: 0.4,
      maxRatio: 2.5,
    },
    referenceImages: imageLimits,
    frameImages: { ...imageLimits, indexPositions: false },
    // x-modes lists first-frame+reference-videos.
    startFrameWithReferences: true,
  },
  prompt: { min: 1, max: 26000, tokens: "<<<video_1>>>, <<<image_1>>> (images numbered across frameImages then referenceImages)" },
  duration: { kind: "range", min: 3, max: 30, auto: false },
  resolutions: ["720p", "1080p"],
  defaultResolution: "720p",
  rates: [
    { usdPerSecond: 0.157, label: "720p · No video input", resolution: "720p", videoInput: false },
    { usdPerSecond: 0.235, label: "1080p · No video input", resolution: "1080p", videoInput: false },
    { usdPerSecond: 0.188, label: "720p · Video input", resolution: "720p", videoInput: true },
    { usdPerSecond: 0.282, label: "1080p · Video input", resolution: "1080p", videoInput: true },
  ],
  schemaUrl: schema("klingai-video-4-0"),
};

export const SEEDANCE_25: RunwareModel = {
  key: "seedance-2.5",
  air: "bytedance:seedance@2.5",
  slug: "bytedance-seedance-2-5",
  name: "Seedance 2.5",
  caps: {
    approach: "reference-video",
    referenceVideos: {
      max: 10,
      minSeconds: 2,
      maxSeconds: 30,
      totalMaxSeconds: 30,
      minSide: 300,
      maxSide: 6000,
      maxBytes: 209715200,
      minRatio: 0.4,
      maxRatio: 2.5,
    },
    referenceAudios: { max: 10, minSeconds: 2, maxSeconds: 30, totalMaxSeconds: 30, maxBytes: 15728640 },
    referenceImages: { ...imageLimits, max: 30, maxSide: 6000 },
    frameImages: { ...imageLimits, max: 2, maxSide: 6000, indexPositions: false },
    // allOf: frameImages is forbidden beside referenceImages, referenceVideos or video.
    startFrameWithReferences: false,
  },
  prompt: { min: 2, max: 50000, tokens: "@Video1, @Image1, @Audio1 (array order, from one)" },
  duration: { kind: "range", min: 4, max: 30, auto: true },
  resolutions: ["480p", "720p", "1080p"],
  defaultResolution: "720p",
  rates: [
    { usdPerSecond: 0.1025, label: "Text/Image to Video · 480p", resolution: "480p", videoInput: false },
    { usdPerSecond: 0.2304, label: "Text/Image to Video · 720p", resolution: "720p", videoInput: false },
    { usdPerSecond: 0.61354, label: "Text/Image to Video · 1080p", resolution: "1080p", videoInput: false },
    { usdPerSecond: 0.1313, label: "Video-to-Video · 480p", resolution: "480p", videoInput: true },
    { usdPerSecond: 0.2953, label: "Video-to-Video · 720p", resolution: "720p", videoInput: true },
    { usdPerSecond: 0.73415, label: "Video-to-Video · 1080p", resolution: "1080p", videoInput: true },
  ],
  schemaUrl: schema("bytedance-seedance-2-5"),
};

export const H3: RunwareModel = {
  key: "h3",
  air: "minimax:h3@0",
  slug: "minimax-h3",
  name: "MiniMax H3",
  caps: {
    approach: "reference-video",
    // x-constraints: each 2-15 s, total 15 s, 256-5760 px, >=23.976 fps, <=50 MB.
    referenceVideos: {
      max: 3,
      minSeconds: 2,
      maxSeconds: 15,
      totalMaxSeconds: 15,
      minSide: 256,
      maxSide: 5760,
      minFps: 23.976,
      maxFps: 60,
      maxBytes: 52428800,
      minRatio: 0.4,
      maxRatio: 2.5,
    },
    referenceAudios: { max: 3, minSeconds: 2, maxSeconds: 15, totalMaxSeconds: 15, maxBytes: 15728640 },
    referenceImages: { ...imageLimits, max: 9, minSide: 256, maxSide: 5760 },
    frameImages: { ...imageLimits, max: 2, minSide: 256, maxSide: 5760, indexPositions: false },
    // allOf: frameImages is forbidden beside any reference input.
    startFrameWithReferences: false,
  },
  prompt: { min: 2, max: 7000 },
  duration: { kind: "range", min: 4, max: 15, auto: false },
  resolutions: ["768p", "1440p"],
  defaultResolution: "768p",
  rates: [
    { usdPerSecond: 0.08, label: "768p", resolution: "768p" },
    { usdPerSecond: 0.13, label: "2K", resolution: "1440p" },
  ],
  inputVideoUsdPerSecond: 0.13,
  schemaUrl: schema("minimax-h3"),
};

const LTX_CAMERA = ["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"];

export const LTX_25_PRO: RunwareModel = {
  key: "ltx-2.5",
  air: "lightricks:ltx@2.5-pro",
  slug: "lightricks-ltx-2-5-pro",
  name: "LTX-2.5 Pro",
  caps: {
    approach: "audio-first-frame",
    referenceImages: { max: 1 },
    frameImages: { max: 2, indexPositions: false },
    startFrameWithReferences: false,
    // x-constraints: audio 2-10 s on Pro.
    drivingAudio: { max: 1, minSeconds: 2, maxSeconds: 10 },
  },
  prompt: { min: 2, max: 5000 },
  duration: { kind: "enum", values: [6, 8, 10], auto: true },
  sizes: { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 } },
  defaultResolution: "720p",
  cameraMovements: LTX_CAMERA,
  rates: [
    { usdPerSecond: 0.12, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.17, label: "1080p", resolution: "1080p" },
  ],
  schemaUrl: schema("lightricks-ltx-2-5-pro"),
};

export const LTX_25_FAST: RunwareModel = {
  ...LTX_25_PRO,
  key: "ltx-2.5-fast",
  air: "lightricks:ltx@2.5-fast",
  slug: "lightricks-ltx-2-5-fast",
  name: "LTX-2.5 Fast",
  caps: { ...LTX_25_PRO.caps, drivingAudio: { max: 1, minSeconds: 2, maxSeconds: 20 } },
  duration: { kind: "enum", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: true },
  rates: [
    { usdPerSecond: 0.09, label: "720p", resolution: "720p" },
    { usdPerSecond: 0.13, label: "1080p", resolution: "1080p" },
  ],
  schemaUrl: schema("lightricks-ltx-2-5-fast"),
};

export const FLUX_3_VIDEO: RunwareModel = {
  key: "flux-3-video",
  air: "bfl:flux@3-video",
  slug: "bfl-flux-3-video",
  name: "FLUX 3 Video",
  caps: {
    approach: "keyframes",
    frameImages: { max: 10, indexPositions: true },
    startFrameWithReferences: false,
  },
  prompt: { min: 1, max: 50000 },
  duration: { kind: "range", min: 5, max: 20, auto: true },
  resolutions: ["720p", "1080p"],
  defaultResolution: "720p",
  rates: [
    { usdPerSecond: 0.17, label: "T2V & I2V. 720p", resolution: "720p" },
    { usdPerSecond: 0.29, label: "T2V & I2V · 1080p", resolution: "1080p" },
  ],
  schemaUrl: schema("bfl-flux-3-video"),
};

/** The router lane: `model: "auto"` plus `routing` (docs: models-api/model-router). */
export const ROUTER: RunwareModel = {
  key: "auto",
  air: "auto",
  slug: "model-router",
  name: "Model Router",
  caps: {
    approach: "router",
    referenceVideos: { max: 10 },
    referenceImages: { max: 10 },
    referenceAudios: { max: 10 },
    startFrameWithReferences: false,
  },
  prompt: { min: 1, max: 50000 },
  duration: { kind: "range", min: 1, max: 30, auto: false },
  rates: [],
  schemaUrl: "https://runware.ai/docs/models-api/model-router",
};

export const MODELS: RunwareModel[] = [KLING_4, SEEDANCE_25, H3, LTX_25_PRO, LTX_25_FAST, FLUX_3_VIDEO, ROUTER];

export function findModel(keyOrAir: string): RunwareModel {
  const m = MODELS.find((x) => x.key === keyOrAir || x.air === keyOrAir || x.slug === keyOrAir);
  if (!m) throw new Error(`Unknown model "${keyOrAir}". Use one of: ${MODELS.map((x) => x.key).join(", ")}.`);
  return m;
}
