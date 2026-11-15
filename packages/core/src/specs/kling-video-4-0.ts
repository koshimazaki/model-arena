/** Kling VIDEO 4.0, read from its Runware schema and guides on 10 Nov 2026. */
import { guide, limits, MB, modelPage, no, range, schemaUrl, yes } from "./helpers.ts";
import type { ModelSpec } from "./types.ts";

const SLUG = "klingai-video-4-0";
const PAGE = modelPage(SLUG);
const SCHEMA = schemaUrl(SLUG);
const G = (p: string) => guide(SLUG, p);

export const KLING_IMAGE_LIMITS = limits({ sidePx: range(300, null), maxBytesEach: 30 * MB, aspect: range(0.4, 2.5) });

export const KLING_VIDEO_4_0: ModelSpec = {
  id: "kling-4",
  name: "Kling VIDEO 4.0",
  lab: "Kling AI",
  air: "klingai:kling-video@4.0",
  slug: SLUG,
  verifiedOn: "2026-11-10",
  sources: {
    model: PAGE,
    schema: SCHEMA,
    guides: [
      { title: "Prompting", url: G("prompting") },
      { title: "Reference images", url: G("reference-images") },
      { title: "Reference videos", url: G("reference-videos") },
      { title: "Keyframes", url: G("keyframes") },
      { title: "Elements", url: G("elements") },
      { title: "Editing video", url: G("editing-video") },
      { title: "Long takes and multi-shot", url: G("long-takes-and-multi-shot") },
      { title: "Dialogue and on-screen text", url: G("dialogue-and-on-screen-text") },
    ],
  },
  inputs: {
    firstFrame: yes("inputs.frameImages", 1, SCHEMA, KLING_IMAGE_LIMITS),
    lastFrame: yes("inputs.frameImages", 1, SCHEMA, KLING_IMAGE_LIMITS),
    keyframes: yes(
      "inputs.frameImages",
      10,
      G("keyframes"),
      KLING_IMAGE_LIMITS,
      "3-10 frames (x-modes multiple-frames); only first and last are pinned, the rest are spaced evenly in array order.",
    ),
    referenceImages: yes("inputs.referenceImages", 10, SCHEMA, KLING_IMAGE_LIMITS),
    referenceVideos: yes(
      "inputs.referenceVideos",
      5,
      SCHEMA,
      limits({
        secondsEach: range(3, 30),
        secondsTotalMax: 30,
        sidePx: range(700, 4553),
        maxAreaPx: 8294400,
        fps: range(24, 60),
        maxBytesEach: 300 * MB,
        aspect: range(0.4, 2.5),
      }),
    ),
    referenceAudios: no(SCHEMA, "No audio input in the schema."),
    sourceVideo: yes(
      "inputs.video",
      1,
      G("editing-video"),
      limits({ secondsEach: range(3, 30), sidePx: range(700, 4553), maxAreaPx: 8294400, fps: range(24, 60), maxBytesEach: 300 * MB, aspect: range(0.4, 2.5) }),
      "Prompt-based edit of the source clip.",
    ),
    audioToVideo: no(SCHEMA),
    elements: yes(
      "inputs.elements",
      7,
      G("elements"),
      null,
      "At most three built from video; a video element is one 3-8 s clip; voices only beside images.",
    ),
  },
  combinations: [
    {
      id: "image-cap",
      text: "Frame images and reference images share a cap of ten.",
      when: [],
      sharedMax: { inputs: ["firstFrame", "lastFrame", "keyframes", "referenceImages"], max: 10 },
      source: G("reference-images"),
    },
    {
      id: "video-cap",
      text: "Source video, reference videos and element videos share a cap of five files and 30 s in total.",
      when: [],
      sharedMax: { inputs: ["sourceVideo", "referenceVideos"], max: 5 },
      source: SCHEMA,
    },
  ],
  output: {
    durations: { kind: "range", min: 3, max: 30, auto: false },
    defaultDuration: 10,
    resolutionField: "both",
    resolutions: ["720p", "1080p"],
    sizes: [
      { label: "720p (16:9)", width: 1280, height: 720 },
      { label: "720p (1:1)", width: 940, height: 940 },
      { label: "720p (9:16)", width: 720, height: 1280 },
      { label: "720p (~21:9)", width: 1460, height: 624 },
      { label: "1080p (16:9)", width: 1920, height: 1080 },
      { label: "1080p (1:1)", width: 1440, height: 1440 },
      { label: "1080p (9:16)", width: 1080, height: 1920 },
      { label: "1080p (~21:9)", width: 2200, height: 940 },
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: true, toggle: null },
    source: SCHEMA,
  },
  prompting: {
    minChars: 1,
    maxChars: 26000,
    addressing: {
      style: "tags",
      tokens: [
        { input: "image", pattern: "<<<image_{n}>>>" },
        { input: "video", pattern: "<<<video_{n}>>>" },
        { input: "element", pattern: "<<<element_{n}>>>" },
      ],
      numbering:
        "Images are numbered across frameImages then referenceImages; videos across video then referenceVideos; elements in array order, separately from images.",
      source: SCHEMA,
    },
    rules: [
      { text: "Open with one sentence per input saying what it defines and what to keep from it.", source: G("reference-images") },
      { text: "Name what to copy from a reference video without describing it again; add \"only\" to keep the rest out.", source: G("reference-videos") },
      { text: "Trade mood adjectives for things the camera can see: light direction, materials, focus.", source: G("prompting") },
      { text: "Long briefs run in a fixed order: settings, then timed beats, then an audio section.", source: G("prompting") },
      { text: "Write positively; the only negatives worth writing are no subtitles and no background music.", source: G("prompting") },
    ],
    seed: { supported: false, max: null, source: G("prompting") },
    negativePrompt: false,
  },
  camera: {
    kind: "prompt-only",
    // Runware's "Directing the camera" rule: name the move, the height, the speed and what the shot
    // ends on, tied to something in the frame. "Crane" is not in the vocabulary; "rises and tilts down" is.
    vocabulary: [
      { term: "static camera / locked-off", source: G("prompting"), move: "static", phrase: "Static, locked-off camera at eye level, holding on {subject} for the whole shot." },
      { term: "push-in", source: G("prompting"), move: "push-in", phrase: "Slow push-in at eye level, ending on a close-up of {subject}." },
      { term: "pull-out", source: G("prompting"), move: "pull-out", phrase: "Slow pull-out at eye level, ending on a wide shot with {subject} small in the frame." },
      { term: "tracking shot", source: G("prompting"), move: "track-left", phrase: "Tracking shot at waist height, moving left at walking pace alongside {subject}, ending with {subject} centred." },
      { term: "tracking shot", source: G("prompting"), move: "track-right", phrase: "Tracking shot at waist height, moving right at walking pace alongside {subject}, ending with {subject} centred." },
      { term: "rises and tilts down", source: G("reference-videos"), move: "crane-up", phrase: "The camera slowly rises and tilts down, ending on a high view looking down at {subject}." },
      { term: "orbit", source: G("prompting"), move: "orbit", phrase: "Slow orbit around {subject} at eye level, ending facing {subject}." },
      { term: "light handheld energy", source: G("prompting"), move: "handheld", phrase: "Light handheld energy at eye level, following {subject} and ending on {subject}." },
      { term: "pan", source: G("prompting") },
      { term: "lateral dolly", source: G("dialogue-and-on-screen-text") },
      { term: "one continuous gimbal shot with no cuts", source: G("long-takes-and-multi-shot") },
      { term: "borrowing a camera path: \"Reference only the camera path and pacing of <<<video_1>>>\"", source: G("reference-videos") },
      { term: "timed beats, e.g. \"0–3 s: … 3–7 s: …\"", source: G("prompting") },
    ],
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.157, tier: "720p", mode: "no-video-input", label: "720p · No video input" },
      { usdPerSecond: 0.235, tier: "1080p", mode: "no-video-input", label: "1080p · No video input" },
      { usdPerSecond: 0.188, tier: "720p", mode: "video-input", label: "720p · Video input" },
      { usdPerSecond: 0.282, tier: "1080p", mode: "video-input", label: "1080p · Video input" },
    ],
    surcharges: [],
    source: PAGE,
  },
  notes: [
    "Output fps: not stated (the schema says frames = duration × fps, without the fps).",
    "Frame-count rule: not stated.",
    "Seed: the prompting guide says there is no seed, yet the response returns one; no seed request field.",
    "Audio is always generated; the guide says there is no parameter to turn it off.",
    "Crane down and rack focus: not stated in the guides' camera vocabulary (\"crane\" is not used; the documented wording is \"rises and tilts down\").",
    "No camera field: the schema has no camera parameter; the camera is prompt text or a reference video's camera path.",
    "Element `images` is called optional on the model page but required with frontalImage by its own rule.",
    "Resolution preset only with an input; without inputs, width and height are required (schema allOf).",
  ],
};
