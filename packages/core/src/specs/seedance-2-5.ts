/** Seedance 2.5, read from its Runware schema and guides on 10 Nov 2026. */
import { guide, limits, MB, modelPage, no, range, schemaUrl, yes } from "./helpers.ts";
import type { ModelSpec } from "./types.ts";

const SLUG = "bytedance-seedance-2-5";
const PAGE = modelPage(SLUG);
const SCHEMA = schemaUrl(SLUG);
const G = (p: string) => guide(SLUG, p);

const IMAGE = limits({ sidePx: range(300, 6000), maxBytesEach: 30 * MB, aspect: range(0.4, 2.5) });
const VIDEO = limits({ secondsEach: range(2, 30), secondsTotalMax: 30, sidePx: range(300, 6000), maxBytesEach: 200 * MB, aspect: range(0.4, 2.5) });
const AUDIO = limits({ secondsEach: range(2, 30), secondsTotalMax: 30, maxBytesEach: 15 * MB });

const sizes = (tier: string, pairs: [string, number, number][]) =>
  pairs.map(([ratio, width, height]) => ({ label: `${tier} (${ratio})`, width, height }));

export const SEEDANCE_2_5: ModelSpec = {
  id: "seedance-2.5",
  name: "Seedance 2.5",
  lab: "ByteDance",
  air: "bytedance:seedance@2.5",
  slug: SLUG,
  verifiedOn: "2026-11-10",
  sources: {
    model: PAGE,
    schema: SCHEMA,
    guides: [
      { title: "Prompting", url: G("prompting") },
      { title: "Image to video", url: G("image-to-video") },
      { title: "Motion control", url: G("motion-control") },
      { title: "Multi-reference production", url: G("multi-reference-production") },
      { title: "Editing", url: G("editing") },
      { title: "Long-form narrative", url: G("long-form-narrative") },
      { title: "Multilingual", url: G("multilingual") },
    ],
  },
  inputs: {
    firstFrame: yes("inputs.frameImages", 1, G("image-to-video"), IMAGE),
    lastFrame: yes("inputs.frameImages", 1, G("image-to-video"), IMAGE, "Only beside a first frame; a last frame alone is rejected."),
    keyframes: no(SCHEMA, "frameImages holds at most two items (first and last)."),
    referenceImages: yes("inputs.referenceImages", 30, SCHEMA, IMAGE, "The guide calls 1-8 the stable band."),
    referenceVideos: yes("inputs.referenceVideos", 10, SCHEMA, VIDEO, "The guide calls 1-5 the stable band, each about 5-10 s."),
    referenceAudios: yes("inputs.referenceAudios", 10, SCHEMA, AUDIO, "Audio can be used on its own."),
    sourceVideo: yes(
      "inputs.video",
      1,
      G("editing"),
      limits({ secondsEach: range(2, 30), sidePx: range(300, 6000), maxBytesEach: 200 * MB, aspect: range(0.4, 2.5) }),
      "Edit or extend; settings.operation picks, or the prompt decides.",
    ),
    audioToVideo: yes("inputs.referenceAudios", 10, PAGE, AUDIO, "Audio-to-video runs through reference audio; there is no separate driving-audio field."),
    elements: no(SCHEMA),
  },
  combinations: [
    {
      id: "frames-alone",
      text: "frameImages cannot be combined with reference images, reference videos or a source video.",
      when: ["firstFrame"],
      forbidsInputs: ["referenceImages", "referenceVideos", "sourceVideo"],
      source: G("image-to-video"),
    },
    {
      id: "last-needs-first",
      text: "A last frame needs a first frame.",
      when: ["lastFrame"],
      requiresOneOf: ["firstFrame"],
      source: G("image-to-video"),
    },
    {
      id: "edit-auto-duration",
      text: "An edit (settings.operation edit) takes duration auto; an integer is rejected. width/height are not allowed beside a source video.",
      when: ["sourceVideo"],
      forbidsParams: ["width", "height"],
      source: G("editing"),
    },
  ],
  output: {
    durations: { kind: "range", min: 4, max: 30, auto: true },
    defaultDuration: 5,
    resolutionField: "both",
    resolutions: ["480p", "720p", "1080p"],
    sizes: [
      ...sizes("480p", [["~16:9", 854, 480], ["~4:3", 752, 560], ["1:1", 640, 640], ["~3:4", 560, 752], ["~9:16", 480, 854], ["~21:9", 992, 432]]),
      ...sizes("720p", [["16:9", 1280, 720], ["4:3", 1112, 834], ["1:1", 960, 960], ["3:4", 834, 1112], ["9:16", 720, 1280], ["21:9", 1470, 630]]),
      ...sizes("1080p", [["16:9", 1920, 1080], ["4:3", 1664, 1248], ["1:1", 1440, 1440], ["3:4", 1248, 1664], ["9:16", 1080, 1920], ["~21:9", 2206, 946]]),
    ],
    fps: null,
    frameCountRule: null,
    audio: { generates: true, toggle: "settings.audio" },
    source: SCHEMA,
  },
  prompting: {
    minChars: 2,
    maxChars: 50000,
    addressing: {
      style: "at-mentions",
      tokens: [
        { input: "image", pattern: "@Image{n}" },
        { input: "video", pattern: "@Video{n}" },
        { input: "audio", pattern: "@Audio{n}" },
      ],
      numbering: "By array position, from one, counted separately per array; an edit source in inputs.video is @Video1.",
      source: G("multi-reference-production"),
    },
    rules: [
      { text: "Keep five concerns apart: shot, subject, action, light, audio.", source: G("prompting") },
      { text: "Open with the camera clause so motion goes to the camera, not idle subject animation.", source: G("prompting") },
      { text: "Give camera and subject separate clauses, with one main action arc per clip.", source: G("prompting") },
      { text: "Pace beats with time windows such as [0-3s].", source: G("prompting") },
      { text: "Bind each tag to a role, then use the role name; put audio and negatives at the end.", source: G("multi-reference-production") },
    ],
    seed: { supported: true, max: 2147483647, source: SCHEMA },
    negativePrompt: false,
  },
  camera: {
    kind: "prompt-only",
    vocabulary: [
      { term: "static / locked-off", source: G("prompting"), move: "static", phrase: "Static, locked-off camera." },
      { term: "dolly-in / push-in", source: G("prompting"), move: "push-in", phrase: "Slow dolly-in towards the subject." },
      { term: "dolly-out / pull-back", source: G("prompting"), move: "pull-out", phrase: "Slow dolly-out, pulling back to reveal the setting." },
      { term: "tracking shot", source: G("prompting"), move: "track-left", phrase: "Tracking shot moving left with the subject." },
      { term: "tracking shot", source: G("prompting"), move: "track-right", phrase: "Tracking shot moving right with the subject." },
      { term: "crane / boom", source: G("prompting"), move: "crane-up", phrase: "Crane up, rising above the subject." },
      { term: "crane / boom", source: G("prompting"), move: "crane-down", phrase: "Crane down, lowering towards the subject." },
      { term: "orbit / arc", source: G("prompting"), move: "orbit", phrase: "Slow orbit around the subject." },
      { term: "handheld", source: G("prompting"), move: "handheld", phrase: "Handheld camera with subtle organic shake." },
      { term: "dolly zoom / Vertigo", source: G("prompting") },
      { term: "one-shot, FPV, bullet time, speed ramp", source: G("prompting") },
    ],
  },
  pricing: {
    rates: [
      { usdPerSecond: 0.1025, tier: "480p", mode: "no-video-input", label: "Text/Image to Video · 480p" },
      { usdPerSecond: 0.2304, tier: "720p", mode: "no-video-input", label: "Text/Image to Video · 720p" },
      { usdPerSecond: 0.61354, tier: "1080p", mode: "no-video-input", label: "Text/Image to Video · 1080p" },
      { usdPerSecond: 0.1313, tier: "480p", mode: "video-input", label: "Video-to-Video · 480p" },
      { usdPerSecond: 0.2953, tier: "720p", mode: "video-input", label: "Video-to-Video · 720p" },
      { usdPerSecond: 0.73415, tier: "1080p", mode: "video-input", label: "Video-to-Video · 1080p" },
    ],
    surcharges: [],
    source: PAGE,
    note: "Which inputs bill at the Video-to-Video rate (a source video, reference videos, or both) is not stated.",
  },
  notes: [
    "Output fps: not stated. Frame-count rule: not stated.",
    "Rack focus: not stated in the guide's camera vocabulary.",
    "The prompting guide says there is no 1080p output; the schema and model page offer 1080p. The schema is followed.",
    "Prompt limit: the guide says 10,000 characters, the schema 50,000.",
    "Seed maximum is 2^31-1 while the text says random seeds use the unsigned 32-bit range.",
  ],
};
