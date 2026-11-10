/**
 * Builds the exact Runware `videoInference` task for one lane, the uploads it
 * needs first, and an upper-bound price from the schema's published rates.
 * Pure: no network, so `--dry-run` and tests see exactly what would be sent.
 */
import { fitLane, FitError } from "../../packages/core/src/fit.ts";
import type { InputSent, InputRole } from "../../packages/core/src/record.ts";
import type { CostEstimate, LaneMedia, LanePlan, LaneRequest } from "../types.ts";
import { findModel, type RunwareModel } from "./models.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uploadPlaceholder = (n: number, name: string) =>
  `{{upload:${n}:${name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80)}}}`;

function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

function checkDuration(m: RunwareModel, d: number | "auto"): void {
  if (d === "auto") {
    if (!m.duration.auto) throw new PlanError(`${m.name} needs a whole number of seconds; "auto" is not in its schema.`);
    return;
  }
  if (!Number.isInteger(d)) throw new PlanError(`Duration must be a whole number of seconds; got ${d}.`);
  if (m.duration.kind === "range" && (d < m.duration.min || d > m.duration.max))
    throw new PlanError(`${m.name} makes ${m.duration.min}-${m.duration.max} s clips; got ${d}.`);
  if (m.duration.kind === "enum" && !m.duration.values.includes(d))
    throw new PlanError(`${m.name} makes clips of ${m.duration.values.join(", ")} s only; got ${d}.`);
}

function rateFor(m: RunwareModel, resolution: string | undefined, videoInput: boolean) {
  const tier = m.rates.filter((r) => r.resolution === resolution);
  const pick = tier.find((r) => r.videoInput === undefined || r.videoInput === videoInput) ?? tier[0];
  // Unknown tier: bound by the highest published rate, as the router does.
  return pick ?? m.rates.reduce((a, b) => (b.usdPerSecond > a.usdPerSecond ? b : a), m.rates[0]!);
}

const longest = (m: RunwareModel) =>
  m.duration.kind === "range" ? m.duration.max : Math.max(...m.duration.values);

export function estimateCost(
  m: RunwareModel,
  opts: { resolution?: string; seconds: number | "auto"; videoInput: boolean; inputVideoSeconds?: number; images?: number; maxPrice?: number },
): CostEstimate {
  if (m.key === "auto")
    return { usd: opts.maxPrice ?? null, basis: "router: capped server-side by routing.maxPrice" };
  const seconds = opts.seconds === "auto" ? longest(m) : opts.seconds;
  const rate = rateFor(m, opts.resolution, opts.videoInput);
  let usd = rate.usdPerSecond * seconds;
  let basis = `${rate.label} at $${rate.usdPerSecond}/s × ${seconds} s${opts.seconds === "auto" ? " (auto: bounded by the longest clip)" : ""}`;
  if (m.inputVideoUsdPerSecond && opts.videoInput) {
    const inSec = opts.inputVideoSeconds ?? (m.caps.referenceVideos?.totalMaxSeconds ?? 15);
    usd += m.inputVideoUsdPerSecond * inSec;
    basis += ` + input video $${m.inputVideoUsdPerSecond}/s × ${inSec.toFixed(2)} s`;
  }
  if (m.key === "h3" && (opts.images ?? 0) > 5) {
    usd += 0.04 * ((opts.images ?? 0) - 5);
    basis += " + $0.04 per image beyond five";
  }
  return { usd: Math.round(usd * 10000) / 10000, basis };
}

export function planTask(req: LaneRequest, taskUUID = randomUUID()): LanePlan {
  const m = findModel(req.model);
  const prompt = req.prompt.trim();
  if (prompt.length < m.prompt.min || prompt.length > m.prompt.max)
    throw new PlanError(`${m.name} takes a prompt of ${m.prompt.min}-${m.prompt.max} characters.`);
  if (m.key === "auto" && !(req.routing && req.routing.maxPrice > 0))
    throw new PlanError("The router lane needs a price cap (routing.maxPrice / --max-price).");

  let fit;
  try {
    fit = fitLane(m.caps, {
      modelName: m.name,
      guideVideo: req.guideVideo,
      firstFrame: req.firstFrame,
      character: req.character,
      audio: req.audio,
      keyframes: req.keyframes,
    });
  } catch (e) {
    if (e instanceof FitError) throw new PlanError(e.message);
    throw e;
  }

  const uploads: LanePlan["uploads"] = [];
  const inputsSent: InputSent[] = [];
  const refOf = (media: LaneMedia, role: InputRole, frame?: string | number): string => {
    inputsSent.push({
      role,
      src: media.displaySrc ?? media.name,
      label: media.name,
      ...(frame !== undefined ? { frame } : {}),
    });
    if (UUID.test(media.ref) || /^https:\/\//.test(media.ref)) return media.ref;
    if (!/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(media.ref))
      throw new PlanError(`${media.name}: media must be an https URL, a media UUID or a data URI.`);
    const existing = uploads.find((u) => u.media === media);
    if (existing) return existing.placeholder;
    const placeholder = uploadPlaceholder(uploads.length + 1, media.name);
    uploads.push({ placeholder, media });
    return placeholder;
  };

  const inputs: Record<string, unknown> = {};
  if (fit.frameImages.length)
    inputs.frameImages = fit.frameImages.map((f) => ({ image: refOf(f.media, "frameImage", f.frame), frame: f.frame }));
  if (fit.referenceImages.length) inputs.referenceImages = fit.referenceImages.map((x) => refOf(x, "referenceImage"));
  if (fit.referenceVideos.length) inputs.referenceVideos = fit.referenceVideos.map((x) => refOf(x, "referenceVideo"));
  if (fit.referenceAudios.length) inputs.referenceAudios = fit.referenceAudios.map((x) => refOf(x, "referenceAudio"));
  if (fit.drivingAudio) inputs.audio = refOf(fit.drivingAudio, "audio");

  const task: Record<string, unknown> = {
    taskType: "videoInference",
    taskUUID,
    model: m.air,
    positivePrompt: prompt,
  };
  const audioDriven = Boolean(fit.drivingAudio);
  const duration: number | "auto" = req.duration ?? (m.duration.kind === "range" ? Math.max(5, m.duration.min) : m.duration.values[0]!);
  if (audioDriven) {
    // LTX schema: duration and cameraMovement are forbidden once inputs.audio is sent.
    if (req.duration !== undefined) throw new PlanError(`${m.name} with audio takes its length from the audio; drop --duration.`);
  } else {
    checkDuration(m, duration);
    task.duration = duration;
  }

  let resolution = req.resolution ?? m.defaultResolution;
  if (m.resolutions) {
    if (resolution && !m.resolutions.includes(resolution))
      throw new PlanError(`${m.name} resolutions: ${m.resolutions.join(", ")}.`);
    if (resolution) task.resolution = resolution;
  } else if (m.sizes) {
    if (audioDriven) resolution = "1080p"; // schema: width/height must be 1920×1080 or 1080×1920 with audio; leave the default.
    else {
      const size = resolution ? m.sizes[resolution] : undefined;
      if (!size) throw new PlanError(`${m.name} sizes: ${Object.keys(m.sizes).join(", ")}.`);
      task.width = size.width;
      task.height = size.height;
    }
  } else if (m.key !== "auto") {
    // No resolution field (Kling 4.0 Flash): one tier only, the size follows the input.
    if (req.resolution && req.resolution !== m.defaultResolution)
      throw new PlanError(`${m.name} makes ${m.defaultResolution} only; the size follows the input.`);
  } else if (req.resolution) throw new PlanError(`${m.name}: resolution is not set on the router lane; describe it in --requirements.`);

  if (Object.keys(inputs).length) task.inputs = inputs;

  if (req.camera !== undefined) {
    if (!m.cameraMovements)
      throw new PlanError(`${m.name} declares no camera parameter in its schema; describe the camera in the prompt.`);
    if (!m.cameraMovements.includes(req.camera))
      throw new PlanError(`${m.name} camera movements: ${m.cameraMovements.join(", ")}.`);
    if (audioDriven) throw new PlanError(`${m.name} forbids cameraMovement beside audio.`);
    task.settings = { cameraMovement: req.camera };
  }

  if (m.key === "auto" && req.routing) {
    const routing: Record<string, unknown> = { maxPrice: req.routing.maxPrice };
    if (req.routing.requirements) {
      if (req.routing.requirements.length > 3000) throw new PlanError("routing.requirements is limited to 3000 characters.");
      routing.requirements = req.routing.requirements;
    }
    if (req.routing.preferences) routing.preferences = req.routing.preferences;
    task.routing = routing;
  }

  task.deliveryMethod = "async";
  task.includeCost = true;

  const videoInput = fit.referenceVideos.length > 0;
  const estimate = estimateCost(m, {
    resolution,
    seconds: audioDriven
      ? (fit.drivingAudio?.info?.seconds ?? m.caps.drivingAudio?.maxSeconds ?? 10)
      : duration,
    videoInput,
    inputVideoSeconds: fit.referenceVideos.reduce<number | undefined>(
      (n, v) => (v.info?.seconds === undefined || n === undefined ? undefined : n + v.info.seconds),
      0,
    ),
    images: fit.referenceImages.length + fit.frameImages.length,
    maxPrice: req.routing?.maxPrice,
  });

  const notes = [...fit.notes];
  if (m.prompt.tokens) notes.push(`${m.name} prompt tokens for inputs: ${m.prompt.tokens}.`);

  return {
    provider: "runware-api",
    modelId: m.air,
    modelName: m.name,
    uploads,
    task,
    inputsSent,
    firstFrameVariant: req.firstFrame ? (req.firstFrameVariant ?? "A") : "C",
    estimate,
    notes,
  };
}

/** The task with every upload placeholder replaced by its media UUID. */
export function fillUploads(task: Record<string, unknown>, ids: Map<string, string>): Record<string, unknown> {
  const json = JSON.stringify(task).replace(/\{\{upload:\d+:[^}]*\}\}/g, (p) => {
    const id = ids.get(p);
    if (!id) throw new Error(`No media id for ${p}.`);
    return id;
  });
  return JSON.parse(json) as Record<string, unknown>;
}
