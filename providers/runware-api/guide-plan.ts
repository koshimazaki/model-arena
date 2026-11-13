/**
 * One guide lane from a bundle: the neutral shot (subject, environment,
 * action, legend) becomes this model's prompt through the composer, the
 * composer's chosen inputs become the lane request, and `planTask` builds the
 * exact task. The `<arena-generate>` element and `npm run lane -- --bundle`
 * both call `planGuideLane`, so for the same files they send the same task.
 * Pure: no network, no DOM.
 */
import { composeFor, type ComposedPrompt, type ShotDescription, type ShotReference } from "../../packages/core/src/compose.ts";
import { composedMarker } from "../../packages/core/src/shot.ts";
import { findSpec } from "../../packages/core/src/specs/index.ts";
import type { ModelSpec } from "../../packages/core/src/specs/types.ts";
import type { LaneMedia, LanePlan, LaneRequest } from "../types.ts";
import type { GuideShot, LoadedGuide } from "./guide-bundle.ts";
import { PlanError, planTask } from "./task.ts";

/** How a model uses the guide: the whole clip, or only its audio and first frame. */
export type GuideUse = "guide-video" | "audio-first-frame";

export interface GuideModel {
  key: string;
  name: string;
  use: GuideUse;
  /** One line: what the model takes from the guide, built from the spec database. */
  line: string;
  /** The model's prompting guide, from the spec's sources. */
  guide: { title: string; url: string };
}

/** The models the generate flow offers, in order. FLUX 3 Video is left out (keyframes only). */
export const GUIDE_MODEL_KEYS = ["kling-4", "seedance-2.5", "h3", "ltx-2.5"] as const;
/** The three that take the guide video, for "Compare prompts". */
export const COMPARE_MODEL_KEYS = ["kling-4", "seedance-2.5", "h3"] as const;

/**
 * Seconds that reference videos and reference audios share, where the schema
 * caps their sum: MiniMax H3 x-constraints `duration` over
 * inputs.referenceVideos + inputs.referenceAudios, maximum 15, no per-item scope.
 */
const SHARED_SECONDS: Record<string, number> = { h3: 15 };

const span = (r: { min: number | null; max: number | null } | null | undefined, unit: string) =>
  r && (r.min !== null || r.max !== null) ? `${r.min ?? 0}-${r.max ?? "any"} ${unit}` : null;

/** What the model takes from the guide, in one line, from its spec. */
export function guideLine(spec: ModelSpec, use: GuideUse): string {
  if (use === "audio-first-frame") {
    const audio = span(spec.inputs.audioToVideo.limits?.secondsEach, "s");
    return `Audio + first frame only: does not use the guide video. Takes the guide's audio${audio ? ` (${audio})` : ""} and one image, frame 0 or your character sheet; the clip runs as long as the audio.`;
  }
  const v = spec.inputs.referenceVideos.limits;
  const facts = [span(v?.secondsEach, "s"), v?.sidePx?.min ? `${v.sidePx.min}+ px a side` : null, span(v?.fps, "fps")].filter(Boolean).join(", ");
  const audio = spec.inputs.referenceAudios.supported ? "the audio as reference audio" : "no audio input";
  const image = spec.inputs.referenceImages.supported ? "; a character sheet as a reference image" : "";
  return `The whole guide clip as a reference video (${facts}); ${audio}${image}.`;
}

function promptingGuide(spec: ModelSpec) {
  const g = spec.sources.guides;
  return g.find((x) => /prompt/i.test(x.title)) ?? g[0] ?? { title: "Model page", url: spec.sources.model };
}

export function guideModel(key: string): GuideModel {
  if (!(GUIDE_MODEL_KEYS as readonly string[]).includes(key))
    throw new PlanError(`The generate flow offers ${GUIDE_MODEL_KEYS.join(", ")}; "${key}" is not one of them.`);
  const spec = findSpec(key);
  const use: GuideUse = spec.inputs.referenceVideos.supported ? "guide-video" : "audio-first-frame";
  return { key, name: spec.name, use, line: guideLine(spec, use), guide: promptingGuide(spec) };
}

export const guideModels = () => GUIDE_MODEL_KEYS.map(guideModel);

/** What the planner needs to know about the inputs, without their bytes. */
export interface GuideFacts {
  seconds: number;
  hasAudio: boolean;
  hasCharacter: boolean;
}

/** The composer's shot for one model: the guide's references, placed for how that model uses the guide. */
export function shotFor(g: GuideShot, model: string, facts: GuideFacts): { shot: ShotDescription; notes: string[] } {
  const m = guideModel(model);
  const notes: string[] = [];
  const refs: ShotReference[] = [];
  if (m.use === "guide-video") {
    refs.push({ id: "guide", kind: "video", role: "motion" });
    if (facts.hasCharacter) refs.push({ id: "character", kind: "image", role: "character", replaces: "the figure in the guide" });
    const shared = SHARED_SECONDS[m.key];
    if (facts.hasAudio && shared !== undefined && facts.seconds * 2 > shared)
      notes.push(`${m.name}: reference video and audio share ${shared} s; the ${facts.seconds} s guide leaves no room for its audio, so the audio is not sent.`);
    else if (facts.hasAudio) refs.push({ id: "audio", kind: "audio", role: "soundtrack" });
  } else {
    refs.push({ id: facts.hasCharacter ? "character" : "frame0", kind: "image", role: "first-frame" });
    if (facts.hasAudio) refs.push({ id: "audio", kind: "audio", role: "soundtrack" });
  }
  const shot: ShotDescription = {
    subject: g.subject,
    action: g.action,
    ...(g.environment ? { environment: g.environment } : {}),
    ...(g.legend ? { legend: g.legend } : {}),
    camera: g.camera ?? "static",
    references: refs,
    duration: Math.max(1, Math.round(facts.seconds)),
  };
  return { shot, notes };
}

/** The composed prompt the model would get, for the preview before Run. */
export function previewPrompt(g: GuideShot, model: string, facts: GuideFacts): { model: GuideModel; composed: ComposedPrompt; shot: ShotDescription; notes: string[] } {
  const m = guideModel(model);
  const { shot, notes } = shotFor(g, model, facts);
  // LTX audio mode forbids the camera parameter; keep the audio and write the move in words.
  const composed = composeFor(model, shot, m.use === "audio-first-frame" ? { prefer: "inputs" } : {});
  return { model: m, composed, shot, notes };
}

/** The same shot composed for each model, side by side. */
export const comparePrompts = (g: GuideShot, facts: GuideFacts, models: readonly string[] = COMPARE_MODEL_KEYS) =>
  models.map((k) => previewPrompt(g, k, facts));

export interface GuideLaneInput {
  guide: LoadedGuide;
  model: string;
  /** The neutral shot; defaults to the guide's recipe.json `shot`. */
  shot?: GuideShot;
  /** Free text that replaces the composed prompt. */
  prompt?: string;
  character?: LaneMedia;
  resolution?: string;
}

export interface GuideLanePlan {
  plan: LanePlan;
  request: LaneRequest;
  composed: ComposedPrompt;
  shot: ShotDescription;
  /** The record marker for a composed prompt; absent when free text replaced it. */
  marker?: ReturnType<typeof composedMarker>;
  model: GuideModel;
  notes: string[];
}

export function planGuideLane(input: GuideLaneInput, taskUUID?: string): GuideLanePlan {
  const { guide, character } = input;
  const override = input.prompt?.trim() || undefined;
  const g = input.shot ?? guide.shot ?? (override ? { subject: override, action: "" } : undefined);
  if (!g || !g.subject.trim()) throw new PlanError("Describe the shot (subject and action), or write a prompt.");
  const facts: GuideFacts = { seconds: guide.seconds, hasAudio: Boolean(guide.audio), hasCharacter: Boolean(character) };
  const { model, composed, shot, notes } = previewPrompt(g, input.model, facts);
  if (model.use === "audio-first-frame" && !guide.audio)
    throw new PlanError(`${model.name} is driven by the guide's audio, and this bundle has no audio file.`);

  const mediaFor: Record<string, LaneMedia | undefined> = { guide: guide.video, audio: guide.audio, character, frame0: guide.firstFrame };
  const req: LaneRequest = { model: model.key, prompt: override ?? composed.prompt };
  for (const u of composed.used) {
    const m = mediaFor[u.ref];
    if (!m) continue;
    if (u.role === "motion") req.guideVideo = m;
    else if (u.role === "soundtrack") req.audio = m;
    else if (u.role === "character") req.character = m;
    else if (u.role === "first-frame") {
      req.firstFrame = m;
      req.firstFrameVariant = u.ref === "character" ? "B" : "A";
    }
  }
  if (typeof composed.params.duration === "number") req.duration = composed.params.duration;
  const cam = composed.params["settings.cameraMovement"];
  if (typeof cam === "string") req.camera = cam;
  if (input.resolution) req.resolution = input.resolution;

  const plan = planTask(req, taskUUID);
  return {
    plan,
    request: req,
    composed,
    shot,
    ...(override ? {} : { marker: composedMarker(composed) }),
    model,
    notes: [...notes, ...composed.notes, ...plan.notes],
  };
}
