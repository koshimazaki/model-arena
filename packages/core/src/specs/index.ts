/** The model spec database: one data-only spec per video model. */
import { FLUX_3_VIDEO } from "./flux-3-video.ts";
import { KLING_VIDEO_4_0 } from "./kling-video-4-0.ts";
import { KLING_VIDEO_4_0_FLASH } from "./kling-video-4-0-flash.ts";
import { LTX_2_5_FAST, LTX_2_5_PRO } from "./ltx-2-5.ts";
import { MINIMAX_H3 } from "./minimax-h3.ts";
import { SEEDANCE_2_5 } from "./seedance-2-5.ts";
import type { InputKind, ModelSpec } from "./types.ts";

export * from "./types.ts";
export { FLUX_3_VIDEO, KLING_VIDEO_4_0, KLING_VIDEO_4_0_FLASH, LTX_2_5_FAST, LTX_2_5_PRO, MINIMAX_H3, SEEDANCE_2_5 };

export const MODEL_SPECS: readonly ModelSpec[] = [
  KLING_VIDEO_4_0,
  KLING_VIDEO_4_0_FLASH,
  SEEDANCE_2_5,
  MINIMAX_H3,
  LTX_2_5_PRO,
  LTX_2_5_FAST,
  FLUX_3_VIDEO,
];

export function findSpec(idOrAir: string): ModelSpec {
  const s = MODEL_SPECS.find((x) => x.id === idOrAir || x.air === idOrAir || x.slug === idOrAir);
  if (!s) throw new Error(`No spec for "${idOrAir}". Known: ${MODEL_SPECS.map((x) => x.id).join(", ")}.`);
  return s;
}

/** Inputs this model takes, in the fixed display order. */
export const supportedInputs = (s: ModelSpec): InputKind[] =>
  (Object.keys(s.inputs) as InputKind[]).filter((k) => s.inputs[k].supported);

/** The cheapest per-second rate, for the matrix. */
export const cheapestRate = (s: ModelSpec) =>
  s.pricing.rates.filter((r) => !r.mode.startsWith("draft")).reduce((a, b) => (b.usdPerSecond < a.usdPerSecond ? b : a));
