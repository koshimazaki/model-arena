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

## What the docs do not state

Each spec's `notes` lists its gaps. The ones that matter most when comparing:

- **Output fps** is not stated for Kling, Seedance or H3; LTX takes `fps` 24/25/50 (Fast also 48); FLUX 3 Video has no fps field, and its keyframes guide says 24 fps.
- **Frame counts.** No Runware page states a frame-count rule. For LTX-2.5, whose open weights want 8k+1 frames and sizes on a fixed multiple, the API exposes neither rule: it takes fixed durations (Pro 6/8/10 s, Fast 6-20 s even), fixed fps values and fixed width/height pairs (1280×720, 1920×1080 and portrait; Fast adds 2K and 4K). Any padding to 8k+1 happens server-side, out of sight.
- **Seed:** a request field only on Seedance 2.5 and H3. Kling's guide says there is none; LTX and FLUX return a seed but take none.
- **Camera words:** crane down and rack focus appear in few guides. Where a model's guide has no word for a move, the composer writes the move plainly and warns.

## The camera, per model

LTX-2.5 is the only model with a camera parameter (`settings.cameraMovement`: `static`, `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`, `jib_up`, `jib_down`, `focus_shift`), forbidden beside audio. Everyone else is steered in words, and each spec's `camera.vocabulary` holds the words its own guide uses, each linked to the page it came from. A vocabulary entry with a `move` and a `phrase` is what the composer writes for that neutral move (`static`, `push-in`, `pull-out`, `track-left`, `track-right`, `crane-up`, `crane-down`, `orbit`, `handheld`, `rack-focus`). With a motion guide attached, Kling takes the camera path from the guide ("Reference only the motion, camera path and pacing of `<<<video_1>>>`") and gets no camera words.

## How to add a model

1. Find its slug in `https://runware.ai/docs/models/index.json` (the AIR id does not work in docs paths). Add the slug to `scripts/fetch-schemas.sh`, run it, and commit the new fixture in `tests/fixtures/runware-schemas/`.
2. List its guides: `https://runware.ai/docs/sitemap.xml` has every `/docs/models/<slug>/guides/<page>`; each page also exists as markdown at the same URL plus `.md`. Read the model page and every guide.
3. Copy the closest spec in `packages/core/src/specs/` to a new file. Fill each field from the schema first (`inputs`, `x-constraints`, `allOf`, `x-modes`, `x-pricing`), then from the guides (addressing, three to five rules in your own words, camera words with `move` and `phrase` where the guide has a term for that move). Every `source` is the page you read it on. Where neither says, write `null` and a note that says "not stated"; where they disagree, follow the schema and note the conflict.
4. Add it to `MODEL_SPECS` in `specs/index.ts`. Run `npm test`: `tests/model-specs.test.ts` checks it against the fixture field by field and names whatever disagrees.
5. To run it as a lane, add it to `providers/runware-api/models.ts`, reading limits from the spec where you can (see `KLING_4_FLASH`); `tests/models-agree.test.ts` then keeps the two in step. Add a task snapshot in `tests/runware-task.test.ts`.
6. It appears in `<model-specs>` and the composer with no further work. Log anything surprising in `docs/friction.md`.
