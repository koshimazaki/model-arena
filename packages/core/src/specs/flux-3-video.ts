/** FLUX 3 Video, read from its Runware schema and guides on 10 Nov 2026. */
import { guide, limits, MB, modelPage, no, range, schemaUrl, yes } from "./helpers.ts";
import type { ModelSpec } from "./types.ts";

const SLUG = "bfl-flux-3-video";
const PAGE = modelPage(SLUG);
const SCHEMA = schemaUrl(SLUG);
const G = (p: string) => guide(SLUG, p);

const sz = (label: string, width: number, height: number) => ({ label, width, height });

export const FLUX_3_VIDEO: ModelSpec = {
  id: "flux-3-video",
  name: "FLUX 3 Video",
  lab: "Black Forest Labs",
  air: "bfl:flux@3-video",
  slug: SLUG,
  verifiedOn: "2026-11-10",
  sources: {
    model: PAGE,
    schema: SCHEMA,
    guides: [
      { title: "Prompting", url: G("prompting") },
      { title: "Keyframes", url: G("keyframes") },
      { title: "Multi-shot sequences", url: G("multi-shot-sequences") },
      { title: "Audio and speech", url: G("audio-and-speech") },
      { title: "Video continuation", url: G("video-continuation") },
    ],
  },
  inputs: {
    firstFrame: yes("inputs.frameImages", 1, G("keyframes")),
    lastFrame: yes("inputs.frameImages", 1, G("keyframes")),
    keyframes: yes("inputs.frameImages", 10, PAGE, null, "Placed by frame index (24 fps), timestamp, or first/last; unplaced images are spread evenly. Guidance, not a pixel-exact pin."),
    referenceImages: no(SCHEMA),
    referenceVideos: no(SCHEMA),
    referenceAudios: no(SCHEMA),
    sourceVideo: yes("inputs.video", 1, G("video-continuation"), limits({ secondsEach: range(null, 15), maxBytesEach: 50 * MB }), "Extension only: the clip is continued, not used as a motion reference."),
    audioToVideo: no(SCHEMA, "No audio input; speech is a quoted line with a visible speaker."),
    elements: no(SCHEMA),
  },
  combinations: [
    {
      id: "frames-or-video",
      text: "frameImages cannot be combined with a source video.",
      when: ["sourceVideo"],
      forbidsInputs: ["firstFrame", "lastFrame", "keyframes"],
      source: SCHEMA,
    },
    {
      id: "keyframes-need-duration",
      text: "Three or more unplaced frame images need a numeric duration; with any image or video input, safetyTolerance is at most 2.",
      when: ["keyframes"],
      forbidsParams: ["duration:auto"],
      source: PAGE,
    },
  ],
  output: {
    durations: { kind: "range", min: 5, max: 20, auto: true },
    defaultDuration: "auto",
    resolutionField: "both",
    resolutions: ["720p", "1080p"],
    sizes: [
      sz("720p (~21:9)", 1440, 608),
      sz("720p (2:1)", 1344, 672),
      sz("720p (~16:9)", 1280, 704),
      sz("720p (~4:3)", 1088, 800),
      sz("720p (1:1)", 960, 960),
      sz("720p (~3:4)", 800, 1088),
      sz("720p (~9:16)", 704, 1280),
      sz("1080p (~21:9)", 2176, 928),
      sz("1080p (~2:1)", 2016, 1024),
      sz("1080p (~16:9)", 1920, 1088),
      sz("1080p (~4:3)", 1632, 1216),
      sz("1080p (1:1)", 1440, 1440),
      sz("1080p (~3:4)", 1216, 1632),
      sz("1080p (~9:16)", 1088, 1920),
    ],
    fps: [24],
    frameCountRule: "duration × 24 frames; numeric keyframe indices count real frames at 24 fps (keyframes guide).",
    audio: { generates: true, toggle: "settings.audio" },
    source: SCHEMA,
  },
  prompting: {
    minChars: null,
    maxChars: null,
    addressing: {
      style: "plain-words",
      tokens: [],
      numbering: "Frames are named by position in words: \"use this image as the first frame\" (or \"as the last frame\"); a continuation opens with \"continue the reference video from its final frames\".",
      source: G("keyframes"),
    },
    rules: [
      { text: "Write plain declarative prose, as to a colleague; keyword lists do worse.", source: G("prompting") },
      { text: "Name five to ten beats rather than piling on adjectives; keep to a few hundred words.", source: G("prompting") },
      { text: "Give each beat about five to seven seconds, and pin the duration once the beats are known.", source: G("prompting") },
      { text: "Always give a camera direction; without one the camera drifts.", source: G("prompting") },
      { text: "Name each audio layer in order of prominence; add \"no on-screen text\" whenever speech is quoted.", source: G("audio-and-speech") },
    ],
    seed: { supported: false, max: null, source: PAGE },
    negativePrompt: false,
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "camera locked", source: G("prompting"), move: "static", phrase: "The camera holds locked at eye level." },
      { term: "camera pushes slowly forward", source: G("prompting"), move: "push-in", phrase: "The camera pushes slowly forward from wide to close." },
      { term: "camera pulls slowly back", source: G("prompting"), move: "pull-out", phrase: "The camera pulls slowly back from close to wide, revealing the setting." },
      { term: "tracking shot alongside the subject", source: G("prompting"), move: "track-left", phrase: "Tracking shot moving left alongside the subject." },
      { term: "tracking shot alongside the subject", source: G("prompting"), move: "track-right", phrase: "Tracking shot moving right alongside the subject." },
      { term: "camera orbits smoothly", source: G("prompting"), move: "orbit", phrase: "The camera orbits smoothly around the subject, keeping it centred." },
      { term: "handheld tracking shot", source: G("prompting"), move: "handheld", phrase: "Handheld camera following the subject." },
      { term: "pan / tilt", source: G("prompting") },
      { term: "lens: 24mm / 35mm / 70mm / anamorphic", source: G("prompting") },
      { term: "one continuous unbroken shot", source: G("multi-shot-sequences") },
    ],
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.04, tier: "720p", mode: "draft", label: "T2V & I2V. Draft · 720p" },
      { usdPerSecond: 0.06, tier: "720p", mode: "draft-video-input", label: "V2V · Draft · 720p" },
      { usdPerSecond: 0.17, tier: "720p", mode: "no-video-input", label: "T2V & I2V. 720p" },
      { usdPerSecond: 0.29, tier: "1080p", mode: "no-video-input", label: "T2V & I2V · 1080p" },
      { usdPerSecond: 0.43, tier: "720p", mode: "video-input", label: "V2V · 720p" },
      { usdPerSecond: 0.54, tier: "1080p", mode: "video-input", label: "V2V · 1080p" },
    ],
    surcharges: [],
    source: PAGE,
  },
  notes: [
    "fps: no fps field; the keyframes guide states 24 fps.",
    "Crane and rack focus: not stated in the guides' camera vocabulary.",
    "Seed: no request field; the response returns one.",
    "The frame field lists only first/last as allowed values, yet the guides use numeric indices; the guide's index 240 on a 10 s clip is one past the last frame.",
    "Prompt length: not stated in the schema or on the model page (no minLength or maxLength); the guides say 10,000 characters.",
    "Draft mode applies to text-to-video only.",
  ],
};
