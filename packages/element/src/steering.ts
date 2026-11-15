/**
 * What a lane received and how its camera was steered, read from the record
 * (what was sent) and the spec database (what the model can take). Pure
 * functions, so the views stay thin and the rules are testable without a DOM.
 */
import type { Lane } from "../../core/src/record.ts";
import { MODEL_SPECS } from "../../core/src/specs/index.ts";
import type { ModelSpec } from "../../core/src/specs/types.ts";

/** The spec for a lane's model, matched by AIR id or spec id; undefined for the guide or the router. */
export function laneSpec(lane: Lane): ModelSpec | undefined {
  return MODEL_SPECS.find((s) => s.air === lane.model || s.id === lane.model);
}

/** The camera parameter a lane was sent, from the task's `settings` block. */
export function cameraParam(lane: Lane): string | undefined {
  const task = lane.settings as { settings?: { cameraMovement?: unknown } } | undefined;
  const v = task?.settings?.cameraMovement;
  return typeof v === "string" ? v : undefined;
}

export type Steering = "parameter" | "guide-video" | "prompt";

export const STEERING: { id: Steering; title: string; text: string }[] = [
  { id: "parameter", title: "Camera parameter", text: "The move is a request field the model reads directly." },
  { id: "guide-video", title: "Guide video", text: "A reference video carries the move; the prompt names it." },
  { id: "prompt", title: "Prompt words", text: "The move is written into the prompt and nothing else." },
];

export function steering(lane: Lane): Steering {
  if (cameraParam(lane)) return "parameter";
  if (lane.inputsSent.some((i) => i.role === "referenceVideo")) return "guide-video";
  return "prompt";
}

export type SlotState = "sent" | "not-sent" | "cannot";

export interface StripSlot {
  key: "firstFrame" | "guideVideo" | "audio" | "cameraParam" | "prompt";
  label: string;
  state: SlotState;
  detail: string;
}

/** The five things a model may receive, each sent, not sent, or not takeable. */
export function inputsStrip(lane: Lane, spec = laneSpec(lane)): StripSlot[] {
  const sent = (role: string) => lane.inputsSent.find((i) => i.role === role);
  const frame = lane.inputsSent.find((i) => i.role === "frameImage" && (i.frame === undefined || i.frame === "first" || i.frame === 0));
  const stillAsRef = lane.firstFrameVariant !== "C" ? sent("referenceImage") : undefined;
  const video = sent("referenceVideo");
  const audio = sent("referenceAudio") ?? sent("audio");
  const param = cameraParam(lane);
  const can = (ok: boolean | undefined): SlotState => (ok === false ? "cannot" : "not-sent");

  const firstFrame: StripSlot = frame
    ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as the first frame" }
    : stillAsRef
      ? { key: "firstFrame", label: "First frame", state: "sent", detail: "as a reference image" }
      : { key: "firstFrame", label: "First frame", state: can(spec?.inputs.firstFrame.supported), detail: spec?.inputs.firstFrame.supported === false ? "cannot take it" : "not sent" };
  const takesVideo = spec ? spec.inputs.referenceVideos.supported : undefined;
  const takesAudio = spec ? spec.inputs.referenceAudios.supported || spec.inputs.audioToVideo.supported : undefined;
  const takesParam = spec ? spec.camera.kind === "parameter" : undefined;
  return [
    firstFrame,
    video
      ? { key: "guideVideo", label: "Guide video", state: "sent", detail: "as a reference video" }
      : { key: "guideVideo", label: "Guide video", state: can(takesVideo), detail: takesVideo === false ? "cannot take it" : "not sent" },
    audio
      ? { key: "audio", label: "Audio", state: "sent", detail: audio.role === "audio" ? "drives the clip" : "as reference audio" }
      : { key: "audio", label: "Audio", state: can(takesAudio), detail: takesAudio === false ? "cannot take it" : "not sent" },
    param
      ? { key: "cameraParam", label: "Camera parameter", state: "sent", detail: param }
      : { key: "cameraParam", label: "Camera parameter", state: can(takesParam), detail: takesParam === false ? "none on this model" : "not sent" },
    lane.prompt
      ? { key: "prompt", label: "Prompt text", state: "sent", detail: param ? "no camera words" : "carries the move" }
      : { key: "prompt", label: "Prompt text", state: "not-sent", detail: "no prompt" },
  ];
}

/**
 * The list price of one clip from the spec's cheapest matching rate: a lower
 * bound, labelled as such, for lanes that have not run.
 */
export function listPrice(lane: Lane, spec = laneSpec(lane)): { usd: number; excludes?: string } | null {
  if (!spec || typeof lane.durationSeconds !== "number") return null;
  const videoIn = lane.inputsSent.some((i) => i.role === "referenceVideo" || i.role === "video");
  const live = spec.pricing.rates.filter((r) => !r.mode.startsWith("draft"));
  const fit = live.filter((r) => r.mode === "any" || r.mode === (videoIn ? "video-input" : "no-video-input"));
  const pool = fit.length ? fit : live;
  if (!pool.length) return null;
  const usd = Math.round(Math.min(...pool.map((r) => r.usdPerSecond)) * lane.durationSeconds * 1000) / 1000;
  // MiniMax bills uploaded video per input second, which the record does not hold.
  const surcharge = videoIn ? spec.pricing.surcharges.find((x) => x.per === "input-video-second") : undefined;
  return surcharge ? { usd, excludes: `${surcharge.label} at $${surcharge.usd}/s` } : { usd };
}
