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
import { sharedSeconds } from "../../packages/core/src/fit.ts";
import { findModel } from "./models.ts";
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


const span = (r: { min: number | null; max: number | null } | null | undefined, unit: string) =>
  r && (r.min !== null || r.max !== null) ? `${r.min ?? 0}-${r.max ?? "any"} ${unit}` : null;

const token = (spec: ModelSpec, kind: "image" | "video", n: number) => {
  const t = spec.prompting.addressing.tokens.find((x) => x.input === kind);
  return t ? ` ${t.pattern.replace("{n}", String(n))}` : "";
};

/** What the model takes from the guide, in one line, from its spec. */
export function guideLine(spec: ModelSpec, use: GuideUse): string {
  if (use === "audio-first-frame") {
    const audio = span(spec.inputs.audioToVideo.limits?.secondsEach, "s");
    return `Audio + first frame only: does not use the guide video. Takes the guide's audio${audio ? ` (${audio})` : ""} and exactly one image: frame 0, your character sheet or your environment image, not both. The clip runs as long as the audio.`;
  }
  const v = spec.inputs.referenceVideos.limits;
  const facts = [span(v?.secondsEach, "s"), v?.sidePx?.min ? `${v.sidePx.min}+ px a side` : null, span(v?.fps, "fps")].filter(Boolean).join(", ");
  const shared = findModel(spec.id).caps.sharedSeconds?.max;
  const audio = spec.inputs.referenceAudios.supported
    ? `its audio as reference audio${shared ? ` when clip and audio fit ${shared} s together` : ""}`
    : "no audio input";
  const ri = spec.inputs.referenceImages;
  const image = ri.supported
    ? `; up to ${ri.maxCount ?? "several"} reference images beside it: character sheet${token(spec, "image", 1)}, environment${token(spec, "image", 2)}`
    : "; no reference images";
  return `The whole guide clip as a reference video${token(spec, "video", 1)} (${facts}); ${audio}${image}.`;
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
  hasEnvironment?: boolean;
  /** Whether the guide video carries its own sound (meta.audioInVideo). */
  audioInVideo?: boolean;
  /** Seconds of the separate audio; the guide's length when not given. */
  audioSeconds?: number;
}

/** The composer's shot for one model: the guide's references, placed for how that model uses the guide. */
export function shotFor(g: GuideShot, model: string, facts: GuideFacts): { shot: ShotDescription; notes: string[] } {
  const m = guideModel(model);
  const notes: string[] = [];
  const refs: ShotReference[] = [];
  if (m.use === "guide-video") {
    refs.push({ id: "guide", kind: "video", role: "motion" });
    // Order sets the numbering: the character is image 1, the environment image 2.
    if (facts.hasCharacter) refs.push({ id: "character", kind: "image", role: "character", replaces: "the figure in the guide" });
    if (facts.hasEnvironment) refs.push({ id: "environment", kind: "image", role: "setting", replaces: "the guide's background" });
    // The same rule fitLane applies, decided here so the prompt never names audio that is not sent.
    const rule = facts.hasAudio
      ? sharedSeconds(m.name, findModel(m.key).caps, [{ name: "guide", info: { seconds: facts.seconds, hasAudio: facts.audioInVideo } }], [{ name: "audio", info: { seconds: facts.audioSeconds ?? facts.seconds } }])
      : { drop: false };
    if (rule.problem) throw new PlanError(rule.problem);
    if (rule.drop) notes.push(rule.note!);
    else if (facts.hasAudio) refs.push({ id: "audio", kind: "audio", role: "soundtrack" });
  } else {
    if (facts.hasCharacter && facts.hasEnvironment)
      throw new PlanError(`${m.name} takes exactly one image beside the audio: send the character sheet or the environment image, not both.`);
    refs.push({ id: facts.hasCharacter ? "character" : facts.hasEnvironment ? "environment" : "frame0", kind: "image", role: "first-frame" });
    if (facts.hasAudio) refs.push({ id: "audio", kind: "audio", role: "soundtrack" });
  }
  const shot: ShotDescription = {
    subject: g.subject,
    action: g.action,
    ...(g.environment ? { environment: g.environment } : {}),
    ...(g.legend ? { legend: g.legend } : {}),
    // With no camera named, the guide video carries it (and LTX, without one, gets no camera words).
    camera: g.camera ?? "guide",
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

/** What a host shows before Run: the prompt, the tags it uses and why anything was left out. */
export interface ComposedForHost {
  model: GuideModel;
  prompt: string;
  /** Each addressed input, e.g. { tag: "<<<image_1>>>", input: "character" }. */
  tags: { tag: string; input: string }[];
  /** Inputs the model will not get, with the reason. */
  dropped: string[];
  notes: string[];
  /** The composer's shot, as stored in the lane. */
  shot: ShotDescription;
}

/**
 * The composed prompt for a host that draws its own controls. `references`
 * says which images will be sent (any truthy value counts); `guide` gives the
 * clip length and whether it has audio (a loaded bundle, or the two facts;
 * defaults 5 s with audio). Throws PlanError for a combination the model refuses.
 */
export function composePrompt(
  shot: GuideShot,
  model: string,
  references: { character?: unknown; environment?: unknown } = {},
  guide: LoadedGuide | { seconds?: number; hasAudio?: boolean; audioInVideo?: boolean } = {},
): ComposedForHost {
  const loaded = "manifest" in guide ? guide : undefined;
  const facts: GuideFacts = {
    seconds: loaded ? loaded.seconds : ((guide as { seconds?: number }).seconds ?? 5),
    hasAudio: loaded ? Boolean(loaded.audio) : ((guide as { hasAudio?: boolean }).hasAudio ?? true),
    audioInVideo: loaded ? loaded.meta.audioInVideo === true : (guide as { audioInVideo?: boolean }).audioInVideo,
    hasCharacter: Boolean(references.character),
    hasEnvironment: Boolean(references.environment),
  };
  const p = previewPrompt(shot, model, facts);
  return {
    model: p.model,
    prompt: p.composed.prompt,
    tags: p.composed.used.filter((u) => u.address).map((u) => ({ tag: u.address!, input: u.ref })),
    dropped: p.composed.dropped.map((d) => `${d.ref}: ${d.reason}`),
    notes: [...p.notes, ...p.composed.notes],
    shot: p.shot,
  };
}

/** The offered models with their one-line notes and prompting-guide links. */
export const offeredModels = () => guideModels();

export interface GuideLaneInput {
  guide: LoadedGuide;
  model: string;
  /** The neutral shot; defaults to the guide's recipe.json `shot`. */
  shot?: GuideShot;
  /** Free text that replaces the composed prompt. */
  prompt?: string;
  character?: LaneMedia;
  environment?: LaneMedia;
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
  const { guide, character, environment } = input;
  const override = input.prompt?.trim() || undefined;
  const g = input.shot ?? guide.shot ?? (override ? { subject: override, action: "" } : undefined);
  if (!g || !g.subject.trim()) throw new PlanError("Describe the shot (subject and action), or write a prompt.");
  const facts: GuideFacts = { seconds: guide.seconds, hasAudio: Boolean(guide.audio), hasCharacter: Boolean(character), hasEnvironment: Boolean(environment), audioInVideo: guide.meta.audioInVideo === true, audioSeconds: guide.audio?.info?.seconds };
  const { model, composed, shot, notes } = previewPrompt(g, input.model, facts);
  if (model.use === "audio-first-frame" && !guide.audio)
    throw new PlanError(`${model.name} is driven by the guide's audio, and this bundle has no audio file.`);

  const mediaFor: Record<string, LaneMedia | undefined> = { guide: guide.video, audio: guide.audio, character, environment, frame0: guide.firstFrame };
  const req: LaneRequest = { model: model.key, prompt: override ?? composed.prompt };
  for (const u of composed.used) {
    const m = mediaFor[u.ref];
    if (!m) continue;
    if (u.role === "motion") req.guideVideo = m;
    else if (u.role === "soundtrack") req.audio = m;
    else if (u.role === "character") req.character = m;
    else if (u.role === "setting") req.environment = m;
    else if (u.role === "first-frame") {
      req.firstFrame = m;
      req.firstFrameVariant = u.ref === "frame0" ? "A" : "B";
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
