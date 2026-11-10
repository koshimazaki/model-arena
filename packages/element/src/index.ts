import { define } from "./model-arena.ts";
import { defineSpecs } from "./model-specs.ts";

export { ModelArena, define } from "./model-arena.ts";
export { ModelSpecs, defineSpecs } from "./model-specs.ts";
export { parseRecord } from "../../core/src/record.ts";
export { MODEL_SPECS, findSpec } from "../../core/src/specs/index.ts";
export { compose, composeFor } from "../../core/src/compose.ts";
export type { ArenaRecord, Lane, GuideBundle } from "../../core/src/record.ts";
export type { ModelSpec } from "../../core/src/specs/types.ts";
export type { ShotDescription, ComposedPrompt } from "../../core/src/compose.ts";

define();
defineSpecs();
