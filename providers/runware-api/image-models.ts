/**
 * The image models a still can be made with on Runware, each read from its
 * published schema (https://runware.ai/docs/models/<slug>/schema.json; fixtures
 * in tests/fixtures/runware-schemas/). FLUX.2 [klein] 9B and Kling IMAGE 3.0
 * were read on 10 Nov 2026, the rest on 13 Nov 2026. A field, size rule or
 * limit appears here only after its schema showed it; every task schema sets
 * `additionalProperties: false`. Prices come from each schema's `x-pricing`.
 */
import type { CostEstimate } from "../types.ts";
import { tokenEstimate, type TokenPricing } from "./image-tokens.ts";
import { PlanError } from "./task.ts";

const DOCS = "https://runware.ai/docs/models";
const NEW_READ = "13 Nov 2026";

export type ImageFamily = "OpenAI GPT Image" | "MiniMax H3" | "ByteDance Seedream" | "FLUX" | "Kling IMAGE";
/** Family order for pickers; models keep table order within a family. */
export const IMAGE_FAMILIES: ImageFamily[] = ["FLUX", "OpenAI GPT Image", "MiniMax H3", "ByteDance Seedream", "Kling IMAGE"];

/** Limits on each reference image, from the schema's `maxItems` and `x-constraints`. */
export interface ReferenceRule {
  max: number;
  minSide?: number;
  maxSide?: number;
  minRatio?: number;
  maxRatio?: number;
  maxBytes?: number;
  /** x-constraints `area` on each reference, in pixels. */
  maxPixels?: number;
}

export type SizeRule =
  | {
      /** Free width and height within bounds, on a grid of `multipleOf` (1 when the schema sets none). */
      kind: "grid";
      min: number;
      max: number;
      multipleOf: number;
      default: [number, number];
      /** x-constraints `area` on width × height, in pixels. */
      area?: { min: number; max: number };
      /** x-constraints `ratio` on width / height. */
      ratio?: { min: number; max: number };
      /** A `resolution` preset the schema allows instead of width and height (never beside them). */
      resolution?: { values: string[] };
    }
  | {
      /** A closed list of width/height pairs, grouped by the tier their titles name. */
      kind: "list";
      pairs: Record<string, [number, number][]>;
      default: [number, number];
      /** `resolution` is accepted only beside a reference image. */
      withReference: { field: "resolution"; values: string[]; default: string };
      /** Whether a listed pair may also be sent beside a reference. */
      pairsWithReference: boolean;
    };

export interface PriceQuery {
  width?: number;
  height?: number;
  resolution?: string;
  references: number;
  /** The prompt, for models whose bound counts its tokens. */
  prompt?: string;
}

export interface ImagePricing {
  kind: "per-image" | "token" | "compute-time";
  /** The published rates in words. */
  summary: string;
  /** Where the price was read, and when. */
  source: string;
  read: string;
}

export interface ImageModel {
  key: string;
  air: string;
  slug: string;
  name: string;
  family: ImageFamily;
  provider: "runware-api";
  maker: string;
  prompt: { min: number; max: number };
  references: ReferenceRule;
  size: SizeRule;
  /** The schema's `outputFormat` enum. A still is a raster, so only PNG, JPG and WEBP are offered. */
  outputFormats: string[];
  /** `settings.background: "transparent"` exists (and then needs PNG or WEBP). */
  transparency: boolean;
  pricing: ImagePricing;
  estimate(q: PriceQuery): CostEstimate;
  /** Token-priced models: the published rates and examples, for the bound and the unpriced path. */
  tokens?: TokenPricing;
  /** What the schema has that this planner does not send. */
  notOffered?: string[];
  schemaUrl: string;
  pageUrl: string;
}

const pages = (slug: string) => ({ slug, schemaUrl: `${DOCS}/${slug}/schema.json`, pageUrl: `${DOCS}/${slug}` });
const fixed = (usd: number, basis: string) => () => ({ usd, basis });
export const allPairs = (s: Extract<SizeRule, { kind: "list" }>) => Object.values(s.pairs).flat();
export const tierOf = (s: Extract<SizeRule, { kind: "list" }>, w: number, h: number) =>
  Object.entries(s.pairs).find(([, list]) => list.some(([a, b]) => a === w && b === h))?.[0];

export const KLEIN_9B: ImageModel = {
  key: "klein-9b",
  air: "runware:400@2",
  ...pages("bfl-flux-2-klein-9b"),
  name: "FLUX.2 [klein] 9B",
  family: "FLUX",
  provider: "runware-api",
  maker: "Black Forest Labs",
  prompt: { min: 1, max: 10000 },
  references: { max: 4, minRatio: 0.125, maxRatio: 8 },
  // Required width and height: 128-2048, multiples of 16. 1280×720 matches a 16:9 guide frame.
  size: { kind: "grid", min: 128, max: 2048, multipleOf: 16, default: [1280, 720] },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: false,
  pricing: {
    kind: "compute-time",
    summary: "Billed by compute time; no rate. Measured 1024×1024 at 4 steps $0.00078; examples $0.00078-$0.00338",
    source: `${DOCS}/bfl-flux-2-klein-9b/schema.json x-pricing`,
    read: "10 Nov 2026",
  },
  // No per-unit rate: "billed by compute time". The bound is the highest published example price.
  estimate: fixed(0.00338, "no published rate (compute-time billing); bounded by the highest published example, $0.00338"),
};

// FLUX 3 Image Klein publishes measured runs at 16 steps (its default) by area, and reference examples.
const KLEIN3_MEASURED: [number, number][] = [[512 * 512, 0.003], [1024 * 1024, 0.006], [2048 * 2048, 0.0179], [4096 * 4096, 0.1013]];
const KLEIN3_REF_EXAMPLES: [number, number][] = [[768 * 1344, 0.0149], [1024 * 1536, 0.0149]];

export const FLUX_3_IMAGE_KLEIN: ImageModel = {
  key: "flux-3-image-klein",
  air: "bfl:flux@3-image-klein",
  ...pages("bfl-flux-3-image-klein"),
  name: "FLUX 3 Image Klein",
  family: "FLUX",
  provider: "runware-api",
  maker: "Black Forest Labs",
  prompt: { min: 1, max: 10000 },
  // x-constraints: each reference at least 16 px a side; maxItems 4.
  references: { max: 4, minSide: 16 },
  // Width and height 128-4096 in multiples of 16, required without a reference.
  size: { kind: "grid", min: 128, max: 4096, multipleOf: 16, default: [1280, 720] },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: false,
  pricing: {
    kind: "compute-time",
    summary: "Billed by compute time; no rate. Measured at 16 steps: 512² $0.003, 1024² $0.006, 2048² $0.0179, 4096² $0.1013; reference examples $0.0149",
    source: `${DOCS}/bfl-flux-3-image-klein/schema.json x-pricing`,
    read: NEW_READ,
  },
  estimate(q) {
    const area = (q.width ?? 1280) * (q.height ?? 720);
    const run = KLEIN3_MEASURED.find(([a]) => a >= area) ?? KLEIN3_MEASURED.at(-1)!;
    const side = Math.round(Math.sqrt(run[0]));
    let usd = run[1];
    let basis = `compute-time billing, no rate; bounded by the measured run at ${side}×${side} (16 steps), $${run[1]}`;
    if (q.references > 0) {
      const largest = Math.max(...KLEIN3_REF_EXAMPLES.map(([a]) => a));
      if (area > largest)
        return { usd: null, basis: `compute-time billing; no published run with reference images above ${(largest / 1e6).toFixed(2)} MP, so no bound` };
      const ref = Math.max(...KLEIN3_REF_EXAMPLES.map(([, p]) => p));
      if (ref > usd) {
        usd = ref;
        basis = `compute-time billing, no rate; bounded by the highest published reference example, $${ref}`;
      }
    }
    return { usd, basis };
  },
  notOffered: ["settings.boundingBoxes", "steps", "seed"],
};

const FLUX3_RATES: Record<string, number> = { "0.75K": 0.041, "1K": 0.048, "2K": 0.1, "4K": 0.607 };

export const FLUX_3_IMAGE: ImageModel = {
  key: "flux-3-image",
  air: "bfl:flux@3-image",
  ...pages("bfl-flux-3-image"),
  name: "FLUX 3 Image",
  family: "FLUX",
  provider: "runware-api",
  maker: "Black Forest Labs",
  prompt: { min: 2, max: 32000 },
  // maxItems 10; x-constraints: each at least 128 px a side.
  references: { max: 10, minSide: 128 },
  size: {
    kind: "list",
    // allOf: width/height, when sent, must be one of these pairs (titles name the tier).
    pairs: {
      "0.75K": [[1168, 496], [1088, 544], [1024, 576], [944, 624], [912, 656], [880, 672], [864, 688], [768, 768], [688, 864], [672, 880], [656, 912], [624, 944], [576, 1024], [544, 1088], [496, 1168]],
      "1K": [[1568, 672], [1440, 720], [1360, 768], [1248, 832], [1216, 864], [1184, 880], [1152, 912], [1024, 1024], [912, 1152], [880, 1184], [864, 1216], [832, 1248], [768, 1360], [720, 1440], [672, 1568]],
      "2K": [[3136, 1344], [2896, 1440], [2736, 1536], [2512, 1664], [2416, 1728], [2368, 1776], [2288, 1824], [2048, 2048], [1824, 2288], [1776, 2368], [1728, 2416], [1664, 2512], [1536, 2736], [1440, 2896], [1344, 3136]],
      "4K": [[6256, 2688], [5792, 2896], [5456, 3072], [5024, 3344], [4848, 3456], [4736, 3552], [4576, 3664], [4096, 4096], [3664, 4576], [3552, 4736], [3456, 4848], [3344, 5024], [3072, 5456], [2896, 5792], [2688, 6256]],
    },
    default: [1360, 768],
    // allOf: `resolution` only with referenceImages, never beside width/height; schema default 1K.
    withReference: { field: "resolution", values: ["0.75K", "1K", "2K", "4K"], default: "1K" },
    pairsWithReference: true,
  },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: false,
  pricing: {
    kind: "per-image",
    summary: "Per image: 0.75K $0.041, 1K $0.048, 2K $0.10, 4K $0.607",
    source: `${DOCS}/bfl-flux-3-image/schema.json x-pricing`,
    read: NEW_READ,
  },
  estimate(q) {
    const tier = q.resolution ?? (q.width && q.height ? tierOf(FLUX_3_IMAGE.size as Extract<SizeRule, { kind: "list" }>, q.width, q.height) : "1K") ?? "4K";
    return { usd: FLUX3_RATES[tier]!, basis: `x-pricing: ${tier} at $${FLUX3_RATES[tier]} per image` };
  },
  notOffered: ["settings.boundingBoxes", "settings.grounding", "settings.safetyTolerance"],
};

const GPT_RATES = { textInput: 5e-6, imageInput: 8e-6, imageOutput: 3e-5 };
const GPT_RATES_TEXT = "text input $5.00, image input $8.00, image output $30.00 per 1M tokens";
const gptImage = (variant: "Flare" | "Sunburst", examples: TokenPricing["examples"]): ImageModel => {
  const slug = `openai-gpt-image-2-6-${variant.toLowerCase()}`;
  const tokens: TokenPricing = { rates: GPT_RATES, ratesText: GPT_RATES_TEXT, examples };
  return {
    key: `gpt-image-2.6-${variant.toLowerCase()}`,
    air: `openai:gpt-image@2.6-${variant.toLowerCase()}`,
    ...pages(slug),
    name: `GPT-Image-2.6 ${variant}`,
    family: "OpenAI GPT Image",
    provider: "runware-api",
    maker: "OpenAI",
    prompt: { min: 2, max: 32000 },
    // maxItems 16; x-constraints: each at most 50 MB.
    references: { max: 16, maxBytes: 52428800 },
    // Width and height optional: 16-3840 in multiples of 16; area 655,360-8,294,400 px (not GIF); ratio 1:3 to 3:1.
    size: { kind: "grid", min: 16, max: 3840, multipleOf: 16, default: [1280, 720], area: { min: 655360, max: 8294400 }, ratio: { min: 1 / 3, max: 3 } },
    outputFormats: ["JPG", "PNG", "WEBP", "SVG", "GIF"],
    transparency: true,
    pricing: { kind: "token", summary: `Per token: ${GPT_RATES_TEXT}`, source: `${DOCS}/${slug}/schema.json x-pricing`, read: NEW_READ },
    tokens,
    estimate: (q) => tokenEstimate(tokens, q),
    notOffered: ["inputs.maskImage", "inputs.markupImage", "outputFormat SVG and GIF (no references allowed beside them)", "settings.quality", "settings.thinkingLevel"],
  };
};

// x-pricing.examples, 13 Nov 2026.
export const GPT_IMAGE_26_FLARE = gptImage("Flare", [
  { mode: "inpaint", usd: 0.0587 }, { mode: "text-to-gif", usd: 0.118 }, { mode: "text-to-image", usd: 0.167 },
  { mode: "text-to-vector", usd: 0.174 }, { mode: "transparent-background", usd: 0.175 }, { mode: "reference-to-image", usd: 0.193 },
]);
export const GPT_IMAGE_26_SUNBURST = gptImage("Sunburst", [
  { mode: "text-to-gif", usd: 0.0374 }, { mode: "text-to-image", usd: 0.0431 }, { mode: "text-to-vector", usd: 0.0634 },
  { mode: "inpaint", usd: 0.0771 }, { mode: "transparent-background", usd: 0.0788 }, { mode: "reference-to-image", usd: 0.192 },
]);

const h3Image = (highspeed: boolean): ImageModel => {
  const slug = highspeed ? "minimax-h3-image-highspeed" : "minimax-h3-image";
  const tokens: TokenPricing = highspeed
    ? {
        rates: { textInput: 2.3e-6, imageInput: 3e-6, imageOutput: 7.6e-6 },
        ratesText: "text input $2.30, image input $3.00, image output $7.60 per 1M tokens",
        examples: [{ mode: "text-to-image", usd: 0.0418 }, { mode: "text-to-image", usd: 0.0422 }, { mode: "reference-to-image", usd: 0.0725 }, { mode: "reference-to-image", usd: 0.0743 }],
      }
    : {
        rates: { textInput: 2.3e-6, imageInput: 1.5e-6, imageOutput: 3.8e-6 },
        ratesText: "text input $2.30, image input $1.50, image output $3.80 per 1M tokens",
        examples: [{ mode: "text-to-image", usd: 0.0176 }, { mode: "text-to-image", usd: 0.0189 }, { mode: "reference-to-image", usd: 0.0432 }, { mode: "reference-to-image", usd: 0.0432 }],
      };
  return {
    key: highspeed ? "h3-image-highspeed" : "h3-image",
    air: highspeed ? "minimax:h3@image-highspeed" : "minimax:h3@image",
    ...pages(slug),
    name: highspeed ? "MiniMax H3 Image Highspeed" : "MiniMax H3 Image",
    family: "MiniMax H3",
    provider: "runware-api",
    maker: "MiniMax",
    prompt: { min: 1, max: 32000 },
    // maxItems 16; x-constraints: each 128-8192 px a side, ratio 1:4 to 4:1, at most 64 MB.
    references: { max: 16, minSide: 128, maxSide: 8192, minRatio: 0.25, maxRatio: 4, maxBytes: 67108864 },
    // Width and height 468-7745 (no grid); area 655,360-20,000,000 px; ratio 1:3 to 3:1; or `resolution`.
    size: { kind: "grid", min: 468, max: 7745, multipleOf: 1, default: [1280, 720], area: { min: 655360, max: 20000000 }, ratio: { min: 1 / 3, max: 3 }, resolution: { values: ["1K", "2K", "4K"] } },
    outputFormats: ["JPG", "PNG", "WEBP"],
    transparency: false,
    pricing: { kind: "token", summary: `Per token: ${tokens.ratesText}`, source: `${DOCS}/${slug}/schema.json x-pricing`, read: NEW_READ },
    tokens,
    estimate: (q) => tokenEstimate(tokens, q),
    notOffered: ["settings.promptOptimizer (must stay on without width/height or with references)"],
  };
};

export const H3_IMAGE = h3Image(false);
export const H3_IMAGE_HIGHSPEED = h3Image(true);

// x-pricing labels: "Up to 1.5K (2.61 MP)" $0.02 and "2K (above 2.61 MP)" $0.035 per image, plus $0.008 per input image.
// 2.61 MP is read as 2,610,000 px, the lower (dearer) reading.
const SEEDREAM_SMALL_MAX_PX = 2_610_000;

export const SEEDREAM_55: ImageModel = {
  key: "seedream-5.5",
  air: "bytedance:seedream@5.5",
  ...pages("bytedance-seedream-5-5"),
  name: "Seedream 5.5",
  family: "ByteDance Seedream",
  provider: "runware-api",
  maker: "ByteDance",
  prompt: { min: 1, max: 10000 },
  // maxItems 10; x-constraints: each at least 15 px a side, ratio 1:16 to 16:1, at most 30 MB and 36 MP.
  references: { max: 10, minSide: 15, minRatio: 0.0625, maxRatio: 16, maxBytes: 31457280, maxPixels: 36000000 },
  // Width and height 256-16383 (no grid); area 921,600-4,624,220 px; ratio 1:16 to 16:1; or `resolution` (default 2K).
  size: { kind: "grid", min: 256, max: 16383, multipleOf: 1, default: [1280, 720], area: { min: 921600, max: 4624220 }, ratio: { min: 0.0625, max: 16 }, resolution: { values: ["1K", "1.5K", "2K"] } },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: true,
  pricing: {
    kind: "per-image",
    summary: "Per image: up to 1.5K (2.61 MP) $0.02, 2K (above 2.61 MP) $0.035; plus $0.008 per input image",
    source: `${DOCS}/bytedance-seedream-5-5/schema.json x-pricing`,
    read: NEW_READ,
  },
  estimate(q) {
    const small = q.resolution ? q.resolution !== "2K" : q.width && q.height ? q.width * q.height <= SEEDREAM_SMALL_MAX_PX : false;
    const base = small ? 0.02 : 0.035;
    const inputs = 0.008 * q.references;
    const usd = Math.round((base + inputs) * 10000) / 10000;
    const tier = small ? "up to 1.5K (2.61 MP)" : `2K (above 2.61 MP)${q.resolution || q.width ? "" : ", the schema default"}`;
    return { usd, basis: `x-pricing: ${tier} at $${base} per image${q.references ? ` + $0.008 × ${q.references} input image${q.references > 1 ? "s" : ""}` : ""}` };
  },
  notOffered: ["settings.layerDecomposition", "settings.safetyIdentifier"],
};

export const KLING_IMAGE_3: ImageModel = {
  key: "kling-image-3",
  air: "klingai:kling-image@3",
  ...pages("klingai-image-3-0"),
  name: "Kling IMAGE 3.0",
  family: "Kling IMAGE",
  provider: "runware-api",
  maker: "Kling AI",
  prompt: { min: 1, max: 2500 },
  references: { max: 1 },
  size: {
    kind: "list",
    // Without a reference, width/height must be one of these pairs; with one, `resolution` follows its aspect.
    pairs: {
      "1K": [[1024, 1024], [1248, 832], [832, 1248], [1168, 880], [880, 1168], [768, 1360], [1360, 768], [1552, 656]],
      "2K": [[2048, 2048], [2496, 1664], [1664, 2496], [2336, 1760], [1760, 2336], [1536, 2720], [2720, 1536], [3104, 1312]],
    },
    default: [1360, 768],
    withReference: { field: "resolution", values: ["1K", "2K"], default: "1K" },
    pairsWithReference: false,
  },
  outputFormats: ["JPG", "PNG", "WEBP"],
  transparency: false,
  pricing: { kind: "per-image", summary: "$0.028 per image", source: `${DOCS}/klingai-image-3-0/schema.json x-pricing`, read: "10 Nov 2026" },
  estimate: fixed(0.028, "x-pricing: $0.028 per image"),
};

/** Table order is family order, then the order within each family. */
export const IMAGE_MODELS: ImageModel[] = [
  KLEIN_9B, FLUX_3_IMAGE, FLUX_3_IMAGE_KLEIN,
  GPT_IMAGE_26_FLARE, GPT_IMAGE_26_SUNBURST,
  H3_IMAGE, H3_IMAGE_HIGHSPEED,
  SEEDREAM_55,
  KLING_IMAGE_3,
];

export function findImageModel(key: string): ImageModel {
  const m = IMAGE_MODELS.find((x) => x.key === key || x.air === key || x.slug === key);
  if (!m) throw new PlanError(`Unknown image model "${key}". Use one of: ${IMAGE_MODELS.map((x) => x.key).join(", ")}.`);
  return m;
}
