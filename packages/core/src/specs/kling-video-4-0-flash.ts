/**
 * Kling VIDEO 4.0 Flash, read from its Runware schema and model page on
 * 10 Nov 2026. Flash has no guides of its own; prompt rules and camera terms
 * come from the 4.0 guides, which share its prompt syntax, and say so.
 */
import { KLING_IMAGE_LIMITS, KLING_VIDEO_4_0 } from "./kling-video-4-0.ts";
import { limits, MB, modelPage, no, range, schemaUrl, yes } from "./helpers.ts";
import type { ModelSpec } from "./types.ts";

const SLUG = "klingai-video-4-0-flash";
const PAGE = modelPage(SLUG);
const SCHEMA = schemaUrl(SLUG);

export const KLING_VIDEO_4_0_FLASH: ModelSpec = {
  ...KLING_VIDEO_4_0,
  id: "kling-4-flash",
  name: "Kling VIDEO 4.0 Flash",
  air: "klingai:kling-video@4.0-flash",
  slug: SLUG,
  sources: { model: PAGE, schema: SCHEMA, guides: KLING_VIDEO_4_0.sources.guides },
  inputs: {
    ...KLING_VIDEO_4_0.inputs,
    firstFrame: yes("inputs.frameImages", 1, SCHEMA, KLING_IMAGE_LIMITS, "This model only supports the first frame."),
    lastFrame: no(SCHEMA, "First frame only."),
    keyframes: no(SCHEMA, "First frame only."),
    referenceImages: yes("inputs.referenceImages", 10, SCHEMA, KLING_IMAGE_LIMITS),
    referenceVideos: yes(
      "inputs.referenceVideos",
      5,
      SCHEMA,
      limits({
        secondsEach: range(3, 20),
        secondsTotalMax: 20,
        sidePx: range(700, 4553),
        maxAreaPx: 8294400,
        fps: range(24, 60),
        maxBytesEach: 300 * MB,
        aspect: range(0.4, 2.5),
      }),
    ),
    sourceVideo: yes(
      "inputs.video",
      1,
      SCHEMA,
      limits({ secondsEach: range(3, 20), sidePx: range(700, 4553), maxAreaPx: 8294400, fps: range(24, 60), maxBytesEach: 300 * MB, aspect: range(0.4, 2.5) }),
      "Prompt-based edit of the source clip.",
    ),
    elements: yes("inputs.elements", 7, SCHEMA, null, "Voices cannot be used with settings.preserveAudio."),
  },
  combinations: [
    {
      id: "image-cap",
      text: "Frame images and reference images share a cap of ten.",
      when: [],
      sharedMax: { inputs: ["firstFrame", "referenceImages"], max: 10 },
      source: SCHEMA,
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 20 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: SCHEMA,
    },
  ],
  output: {
    durations: { kind: "range", min: 3, max: 20, auto: false },
    defaultDuration: 10,
    resolutionField: "width-height",
    resolutions: ["720p"],
    sizes: [
      { label: "720p (16:9)", width: 1280, height: 720 },
      { label: "720p (1:1)", width: 960, height: 960 },
      { label: "720p (9:16)", width: 720, height: 1280 },
      { label: "720p (~21:9)", width: 1464, height: 628 },
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: true, toggle: null },
    source: SCHEMA,
  },
  prompting: {
    ...KLING_VIDEO_4_0.prompting,
    addressing: { ...KLING_VIDEO_4_0.prompting.addressing, source: SCHEMA },
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.094, tier: "720p", mode: "no-video-input", label: "720p · No video input" },
      { usdPerSecond: 0.126, tier: "720p", mode: "video-input", label: "720p · Video input" },
    ],
    surcharges: [],
    source: PAGE,
    note: "The model page shows two figures per rate ($0.0799 / $0.094, $0.107 / $0.126) without saying which applies; the schema's x-pricing gives the higher, used here.",
  },
  notes: [
    "No Flash guides: prompt rules and camera vocabulary are from the Kling VIDEO 4.0 guides (same tag syntax per the schema).",
    "No resolution parameter: 720p only, as width/height pairs; with inputs the size follows the input.",
    "settings.preserveAudio keeps the input video's audio instead of generating new sound; it needs a video or reference video.",
    "Output fps: not stated. Frame-count rule: not stated.",
    "Seed: no request field; the response returns one.",
  ],
};
