/**
 * The drop-in bundle for a host app (`npm run build:embed` → dist/embed/):
 * registers <arena-key>, <arena-generate>, <arena-gallery> and <model-arena>,
 * and exports the generate flow for hosts that build their own UI.
 * Docs: docs/embed.md.
 */
import { defineGenerate } from "./generate/arena-generate.ts";
import { defineGallery } from "./gallery.ts";
import { defineKey } from "./key-panel.ts";
import { define as defineArena } from "./model-arena.ts";

export { generateFromGuide, GenerateError, entriesOf } from "../../../providers/runware-api/generate.ts";
export type { GenerateOptions, GenerateResult, GenerateProgress, GenerateErrorCode, CostQuestion, GuideSource } from "../../../providers/runware-api/generate.ts";
export { loadGuideBundle, parseGuideShot } from "../../../providers/runware-api/guide-bundle.ts";
export type { GuideShot, LoadedGuide, BundleEntry } from "../../../providers/runware-api/guide-bundle.ts";
export { guideModels, previewPrompt, comparePrompts, planGuideLane, GUIDE_MODEL_KEYS } from "../../../providers/runware-api/guide-plan.ts";
export type { GuideModel, GuideFacts } from "../../../providers/runware-api/guide-plan.ts";
export { parseRecord } from "../../core/src/record.ts";
export type { ArenaRecord, Lane, GuideBundle } from "../../core/src/record.ts";
export { TOKEN_NAMES } from "./tokens.ts";
export { ArenaKey, keyProblem } from "./key-panel.ts";
export { ArenaGenerate } from "./generate/arena-generate.ts";
export { ArenaGallery } from "./gallery.ts";
export { ModelArena } from "./model-arena.ts";

defineArena();
defineKey();
defineGenerate();
defineGallery();
