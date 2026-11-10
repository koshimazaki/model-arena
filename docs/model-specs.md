---
tags: [model-arena, specs]
summary: The model spec database in packages/core/src/specs: one data-only record per video model, every fact traced to a Runware schema or docs page.
---

# Model specs

`packages/core/src/specs/` holds one typed spec per video model on Runware: Kling VIDEO 4.0 and 4.0 Flash, Seedance 2.5, MiniMax H3, LTX-2.5 Pro and Fast, and FLUX 3 Video. The format is `types.ts`; its JSON Schema is `packages/core/schema/model-spec.schema.json`.

Each spec says:

- **inputs:** for each input kind (first frame, last frame, keyframes, reference images, videos and audios, source video, audio-to-video, elements), whether the model takes it, the API field, the count cap and the per-item limits;
- **combinations:** which inputs cannot sit together, as data the composer and the fitter can check;
- **output:** durations, resolutions, every width/height pair, fps, audio;
- **prompting:** prompt length, how references are addressed (`<<<video_1>>>`, `@Video1`, "Video 1", or not at all), three to five rules from the model's guide, seed;
- **camera:** a real parameter (LTX `settings.cameraMovement`) or prompt-only, with the guide's own camera words;
- **pricing:** the `x-pricing` rates exactly as published;
- **notes:** every gap, conflict and "not stated".

## The rule

A field holds a value only when Runware's schema or docs state it. Anything else is `null` with a note that says "not stated". Where the guide and the schema disagree, the schema is followed and the conflict is noted.

## Keeping it true

`tests/model-specs.test.ts` checks every spec against the schema fixtures in `tests/fixtures/runware-schemas/`: input fields and caps, durations, resolutions and sizes, fps, prompt length, seed, the camera parameter and its values, and the rates. Refresh the fixtures with `sh scripts/fetch-schemas.sh`; a failing test then names the field that moved. Facts from guides and model pages (addressing, rules, camera words) are not in the schema and are re-read by hand, with `verifiedOn` updated.
