/** Small builders so each spec file reads as data. */
import type { InputLimits, InputSpec } from "./types.ts";

export const DOCS = "https://runware.ai/docs/models";
export const modelPage = (slug: string) => `${DOCS}/${slug}`;
export const schemaUrl = (slug: string) => `${DOCS}/${slug}/schema.json`;
export const guide = (slug: string, page: string) => `${DOCS}/${slug}/guides/${page}`;
export const PRICING_DOCS = "https://runware.ai/docs/models-api/pricing";

export const MB = 1048576;

export function limits(l: Partial<InputLimits>): InputLimits {
  return {
    secondsEach: null,
    secondsTotalMax: null,
    sidePx: null,
    maxAreaPx: null,
    fps: null,
    maxBytesEach: null,
    aspect: null,
    ...l,
  };
}

export const range = (min: number | null, max: number | null) => ({ min, max });

export function yes(field: string, maxCount: number | null, source: string, l: InputLimits | null = null, note?: string): InputSpec {
  return { supported: true, field, maxCount, limits: l, source, ...(note ? { note } : {}) };
}

export function no(source: string, note?: string): InputSpec {
  return { supported: false, field: null, maxCount: null, limits: null, source, ...(note ? { note } : {}) };
}
