/**
 * Writes the blog demo records in examples/records/blog/ from neutral shot
 * descriptions through the prompt composer, so every lane's prompt, inputs and
 * camera parameter are what the composer would send. Nothing is generated:
 * every lane points at a labelled placeholder clip (scripts/make-placeholder-clips.sh)
 * and its cost and seconds stay null until a real, approved run replaces it.
 *
 *   npx tsx scripts/build-demo-records.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compose, type ComposedPrompt, type ShotDescription } from "../packages/core/src/compose.ts";
import type { ArenaRecord, InputSent, Lane } from "../packages/core/src/record.ts";
import { findSpec } from "../packages/core/src/specs/index.ts";
import type { InputKind } from "../packages/core/src/specs/types.ts";

const OUT = join(import.meta.dirname, "../examples/records/blog");
const MEDIA = "../../media/placeholder";
const ARENA_MODELS = ["kling-4", "seedance-2.5", "h3", "ltx-2.5", "flux-3-video", "kling-4-flash"];
const GUIDANCE_MODELS = ["kling-4", "seedance-2.5", "h3", "ltx-2.5", "flux-3-video"];

const INPUT_SRC: Record<string, string> = {
  still: `${MEDIA}/inputs/first-frame.png`,
  character: `${MEDIA}/inputs/character.png`,
  product: `${MEDIA}/inputs/product.png`,
  guide: `${MEDIA}/guide.mp4`,
  beat: `${MEDIA}/inputs/beat.wav`,
};

const ROLE: Record<InputKind, InputSent["role"]> = {
  firstFrame: "frameImage",
  lastFrame: "frameImage",
  keyframes: "frameImage",
  referenceImages: "referenceImage",
  referenceVideos: "referenceVideo",
  referenceAudios: "referenceAudio",
  audioToVideo: "audio",
  sourceVideo: "video",
  elements: "referenceImage",
};

function lane(test: string, c: ComposedPrompt): Lane {
  const spec = findSpec(c.model);
  const inputsSent: InputSent[] = c.used.map((u) => ({
    role: ROLE[u.input],
    src: INPUT_SRC[u.ref]!,
    label: `${u.ref}${u.address ? ` (${u.address})` : ""}${u.convertedFrom ? `, sent as a reference image` : ""}`,
    ...(u.input === "firstFrame" ? { frame: "first" } : u.input === "lastFrame" ? { frame: "last" } : {}),
  }));
  const still = c.used.find((u) => u.ref === "still");
  const camera = c.params["settings.cameraMovement"];
  const notes = [...c.dropped.map((d) => `Not sent: ${d.ref} (${d.reason})`), ...c.notes];
  return {
    id: c.model.replace(/\./g, "-"),
    label: c.name,
    provider: "runware-api",
    model: spec.air,
    modelName: c.name,
    modelRan: null,
    prompt: c.prompt,
    inputsSent,
    firstFrameVariant: still ? "A" : "C",
    output: { src: `${MEDIA}/${test}-${c.model}.mp4`, contentType: "video/mp4" },
    costUsd: null,
    generationSeconds: null,
    durationSeconds: c.duration.sent,
    settings: {
      taskType: "videoInference",
      model: spec.air,
      ...(typeof c.params.duration === "number" ? { duration: c.params.duration } : {}),
      ...(camera ? { settings: { cameraMovement: camera } } : {}),
    },
    status: "placeholder",
    note: `Placeholder clip; nothing has run. ${notes.join(" ")}`.trim().slice(0, 2000),
  };
}

function record(id: string, title: string, shot: ShotDescription, models: string[], observations: string[]): ArenaRecord {
  return {
    schemaVersion: 1,
    id,
    title,
    createdAt: "2026-11-10T15:00:00Z",
    guide: {
      schemaVersion: 1,
      id: "mannequin-beat-guide",
      title: "Beat-synced mannequin, Motion Studio",
      video: { src: INPUT_SRC.guide!, contentType: "video/mp4", width: 640, height: 360, fps: 24, seconds: 8 },
      audio: { src: INPUT_SRC.beat!, contentType: "audio/wav", seconds: 8 },
      firstFrame: { src: INPUT_SRC.still!, contentType: "image/png", width: 640, height: 360 },
      beats: [0, 2, 4, 6, 8],
    },
    lanes: compose(shot, models).map((c) => lane(id.replace(/^blog-/, ""), c)),
    observations,
  };
}

const PLACEHOLDER = "Placeholder clips: no model has run. Prompts, inputs and camera parameters are the composer's real output.";

const records: ArenaRecord[] = [
  record(
    "blog-camera",
    "Camera: one move, six models",
    {
      subject: "A matte white ceramic speaker on a concrete plinth in a dim studio",
      action: "stands still while a soft key light sweeps across it",
      focus: "the speaker",
      camera: "push-in",
      duration: 8,
      references: [{ id: "product", kind: "image", role: "product" }],
      audio: "a low room tone and a soft mechanical hum",
    },
    ARENA_MODELS,
    [PLACEHOLDER],
  ),
  record(
    "blog-audio-sync",
    "Audio sync: motion on the beat",
    {
      subject: "A wooden mannequin in a grey studio",
      action: "dances on the beat, a step on every kick",
      focus: "the mannequin",
      camera: "static",
      duration: 8,
      references: [
        { id: "still", kind: "image", role: "first-frame" },
        { id: "guide", kind: "video", role: "motion" },
        { id: "beat", kind: "audio", role: "soundtrack" },
      ],
      audio: "a dry four-on-the-floor kick at 120 bpm",
    },
    ARENA_MODELS,
    [PLACEHOLDER],
  ),
  record(
    "blog-character",
    "Character: the guide's motion on a new character",
    {
      subject: "A dancer in a yellow raincoat in a grey studio",
      action: "performs the guide's dance",
      focus: "the dancer",
      camera: "track-right",
      duration: 8,
      references: [
        { id: "character", kind: "image", role: "character", replaces: "the mannequin" },
        { id: "guide", kind: "video", role: "motion" },
      ],
    },
    ARENA_MODELS,
    [PLACEHOLDER],
  ),
  record(
    "blog-guidance",
    "Audio-reactive motion transfer",
    {
      subject: "A dancer in a yellow raincoat in a grey studio",
      action: "dances on the beat, a step on every kick",
      focus: "the dancer",
      camera: "push-in",
      duration: 8,
      references: [
        { id: "still", kind: "image", role: "first-frame" },
        { id: "character", kind: "image", role: "character", replaces: "the mannequin" },
        { id: "guide", kind: "video", role: "motion" },
        { id: "beat", kind: "audio", role: "soundtrack" },
      ],
      audio: "a dry four-on-the-floor kick at 120 bpm",
    },
    GUIDANCE_MODELS,
    [PLACEHOLDER],
  ),
];

mkdirSync(OUT, { recursive: true });
for (const r of records) writeFileSync(join(OUT, `${r.id.replace(/^blog-/, "")}.json`), `${JSON.stringify(r, null, 2)}\n`);
const set = {
  schemaVersion: 1,
  id: "blog-tests",
  title: "Three tests",
  tabs: [
    { id: "camera", label: "Camera", src: "camera.json" },
    { id: "audio-sync", label: "Audio sync", src: "audio-sync.json" },
    { id: "character", label: "Character", src: "character.json" },
  ],
};
writeFileSync(join(OUT, "set.json"), `${JSON.stringify(set, null, 2)}\n`);
console.log(`wrote ${records.length} records and set.json to ${OUT}`);
