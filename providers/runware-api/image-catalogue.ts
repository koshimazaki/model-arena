/**
 * The image models as plain data for a host's picker: one flat list in a
 * stable order (`imageModels`), or grouped by family for a two-step picker
 * (`imageFamilies`). Every fact comes from the table in image-models.ts.
 */
import type { CostEstimate } from "../types.ts";
import { describeSize, STILL_FORMATS } from "./image.ts";
import { IMAGE_FAMILIES, IMAGE_MODELS, type ImageFamily, type ImageModel, type ImagePricing, type ReferenceRule, type SizeRule } from "./image-models.ts";

export interface ImageModelInfo {
  key: string;
  name: string;
  air: string;
  family: ImageFamily;
  provider: "runware-api";
  maker: string;
  accepts: {
    text: true;
    /** Reference or edit images: how many, and each one's limits. */
    referenceImages: ReferenceRule;
    transparent: boolean;
    /** `settings.quality` values and default, where the schema has them; null otherwise. */
    quality: { values: string[]; default: string } | null;
    /** Output formats offered for a still (a subset of the schema's list). */
    outputFormats: string[];
    /** Schema features this planner does not send. */
    notOffered: string[];
  };
  prompt: { min: number; max: number };
  size: { rule: SizeRule; summary: string; default: [number, number] };
  /** The estimate for a text-to-image still at the default size; `usd: null` means none, and a capped run is refused. */
  estimate: CostEstimate;
  pricing: ImagePricing;
  schemaUrl: string;
  pageUrl: string;
}

export interface ImageFamilyInfo {
  family: ImageFamily;
  models: ImageModelInfo[];
}

function info(m: ImageModel): ImageModelInfo {
  const def = m.size.default;
  return {
    key: m.key,
    name: m.name,
    air: m.air,
    family: m.family,
    provider: m.provider,
    maker: m.maker,
    accepts: {
      text: true,
      referenceImages: { ...m.references },
      transparent: m.transparency,
      quality: m.quality ? { values: [...m.quality.values], default: m.quality.default } : null,
      outputFormats: m.outputFormats.filter((f) => (STILL_FORMATS as readonly string[]).includes(f)),
      notOffered: [...(m.notOffered ?? [])],
    },
    prompt: { ...m.prompt },
    size: { rule: structuredClone(m.size), summary: describeSize(m.size), default: [def[0], def[1]] },
    estimate: m.estimate({ width: def[0], height: def[1], references: 0 }),
    pricing: { ...m.pricing },
    schemaUrl: m.schemaUrl,
    pageUrl: m.pageUrl,
  };
}

const ordered = () =>
  [...IMAGE_MODELS].sort((a, b) => IMAGE_FAMILIES.indexOf(a.family) - IMAGE_FAMILIES.indexOf(b.family) || IMAGE_MODELS.indexOf(a) - IMAGE_MODELS.indexOf(b));

/** Every image model, by family then table order. Fresh objects each call. */
export function imageModels(): ImageModelInfo[] {
  return ordered().map(info);
}

/** The families in picker order, each with its models. */
export function imageFamilies(): ImageFamilyInfo[] {
  const all = imageModels();
  return IMAGE_FAMILIES.map((family) => ({ family, models: all.filter((m) => m.family === family) })).filter((f) => f.models.length);
}
