/**
 * The drop-in bundle for a host app (`npm run build:embed` → dist/embed/):
 * registers <arena-key>, <arena-player>, <arena-generate>, <arena-gallery>
 * and <model-arena>, and exports the parts for hosts that draw their own UI:
 * generateFromGuide, offeredModels, composePrompt.
 * Docs: docs/embed.md.
 */
import { defineGenerate } from "./generate/arena-generate.ts";
import { defineGallery } from "./gallery.ts";
import { defineKey } from "./key-panel.ts";
import { define as defineArena } from "./model-arena.ts";
import { definePlayer } from "./player.ts";

export { generateFromGuide, GenerateError, entriesOf } from "../../../providers/runware-api/generate.ts";
export type { GenerateOptions, GenerateResult, GenerateProgress, GenerateErrorCode, CostQuestion, GuideSource } from "../../../providers/runware-api/generate.ts";
export { loadGuideBundle, parseGuideShot } from "../../../providers/runware-api/guide-bundle.ts";
export type { GuideShot, LoadedGuide, BundleEntry } from "../../../providers/runware-api/guide-bundle.ts";
export { composePrompt, offeredModels, guideModels, previewPrompt, comparePrompts, planGuideLane, GUIDE_MODEL_KEYS, COMPARE_MODEL_KEYS } from "../../../providers/runware-api/guide-plan.ts";
export type { GuideModel, GuideFacts, ComposedForHost } from "../../../providers/runware-api/guide-plan.ts";
export type { ReferenceInput } from "../../../providers/runware-api/generate.ts";
export { presetFromRecord, parsePreset } from "./generate/preset.ts";
export type { GeneratePreset } from "./generate/preset.ts";
export { ArenaPlayer, needsSeek } from "./player.ts";
export { parseRecord } from "../../core/src/record.ts";
export type { ArenaRecord, Lane, GuideBundle } from "../../core/src/record.ts";
export { TOKEN_NAMES } from "./tokens.ts";
export { ArenaKey, keyProblem } from "./key-panel.ts";
export { ArenaGenerate } from "./generate/arena-generate.ts";
export { ArenaGallery } from "./gallery.ts";
export { ModelArena } from "./model-arena.ts";

defineArena();
defineKey();
definePlayer();
defineGenerate();
defineGallery();
