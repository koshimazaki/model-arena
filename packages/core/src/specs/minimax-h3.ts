/** MiniMax H3, read from its Runware schema and guides on 10 Nov 2026. */
import { guide, limits, MB, modelPage, no, range, schemaUrl, yes } from "./helpers.ts";
import type { ModelSpec } from "./types.ts";

const SLUG = "minimax-h3";
const PAGE = modelPage(SLUG);
const SCHEMA = schemaUrl(SLUG);
const G = (p: string) => guide(SLUG, p);

const IMAGE = limits({ sidePx: range(256, 5760), maxBytesEach: 30 * MB, aspect: range(0.4, 2.5) });
const AUDIO = limits({ secondsEach: range(2, 15), secondsTotalMax: 15, maxBytesEach: 15 * MB });

export const MINIMAX_H3: ModelSpec = {
  id: "h3",
  name: "MiniMax H3",
  lab: "MiniMax",
  air: "minimax:h3@0",
  slug: SLUG,
  verifiedOn: "2026-11-10",
  sources: {
    model: PAGE,
    schema: SCHEMA,
    guides: [
      { title: "Generating video", url: G("generating-video") },
      { title: "Reference-driven consistency", url: G("reference-driven-consistency") },
      { title: "Motion, camera and performance", url: G("motion-camera-performance") },
      { title: "First and last frame", url: G("first-and-last-frame") },
      { title: "Editing video", url: G("editing-video") },
      { title: "Sound and voice", url: G("sound-and-voice") },
    ],
  },
  inputs: {
    firstFrame: yes("inputs.frameImages", 1, G("first-and-last-frame"), IMAGE),
    lastFrame: yes("inputs.frameImages", 1, G("first-and-last-frame"), IMAGE),
    keyframes: no(SCHEMA, "frameImages holds at most two items (first and last)."),
    referenceImages: yes("inputs.referenceImages", 9, SCHEMA, IMAGE, "The guide advises two well-described images over nine loose ones."),
    referenceVideos: yes(
      "inputs.referenceVideos",
      3,
      SCHEMA,
      limits({
        secondsEach: range(2, 15),
        secondsTotalMax: 15,
        sidePx: range(256, 5760),
        fps: range(23.976, 60),
        maxBytesEach: 50 * MB,
        aspect: range(0.4, 2.5),
      }),
      "Reference videos and reference audios share the 15 s total. Edits also go through this field.",
    ),
    referenceAudios: yes("inputs.referenceAudios", 3, SCHEMA, AUDIO, "Needs a reference image or video beside it."),
    sourceVideo: no(SCHEMA, "No inputs.video; the editing guide passes the clip to edit as a reference video."),
    audioToVideo: yes("inputs.referenceAudios", 3, SCHEMA, AUDIO, "Through reference audio, beside an image or video reference."),
    elements: no(SCHEMA),
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be used with reference images, videos or audios.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "referenceAudios"],
      source: PAGE,
    },
    {
      id: "audio-needs-visual",
      text: "Reference audio needs a reference image or a reference video beside it.",
      when: ["referenceAudios"],
      requiresOneOf: ["referenceImages", "referenceVideos"],
      source: PAGE,
    },
    {
      id: "reference-cap",
      text: "Reference images, videos and audios share a cap of twelve files and 64 MB.",
      when: [],
      sharedMax: { inputs: ["referenceImages", "referenceVideos", "referenceAudios"], max: 12 },
      source: SCHEMA,
    },
  ],
  output: {
    durations: { kind: "range", min: 4, max: 15, auto: false },
    defaultDuration: 5,
    resolutionField: "both",
    resolutions: ["768p", "1440p"],
    sizes: [
      { label: "768p (~16:9)", width: 1344, height: 768 },
      { label: "768p (4:3)", width: 1024, height: 768 },
      { label: "768p (1:1)", width: 768, height: 768 },
      { label: "768p (3:4)", width: 768, height: 1024 },
      { label: "768p (~9:16)", width: 768, height: 1344 },
      { label: "768p (~21:9)", width: 1536, height: 672 },
      { label: "1440p (16:9)", width: 2560, height: 1440 },
      { label: "1440p (4:3)", width: 1920, height: 1440 },
      { label: "1440p (1:1)", width: 1440, height: 1440 },
      { label: "1440p (3:4)", width: 1440, height: 1920 },
      { label: "1440p (9:16)", width: 1440, height: 2560 },
      { label: "1440p (~21:9)", width: 2944, height: 1248 },
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: true, toggle: null },
    source: SCHEMA,
  },
  prompting: {
    minChars: 2,
    maxChars: 7000,
    addressing: {
      style: "plain-words",
      tokens: [
        { input: "image", pattern: "Image {n}" },
        { input: "video", pattern: "Video {n}" },
      ],
      numbering:
        "Plain words by array position, from one; images and videos each start at one. How to name a reference audio is not stated (examples say \"the reference audio\").",
      source: G("reference-driven-consistency"),
    },
    rules: [
      { text: "Give each reference a role by its number and say which features to keep.", source: G("reference-driven-consistency") },
      { text: "For motion transfer, name the reference and describe the subject, not the move.", source: G("motion-camera-performance") },
      { text: "Write like a cinematographer: camera move, lens, light, pace.", source: G("generating-video") },
      { text: "Describe the picture first, then close with a Sound: clause tied to moments with as, when, then.", source: G("sound-and-voice") },
      { text: "With anchor frames, prompt only the motion and the sound.", source: G("first-and-last-frame") },
    ],
    seed: { supported: true, max: 4294967295, source: SCHEMA },
    negativePrompt: false,
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "locked tripod", source: PAGE, move: "static", phrase: "Locked tripod; the camera does not move." },
      { term: "push-in", source: G("generating-video"), move: "push-in", phrase: "Slow cinematic push-in on the subject." },
      { term: "tracking shot", source: G("generating-video"), move: "track-left", phrase: "Slow tracking shot moving left alongside the subject." },
      { term: "tracking shot", source: G("generating-video"), move: "track-right", phrase: "Slow tracking shot moving right alongside the subject." },
      { term: "orbit", source: G("motion-camera-performance"), move: "orbit", phrase: "Smooth cinematic orbit around the subject." },
      { term: "handheld drift", source: G("first-and-last-frame"), move: "handheld", phrase: "Gentle handheld drift." },
      { term: "low-angle dolly-in", source: G("generating-video") },
      { term: "pan", source: G("sound-and-voice") },
      { term: "lens focal length (85mm, 50mm)", source: G("sound-and-voice") },
    ],
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.08, tier: "768p", mode: "any", label: "768p" },
      { usdPerSecond: 0.13, tier: "1440p", mode: "any", label: "2K" },
    ],
    surcharges: [
      { label: "uploaded video", usd: 0.13, per: "input-video-second" },
      { label: "each image beyond the first five", usd: 0.04, per: "image-beyond-five" },
    ],
    source: PAGE,
  },
  notes: [
    "Output fps: not stated. Frame-count rule: not stated.",
    "Pricing labels the higher rate \"2K\"; the resolution enum says 1440p. That 2K means 1440p is not stated.",
    "Pull-out, crane and rack focus: not stated in the guides' camera vocabulary.",
    "Audio is always generated; there is no audio switch. settings.promptExpansion rewrites prompts and affects reproducibility.",
    "Guides say 2K only and 5-15 s; the schema adds 768p and a 4 s minimum. The schema is followed.",
    "Prompt limit: the guide says 2,000 characters, the schema 7000.",
    "The model description claims continuation; there is no extension field or guide.",
  ],
};
