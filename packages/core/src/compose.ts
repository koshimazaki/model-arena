/**
 * Prompt composer: one neutral shot description in, one prompt per model out.
 * Each model gets the same intent in its own dialect: references addressed in
 * its own syntax, the camera move as a real parameter where the model has one
 * (LTX `settings.cameraMovement`) and as words everywhere else, and its
 * combination rules applied. Every decision is reported back, so a caption can
 * say what the model received and what it could not take.
 */
import { writePrompt, cameraSentence } from "./compose-text.ts";
import { findSpec, INPUT_KINDS } from "./specs/index.ts";
import type { CameraMove, InputKind, ModelSpec } from "./specs/types.ts";

export type ReferenceKind = "image" | "video" | "audio";

/** What a reference is for, in neutral terms. */
export type ReferenceRole =
  | "first-frame"
  | "last-frame"
  | "keyframe"
  | "character"
  | "product"
  | "garment"
  | "style"
  | "setting"
  | "motion"
  | "source"
  | "soundtrack";

export interface ShotReference {
  id: string;
  kind: ReferenceKind;
  role: ReferenceRole;
  /** What the model should keep from it; a default per role otherwise. */
  keep?: string;
}

export interface ShotDescription {
  subject: string;
  action: string;
  camera: CameraMove;
  references: ShotReference[];
  /** What the sound should be, in words. */
  audio?: string;
  /** Seconds. */
  duration: number;
}

export interface ComposeOptions {
  /**
   * When an input forbids the camera parameter (LTX audio mode), keep the
   * parameter and drop the input ("camera-parameter", the default), or keep
   * the input and write the move into the prompt ("inputs").
   */
  prefer?: "camera-parameter" | "inputs";
}

export interface UsedInput {
  ref: string;
  role: ReferenceRole;
  input: InputKind;
  field: string;
  /** How the prompt names it, e.g. `<<<video_1>>>`; null when it is not named. */
  address: string | null;
  /** Set when the reference went in as another kind of input. */
  convertedFrom?: InputKind;
}

export interface DroppedInput {
  ref: string;
  role: ReferenceRole;
  wanted: InputKind;
  reason: string;
}

export type CameraMode = "parameter" | "guide-video" | "prompt";

export interface ComposedCamera {
  move: CameraMove;
  mode: CameraMode;
  /** The parameter path and value, when mode is "parameter". */
  field?: string;
  value?: string;
  /** The words the prompt carries for the move; null when the parameter carries it alone. */
  text: string | null;
}

export interface ComposedPrompt {
  model: string;
  name: string;
  prompt: string;
  /** Request fields beyond the prompt and inputs, e.g. `settings.cameraMovement`. */
  params: Record<string, string | number>;
  camera: ComposedCamera;
  used: UsedInput[];
  dropped: DroppedInput[];
  /** Input kinds this model cannot take at all, from the spec database. */
  cannotTake: InputKind[];
  duration: { requested: number; sent: number };
  notes: string[];
}

const IMAGE_ROLE_INPUT: Partial<Record<ReferenceRole, InputKind>> = {
  "first-frame": "firstFrame",
  "last-frame": "lastFrame",
  keyframe: "keyframes",
};
const FRAMES: InputKind[] = ["firstFrame", "lastFrame", "keyframes"];

/** The input kind a reference asks for, before the model's rules apply. */
export function wantedInput(spec: ModelSpec, ref: ShotReference): InputKind {
  if (ref.kind === "image") return IMAGE_ROLE_INPUT[ref.role] ?? "referenceImages";
  if (ref.kind === "video") return ref.role === "source" ? "sourceVideo" : "referenceVideos";
  return spec.inputs.referenceAudios.supported || !spec.inputs.audioToVideo.supported ? "referenceAudios" : "audioToVideo";
}

interface Slot {
  ref: ShotReference;
  input: InputKind;
  convertedFrom?: InputKind;
}

function placeInputs(spec: ModelSpec, shot: ShotDescription, opts: ComposeOptions) {
  const dropped: DroppedInput[] = [];
  const notes: string[] = [];
  let slots: Slot[] = [];
  const drop = (s: Slot, reason: string) => {
    slots = slots.filter((x) => x !== s);
    dropped.push({ ref: s.ref.id, role: s.ref.role, wanted: s.convertedFrom ?? s.input, reason });
  };
  const has = (k: InputKind) => slots.some((s) => s.input === k);
  const count = (k: InputKind) => slots.filter((s) => s.input === k).length;
  const toReferenceImage = (s: Slot, why: string) => {
    if (!s.convertedFrom) s.convertedFrom = s.input;
    s.input = "referenceImages";
    notes.push(`${s.ref.id}: sent as a reference image because ${why}`);
  };

  for (const ref of shot.references) {
    const input = wantedInput(spec, ref);
    const slot: Slot = { ref, input };
    if (!spec.inputs[input].supported) {
      dropped.push({ ref: ref.id, role: ref.role, wanted: input, reason: `${spec.name} takes no ${label(input)}.` });
      continue;
    }
    const max = spec.inputs[input].maxCount;
    if (max !== null && count(input) >= max) {
      dropped.push({ ref: ref.id, role: ref.role, wanted: input, reason: `${spec.name} takes at most ${max} ${label(input)}.` });
      continue;
    }
    slots.push(slot);
  }

  const cameraField = spec.camera.kind === "parameter" ? spec.camera.field : null;
  for (let pass = 0; pass < 4; pass++) {
    for (const rule of spec.combinations) {
      if (rule.when.length === 0 || !rule.when.every(has)) continue;
      const triggers = slots.filter((s) => rule.when.includes(s.input));
      if (cameraField && rule.forbidsParams?.includes(cameraField) && (opts.prefer ?? "camera-parameter") === "camera-parameter" && cameraValue(spec, shot.camera)) {
        for (const s of triggers) drop(s, `${rule.text} The camera parameter was kept.`);
        continue;
      }
      const forbidden = slots.filter((s) => rule.forbidsInputs?.includes(s.input));
      if (forbidden.length) {
        const refsOk = spec.inputs.referenceImages.supported;
        if (refsOk && triggers.every((s) => FRAMES.includes(s.input)) && !forbidden.every((s) => s.input === "referenceImages" && !s.convertedFrom)) {
          // A start frame cannot sit beside references: the still goes in as an image reference.
          for (const s of triggers) toReferenceImage(s, `${spec.name} does not take a frame beside references (${rule.id}).`);
        } else if (refsOk && !rule.forbidsInputs?.includes("referenceImages") && forbidden.every((s) => FRAMES.includes(s.input))) {
          for (const s of forbidden) toReferenceImage(s, `frame images are not allowed here (${rule.id}).`);
        } else {
          for (const s of forbidden) drop(s, rule.text);
        }
      }
      if (rule.requiresExactly) {
        const { input, count: n } = rule.requiresExactly;
        for (const s of slots.filter((x) => x.input === input).slice(n)) drop(s, rule.text);
        if (count(input) < n) for (const s of slots.filter((x) => rule.when.includes(x.input))) drop(s, rule.text);
      }
      if (rule.requiresOneOf && !rule.requiresOneOf.some(has)) {
        for (const s of slots.filter((x) => rule.when.includes(x.input))) drop(s, rule.text);
      }
    }
  }
  for (const rule of spec.combinations) {
    if (!rule.sharedMax) continue;
    const shared = slots.filter((s) => rule.sharedMax!.inputs.includes(s.input));
    for (const s of shared.slice(rule.sharedMax.max)) drop(s, rule.text);
  }
  return { slots, dropped, notes };
}

function cameraValue(spec: ModelSpec, move: CameraMove): string | undefined {
  return spec.camera.kind === "parameter" ? spec.camera.values.find((v) => v.move === move)?.value : undefined;
}

const LABELS: Record<InputKind, string> = {
  firstFrame: "first frame",
  lastFrame: "last frame",
  keyframes: "keyframes",
  referenceImages: "reference images",
  referenceVideos: "reference video",
  referenceAudios: "reference audio",
  sourceVideo: "source video",
  audioToVideo: "driving audio",
  elements: "elements",
};
export const label = (k: InputKind) => LABELS[k];

/** Addresses in the model's own syntax, numbered as its schema or guide says. */
function address(spec: ModelSpec, slots: Slot[]): Map<Slot, string | null> {
  const out = new Map<Slot, string | null>();
  const { style, tokens } = spec.prompting.addressing;
  const token = (kind: "image" | "video" | "audio") => tokens.find((t) => t.input === kind)?.pattern;
  const order = (kinds: InputKind[]) => kinds.flatMap((k) => slots.filter((s) => s.input === k));
  const number = (list: Slot[], kind: "image" | "video" | "audio") => {
    const p = token(kind);
    list.forEach((s, i) => out.set(s, p ? p.replace("{n}", String(i + 1)) : null));
  };
  for (const s of slots) out.set(s, null);
  if (style === "tags") {
    // Kling: images across frameImages then referenceImages; videos across video then referenceVideos.
    number(order(["firstFrame", "lastFrame", "keyframes", "referenceImages"]), "image");
    number(order(["sourceVideo", "referenceVideos"]), "video");
  } else if (style === "at-mentions" || style === "plain-words") {
    number(order(["referenceImages"]), "image");
    number(order(["referenceVideos"]), "video");
    number(order(["referenceAudios"]), "audio");
  }
  return out;
}

function fitDuration(spec: ModelSpec, want: number, notes: string[]): number {
  const d = spec.output.durations;
  let sent: number;
  if (d.kind === "range") sent = Math.min(d.max, Math.max(d.min, Math.round(want)));
  else sent = d.values.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  if (sent !== want) notes.push(`Duration ${want} s is not offered; ${sent} s is sent.`);
  return sent;
}

/** Compose the shot for one model. */
export function composeFor(model: string | ModelSpec, shot: ShotDescription, opts: ComposeOptions = {}): ComposedPrompt {
  const spec = typeof model === "string" ? findSpec(model) : model;
  const { slots, dropped, notes } = placeInputs(spec, shot, opts);
  const addrs = address(spec, slots);
  const used: UsedInput[] = slots.map((s) => ({
    ref: s.ref.id,
    role: s.ref.role,
    input: s.input,
    field: spec.inputs[s.input].field!,
    address: addrs.get(s) ?? null,
    ...(s.convertedFrom ? { convertedFrom: s.convertedFrom } : {}),
  }));

  const params: Record<string, string | number> = {};
  const value = cameraValue(spec, shot.camera);
  const forbiddenBeside = spec.camera.kind === "parameter" ? spec.camera.forbiddenWith.some((k) => used.some((u) => u.input === k)) : true;
  const guideVideo = used.some((u) => u.input === "referenceVideos" && u.role === "motion");
  let camera: ComposedCamera;
  if (spec.camera.kind === "parameter" && value && !forbiddenBeside) {
    params[spec.camera.field] = value;
    camera = { move: shot.camera, mode: "parameter", field: spec.camera.field, value, text: null };
  } else {
    const words = cameraSentence(spec, shot.camera);
    if (words.note) notes.push(words.note);
    if (spec.camera.kind === "parameter" && !value) notes.push(`${spec.camera.field} has no value for "${shot.camera}"; the move is written into the prompt.`);
    if (spec.camera.kind === "parameter" && value && forbiddenBeside) notes.push(`${spec.camera.field} is not allowed beside these inputs; the move is written into the prompt.`);
    camera = { move: shot.camera, mode: guideVideo ? "guide-video" : "prompt", text: words.text };
  }

  const audioDriven = used.some((u) => u.input === "audioToVideo");
  const duration = fitDuration(spec, shot.duration, notes);
  if (audioDriven) notes.push("Audio-driven: no duration is sent; the clip runs as long as the audio.");
  else params.duration = duration;

  const prompt = writePrompt(spec, shot, used, camera);
  if (spec.prompting.maxChars !== null && prompt.length > spec.prompting.maxChars)
    notes.push(`The prompt is ${prompt.length} characters; ${spec.name} takes ${spec.prompting.maxChars}.`);

  return {
    model: spec.id,
    name: spec.name,
    prompt,
    params,
    camera,
    used,
    dropped,
    cannotTake: INPUT_KINDS.filter((k) => !spec.inputs[k].supported),
    duration: { requested: shot.duration, sent: duration },
    notes,
  };
}

/** The five lanes of the comparison, in display order. */
export const COMPARISON_MODELS = ["kling-4", "seedance-2.5", "h3", "ltx-2.5", "flux-3-video"] as const;

/** Compose the shot for several models; defaults to the five comparison lanes. */
export function compose(shot: ShotDescription, models: readonly string[] = COMPARISON_MODELS, opts: ComposeOptions = {}): ComposedPrompt[] {
  return models.map((m) => composeFor(m, shot, opts));
}

