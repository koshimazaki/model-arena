/**
 * The model spec format: one typed, data-only record per video model, each
 * field traceable to a Runware schema or docs page. A field holds a value only
 * when a source shows it; anything unknown is `null` with a `notes` entry that
 * says "not stated". See docs/model-specs.md.
 */

/** Every kind of input a video model may take. */
export type InputKind =
  | "firstFrame"
  | "lastFrame"
  | "keyframes"
  | "referenceImages"
  | "referenceVideos"
  | "referenceAudios"
  | "sourceVideo"
  | "audioToVideo"
  | "elements";

export const INPUT_KINDS: readonly InputKind[] = [
  "firstFrame",
  "lastFrame",
  "keyframes",
  "referenceImages",
  "referenceVideos",
  "referenceAudios",
  "sourceVideo",
  "audioToVideo",
  "elements",
];

export interface Range {
  min: number | null;
  max: number | null;
}

/** Limits on one input, as the schema's `x-constraints` or the docs state them. */
export interface InputLimits {
  /** Seconds per item. */
  secondsEach: Range | null;
  /** Combined seconds across the items that share this budget. */
  secondsTotalMax: number | null;
  /** Pixels per side, per item. */
  sidePx: Range | null;
  maxAreaPx: number | null;
  fps: Range | null;
  maxBytesEach: number | null;
  /** Width / height, per item. */
  aspect: Range | null;
}

export interface InputSpec {
  supported: boolean;
  /** API path, e.g. `inputs.referenceVideos`; null when unsupported. */
  field: string | null;
  maxCount: number | null;
  limits: InputLimits | null;
  source: string;
  note?: string;
}

/** A combination rule as data. All `when` inputs present triggers the rule. */
export interface ComboRule {
  id: string;
  text: string;
  when: InputKind[];
  forbidsInputs?: InputKind[];
  forbidsParams?: string[];
  /** At least one of these must also be present. */
  requiresOneOf?: InputKind[];
  /** Exactly this many of one input. */
  requiresExactly?: { input: InputKind; count: number };
  /** These inputs share one count cap. */
  sharedMax?: { inputs: InputKind[]; max: number };
  source: string;
}

export type Durations =
  | { kind: "range"; min: number; max: number; auto: boolean }
  | { kind: "list"; values: number[]; auto: boolean };

export interface Size {
  label: string;
  width: number;
  height: number;
}

export interface OutputSpec {
  durations: Durations;
  defaultDuration: number | "auto" | null;
  /** How resolution is chosen: a `resolution` preset, fixed width/height pairs, or both. */
  resolutionField: "resolution" | "width-height" | "both";
  /** Tier names, e.g. 720p, 1080p, 2K. */
  resolutions: string[];
  /** Every width/height pair the schema allows. */
  sizes: Size[];
  fps: number[] | null;
  /** A frame-count rule, if the docs state one; else null. */
  frameCountRule: string | null;
  audio: {
    /** Whether the model generates sound; null when not stated. */
    generates: boolean | null;
    /** The switch, e.g. `settings.audio`, or null when there is none. */
    toggle: string | null;
  };
  source: string;
}

export interface PromptToken {
  input: "image" | "video" | "audio" | "element";
  /** `{n}` is replaced by the 1-based number. */
  pattern: string;
}

export interface PromptingSpec {
  minChars: number | null;
  maxChars: number | null;
  addressing: {
    style: "tags" | "at-mentions" | "plain-words" | "none";
    tokens: PromptToken[];
    numbering: string;
    source: string;
  };
  /** Three to five rules, paraphrased from the model's own guide. */
  rules: { text: string; source: string }[];
  seed: { supported: boolean; max: number | null; source: string };
  negativePrompt: boolean;
}

/** The neutral camera vocabulary the composer takes. */
export type CameraMove =
  | "static"
  | "push-in"
  | "pull-out"
  | "track-left"
  | "track-right"
  | "crane-up"
  | "crane-down"
  | "orbit"
  | "handheld"
  | "rack-focus";

export const CAMERA_MOVES: readonly CameraMove[] = [
  "static",
  "push-in",
  "pull-out",
  "track-left",
  "track-right",
  "crane-up",
  "crane-down",
  "orbit",
  "handheld",
  "rack-focus",
];

export interface CameraTerm {
  /** The term as the model's guide uses it. */
  term: string;
  source: string;
  /** Which neutral move this term expresses, if any. */
  move?: CameraMove;
  /** The camera sentence the composer writes for that move, built on the guide's term. */
  phrase?: string;
}

export type CameraSpec =
  | {
      kind: "parameter";
      field: string;
      values: { value: string; meaning: string; move?: CameraMove }[];
      /** Inputs beside which the parameter is forbidden. */
      forbiddenWith: InputKind[];
      /** Camera words the guide uses in prompts, where the parameter does not reach. */
      vocabulary: CameraTerm[];
      source: string;
    }
  | { kind: "prompt-only"; vocabulary: CameraTerm[] };

export type RateMode = "any" | "no-video-input" | "video-input" | "draft" | "draft-video-input";

export interface Rate {
  usdPerSecond: number;
  tier: string;
  mode: RateMode;
  /** The label exactly as `x-pricing` gives it. */
  label: string;
}

export interface PricingSpec {
  rates: Rate[];
  surcharges: { label: string; usd: number; per: "input-video-second" | "image-beyond-five" }[];
  source: string;
  note?: string;
}

export interface ModelSpec {
  /** Short key, shared with the provider's lane keys. */
  id: string;
  name: string;
  lab: string;
  air: string;
  /** Runware docs slug: https://runware.ai/docs/models/<slug>. */
  slug: string;
  verifiedOn: string;
  sources: {
    model: string;
    schema: string;
    guides: { title: string; url: string }[];
  };
  inputs: Record<InputKind, InputSpec>;
  combinations: ComboRule[];
  output: OutputSpec;
  prompting: PromptingSpec;
  camera: CameraSpec;
  pricing: PricingSpec;
  /** Docs gaps, conflicts and every "not stated". */
  notes: string[];
}
