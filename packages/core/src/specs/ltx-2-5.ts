/**
 * LTX-2.5 Pro and Fast, read from their Runware schemas and the Pro guides on
 * 10 Nov 2026. Fast has no guides; the Pro prompting guide says Fast shares
 * its prompt structure.
 *
 * Frame counts: the open-weights LTX models want 8k+1 frames and sizes on a
 * fixed multiple. The Runware API exposes neither rule: it accepts only fixed
 * durations, fixed fps values and fixed width/height pairs, and the docs never
 * mention a frame-count or divisibility rule. Whatever padding the server does
 * is hidden; recorded in `notes` and docs/friction.md.
 */
import { guide, limits, modelPage, no, range, schemaUrl, yes } from "./helpers.ts";
import type { ModelSpec } from "./types.ts";

const PRO = "lightricks-ltx-2-5-pro";
const FAST = "lightricks-ltx-2-5-fast";
const G = (p: string) => guide(PRO, p);

const sizes = [
  { label: "720p (16:9)", width: 1280, height: 720 },
  { label: "720p (9:16)", width: 720, height: 1280 },
  { label: "1080p (16:9)", width: 1920, height: 1080 },
  { label: "1080p (9:16)", width: 1080, height: 1920 },
];

const FRAME_NOTE =
  "No 8k+1 frame rule and no divisibility rule in the API or docs: durations, fps and width/height are fixed lists, so any frame padding is hidden server-side.";

function ltx(slug: string, audioMax: number): ModelSpec {
  const page = modelPage(slug);
  const schema = schemaUrl(slug);
  return {
    id: "ltx-2.5",
    name: "LTX-2.5 Pro",
    lab: "Lightricks",
    air: "lightricks:ltx@2.5-pro",
    slug,
    verifiedOn: "2026-11-10",
    sources: {
      model: page,
      schema,
      guides: [
        { title: "Prompting", url: G("prompting") },
        { title: "Camera movement", url: G("camera-movement") },
        { title: "First and last frame", url: G("first-and-last-frame") },
        { title: "Audio-driven", url: G("audio-driven") },
        { title: "Native audio", url: G("native-audio") },
        { title: "Multi-shot", url: G("multi-shot") },
      ],
    },
    inputs: {
      firstFrame: yes("inputs.frameImages", 1, G("first-and-last-frame")),
      lastFrame: yes("inputs.frameImages", 1, G("first-and-last-frame")),
      keyframes: no(schema, "frameImages holds at most two items (first and last)."),
      referenceImages: yes("inputs.referenceImages", 1, schema, null, "Only in audio-driven mode, exactly one."),
      referenceVideos: no(schema),
      referenceAudios: no(schema),
      sourceVideo: no(schema, "Capabilities list Edit/Extend on Pro, but the schema has no source-video field."),
      audioToVideo: yes("inputs.audio", 1, G("audio-driven"), limits({ secondsEach: range(2, audioMax) }), "The clip runs as long as the audio."),
      elements: no(schema),
    },
    combinations: [
      {
        id: "audio-mode",
        text: "With audio: no frameImages, no duration, no cameraMovement; exactly one reference image; size 1920×1080 or 1080×1920.",
        when: ["audioToVideo"],
        forbidsInputs: ["firstFrame", "lastFrame"],
        forbidsParams: ["duration", "settings.cameraMovement"],
        requiresExactly: { input: "referenceImages", count: 1 },
        source: page,
      },
      {
        id: "reference-needs-audio",
        text: "A reference image is accepted only beside audio.",
        when: ["referenceImages"],
        requiresOneOf: ["audioToVideo"],
        source: schema,
      },
    ],
    output: {
      durations: { kind: "list", values: [6, 8, 10], auto: true },
      defaultDuration: 6,
      resolutionField: "width-height",
      resolutions: ["720p", "1080p"],
      sizes,
      fps: [24, 25, 50],
      frameCountRule: null,
      audio: { generates: true, toggle: "settings.audio" },
      source: schema,
    },
    prompting: {
      minChars: 2,
      maxChars: 5000,
      addressing: {
        style: "none",
        tokens: [],
        numbering: "Inputs are not named in the prompt: the image sets the look and the prompt says what happens; with audio, describe the performance, not the words.",
        source: G("first-and-last-frame"),
      },
      rules: [
        { text: "Cover six layers: shot, scene, action, character, camera, audio.", source: G("prompting") },
        { text: "Write one flowing paragraph in the present tense, not a list.", source: G("prompting") },
        { text: "Keep camera and subject motion in separate clauses, with one main action arc.", source: G("prompting") },
        { text: "With a cameraMovement preset set, leave the move out of the prompt.", source: G("camera-movement") },
        { text: "The tighter the shot, the more concrete the nouns.", source: G("prompting") },
      ],
      seed: { supported: false, max: null, source: page },
      negativePrompt: false,
    },
    camera: {
      kind: "parameter",
      field: "settings.cameraMovement",
      values: [
        { value: "static", meaning: "Fixed camera with no movement.", move: "static" },
        { value: "dolly_in", meaning: "Camera moves toward the subject.", move: "push-in" },
        { value: "dolly_out", meaning: "Camera moves away from the subject.", move: "pull-out" },
        { value: "dolly_left", meaning: "Camera tracks to the left.", move: "track-left" },
        { value: "dolly_right", meaning: "Camera tracks to the right.", move: "track-right" },
        { value: "jib_up", meaning: "Camera rises on a jib.", move: "crane-up" },
        { value: "jib_down", meaning: "Camera lowers on a jib.", move: "crane-down" },
        { value: "focus_shift", meaning: "Focus racks between subjects.", move: "rack-focus" },
      ],
      forbiddenWith: ["audioToVideo"],
      vocabulary: [
        { term: "orbit", source: G("camera-movement"), move: "orbit", phrase: "The camera orbits slowly around the subject and ends facing it." },
        { term: "handheld", source: G("camera-movement"), move: "handheld", phrase: "Handheld camera, following the subject closely." },
        { term: "push in, pull back, track, tilt, pan, over-the-shoulder, crane", source: G("camera-movement") },
        { term: "say where a described move ends", source: G("camera-movement") },
      ],
      source: schema,
    },
    pricing: {
      rates: [
        { usdPerSecond: 0.12, tier: "720p", mode: "any", label: "720p" },
        { usdPerSecond: 0.17, tier: "1080p", mode: "any", label: "1080p" },
      ],
      surcharges: [],
      source: page,
    },
    notes: [
      FRAME_NOTE,
      "Frame count = duration × fps (e.g. 6 s at 24 fps is 144 frames, not 8k+1).",
      "Seed: no request field; the response returns one.",
      "settings.audio has no stated default.",
      "Audio input: the schema says 2-10 s on Pro; the audio-driven guide says 2 to 20 s.",
      "The model description says up to 4K; the Pro schema allows 1080p at most.",
    ],
  };
}

export const LTX_2_5_PRO: ModelSpec = ltx(PRO, 10);

const fast = ltx(FAST, 20);
export const LTX_2_5_FAST: ModelSpec = {
  ...fast,
  id: "ltx-2.5-fast",
  name: "LTX-2.5 Fast",
  air: "lightricks:ltx@2.5-fast",
  inputs: { ...fast.inputs, sourceVideo: no(fast.sources.schema) },
  combinations: [
    ...fast.combinations,
    {
      id: "long-clip-size",
      text: "Clips over 10 s: no 48/50 fps, no explicit width/height and no 2K/4K (the default 1920×1080 applies).",
      when: [],
      source: fast.sources.schema,
    },
  ],
  output: {
    ...fast.output,
    durations: { kind: "list", values: [6, 8, 10, 12, 14, 16, 18, 20], auto: true },
    resolutions: ["720p", "1080p", "2K", "4K"],
    sizes: [
      ...sizes,
      { label: "2K (16:9)", width: 2560, height: 1440 },
      { label: "2K (9:16)", width: 1440, height: 2560 },
      { label: "4K (16:9)", width: 3840, height: 2160 },
      { label: "4K (9:16)", width: 2160, height: 3840 },
    ],
    fps: [24, 25, 48, 50],
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.09, tier: "720p", mode: "any", label: "720p" },
      { usdPerSecond: 0.13, tier: "1080p", mode: "any", label: "1080p" },
      { usdPerSecond: 0.19, tier: "2K", mode: "any", label: "2K" },
      { usdPerSecond: 0.3, tier: "4K", mode: "any", label: "4K" },
    ],
    surcharges: [],
    source: fast.sources.model,
  },
  notes: [
    FRAME_NOTE,
    "No Fast guides: prompting and camera rules are from the LTX-2.5 Pro guides, which say Fast shares the prompt structure.",
    "When width or height is sent, or fps is 48/50, duration must be at most 10 s; the page's own 12 s example at 1280×720 breaks this.",
    "Seed: no request field; the response returns one.",
    "settings.audio has no stated default.",
  ],
};
