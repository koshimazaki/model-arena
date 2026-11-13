/**
 * Token-priced image models (GPT-Image-2.6, MiniMax H3 Image). A bound is
 * derived only from figures Runware publishes: the per-token rates in
 * `x-pricing`, times the largest output-token count stated for the size and
 * quality, plus input-image tokens where a per-image figure is stated. As read
 * on 13 Nov 2026, neither the schemas, `x-pricing` nor `examples.json` state any
 * token count, so `outputTokensPerImage` is unset for every model and no bound
 * exists: such a run needs `allowUnpriced`, and its cap is compared with the
 * highest published example price instead.
 */
import type { CostEstimate } from "../types.ts";

export interface TokenPricing {
  /** USD per token, from `x-pricing.rates[].amount`. */
  rates: { textInput: number; imageInput: number; imageOutput: number };
  /** The same rates as `x-pricing.rates[].display` writes them. */
  ratesText: string;
  /** Runware's published example runs (`x-pricing.examples`), USD. */
  examples: { mode: string; usd: number }[];
  /** The largest output-token count published per image, if one ever is. Unset: none published. */
  outputTokensPerImage?: number;
  /** Input tokens per reference image, if published. Unset: none published. */
  inputTokensPerImage?: number;
}

export interface TokenQuery {
  /** The prompt; its UTF-8 byte length bounds its token count (a token is at least one byte). */
  prompt?: string;
  references: number;
}

const usd = (n: number) => Math.round(n * 1e6) / 1e6;

/** The upper bound in USD, or null when a figure it needs is not published. */
export function tokenBound(t: TokenPricing, q: TokenQuery): number | null {
  if (t.outputTokensPerImage === undefined) return null;
  if (q.references > 0 && t.inputTokensPerImage === undefined) return null;
  const textTokens = new TextEncoder().encode(q.prompt ?? "").length;
  return usd(
    t.outputTokensPerImage * t.rates.imageOutput +
      textTokens * t.rates.textInput +
      q.references * (t.inputTokensPerImage ?? 0) * t.rates.imageInput,
  );
}

export const highestExample = (t: TokenPricing) => Math.max(...t.examples.map((e) => e.usd));
export const examplesText = (t: TokenPricing) => t.examples.map((e) => `${e.mode} $${e.usd}`).join(", ");

export function tokenEstimate(t: TokenPricing, q: TokenQuery): CostEstimate {
  const bound = tokenBound(t, q);
  if (bound !== null) return { usd: bound, basis: `up to $${bound} (priced per token: ${t.ratesText})` };
  return {
    usd: null,
    basis: `priced per token (${t.ratesText}); Runware publishes no token count for this size and quality, so there is no upper bound. Published examples: ${examplesText(t)}`,
  };
}
