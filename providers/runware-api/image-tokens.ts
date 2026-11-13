/**
 * Token-priced image models (GPT-Image-2.6, MiniMax H3 Image). Three cases:
 *
 * - A strict bound, from an exact output-token count per image if Runware ever
 *   publishes one (`outputTokensPerImage`). None is published.
 * - An estimate, from approximate counts Runware publishes (`approx`). The
 *   MiniMax H3 Image and Highspeed pages (read 13 Nov 2026) say: output up to
 *   about 4 MP is about 4,100 image tokens, 4K about 16,400, each reference adds
 *   about 2,050 input tokens, and the optimiser's rewritten prompt counts as
 *   text input. The rewrite's length is not published, so the estimate takes
 *   the largest text-token count the published examples imply for the same
 *   mode, then adds a stated margin. It is an estimate, not a strict bound.
 * - Nothing (GPT-Image-2.6: "measure before you budget"). Such a run needs
 *   `allowUnpriced`, and its cap is compared with the highest published example.
 */
import type { CostEstimate } from "../types.ts";

export interface TokenExample {
  mode: string;
  usd: number;
  /** Reference images in the example request (examples.json). */
  references?: number;
  /** Output tokens of the example by the published approximate figures, when it is known which tier it fell in. */
  outputTokens?: number;
}

export interface ApproxTokens {
  /** Approximate output tokens by output area, ascending; above the last entry nothing is published. */
  output: { upToPixels: number; tokens: number; label: string; presets?: string[] }[];
  /** Approximate input tokens per reference image. */
  perReference: number;
  /** Added on top, as a fraction, because every figure is "about". */
  margin: number;
  source: string;
}

export interface TokenPricing {
  /** USD per token, from `x-pricing.rates[].amount`. */
  rates: { textInput: number; imageInput: number; imageOutput: number };
  /** The same rates as `x-pricing.rates[].display` writes them. */
  ratesText: string;
  /** Runware's published example runs (`x-pricing.examples`), USD. */
  examples: TokenExample[];
  /** An exact output-token count per image, if one is ever published. Unset: none published. */
  outputTokensPerImage?: number;
  /** Exact input tokens per reference image, if published. Unset: none published. */
  inputTokensPerImage?: number;
  /** Approximate counts the model page publishes, for an estimate. */
  approx?: ApproxTokens;
}

export interface TokenQuery {
  /** The prompt; its UTF-8 byte length bounds its token count (a token is at least one byte). */
  prompt?: string;
  references: number;
  width?: number;
  height?: number;
  resolution?: string;
}

const usd = (n: number) => Math.round(n * 1e6) / 1e6;
const bytes = (s = "") => new TextEncoder().encode(s).length;

/** The strict upper bound in USD, or null when a figure it needs is not published. */
export function tokenBound(t: TokenPricing, q: TokenQuery): number | null {
  if (t.outputTokensPerImage === undefined) return null;
  if (q.references > 0 && t.inputTokensPerImage === undefined) return null;
  return usd(t.outputTokensPerImage * t.rates.imageOutput + bytes(q.prompt) * t.rates.textInput + q.references * (t.inputTokensPerImage ?? 0) * t.rates.imageInput);
}

function outputBand(a: ApproxTokens, q: TokenQuery) {
  if (q.resolution) return a.output.find((b) => b.presets?.includes(q.resolution!));
  if (!q.width || !q.height) return undefined;
  const px = q.width * q.height;
  return a.output.find((b) => px <= b.upToPixels);
}

/** The largest text-input token count the published examples of this mode leave unexplained by the image figures. */
export function rewriteAllowance(t: TokenPricing, references: number): number {
  const a = t.approx!;
  const mode = references > 0 ? "reference-to-image" : "text-to-image";
  const implied = t.examples
    .filter((e) => e.mode === mode && e.outputTokens !== undefined)
    .map((e) => (e.usd - e.outputTokens! * t.rates.imageOutput - (e.references ?? 0) * a.perReference * t.rates.imageInput) / t.rates.textInput);
  return Math.max(0, Math.ceil(Math.max(0, ...implied)));
}

/** An estimate from approximate published counts, or null when the size is outside them. */
export function tokenApprox(t: TokenPricing, q: TokenQuery): CostEstimate | null {
  const a = t.approx;
  if (!a) return null;
  const band = outputBand(a, q);
  if (!band) return null;
  const allowance = rewriteAllowance(t, q.references);
  const text = allowance + bytes(q.prompt);
  const raw = band.tokens * t.rates.imageOutput + q.references * a.perReference * t.rates.imageInput + text * t.rates.textInput;
  const est = usd(raw * (1 + a.margin));
  const refs = q.references ? ` + ${q.references} × about ${a.perReference.toLocaleString("en-GB")} reference tokens` : "";
  return {
    usd: est,
    approximate: true,
    basis:
      `about $${est}: an estimate, not a strict bound. Priced per token (${t.ratesText}); output ${band.label} about ${band.tokens.toLocaleString("en-GB")} image tokens${refs}; ` +
      `text about ${text.toLocaleString("en-GB")} tokens (the prompt plus a rewrite allowance of ${allowance.toLocaleString("en-GB")}, the most the published examples imply); plus a ${Math.round(a.margin * 100)}% margin. Source: ${a.source}`,
  };
}

export const highestExample = (t: TokenPricing) => Math.max(...t.examples.map((e) => e.usd));
export const examplesText = (t: TokenPricing) => t.examples.map((e) => `${e.mode} $${e.usd}`).join(", ");

export function tokenEstimate(t: TokenPricing, q: TokenQuery): CostEstimate {
  const bound = tokenBound(t, q);
  if (bound !== null) return { usd: bound, basis: `up to $${bound} (priced per token: ${t.ratesText})` };
  const approx = tokenApprox(t, q);
  if (approx) return approx;
  return {
    usd: null,
    basis: t.approx
      ? `priced per token (${t.ratesText}); Runware publishes no token count for an output of this size (the approximate figures stop at 4K), so there is no estimate. Published examples: ${examplesText(t)}`
      : `priced per token (${t.ratesText}); Runware publishes no token count for this size and quality, so there is no upper bound. Published examples: ${examplesText(t)}`,
  };
}
