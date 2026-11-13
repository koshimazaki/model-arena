---
tags: [plan, model-arena, agents]
summary: Implementation plan for Model Arena as work packages MA-0 to MA-6, with files, tests and acceptance, for builder agents.
---

# Model Arena: implementation plan

Written 7 November 2026; state and dates updated 10 November. Product scope is in [PRD.md](PRD.md). The cross-repo overview, covering both this repo and `motion-studio`, is kept privately by the owner. This file is the build plan for this repo.

## Milestones

| Date | State |
| --- | --- |
| Sun 8 to Tue 10 Nov | Done: MA-0, MA-1, MA-2 (the floor), plus MA-7 to MA-11 below. The paid acceptance run of MA-1 waits on spend approval |
| Wed 11 Nov | Spend approval; MA-1 acceptance run; character stills and the first two content records (product, clothing) |
| Thu 12 Nov | Preview: content records 3 and 4; MA-4 embed template and capture mode; README checked by a stranger |
| Fri 13 Nov | MA-3 keyframes and the FLUX 3 Video keyframe lane; MA-4b key panel |
| Sat 14 Nov | Final for the first milestone: four published records, docs frozen |

**Cut line.** Above it, the milestone ships: the four content records with real clips, the element (`arena`, `guidance`, `three-up`), `<model-specs>`, the spec database and composer, the embed template. Below it, and moved to the next milestone if Saturday arrives first: MA-3 keyframes (the FLUX lane then runs from a first frame only), the browser key panel (MA-4b; the CLI stays the way to rerun), capture mode, MA-5.

## State on 10 November

Branch `feat/ma-floor`, not pushed. No paid run has been made: `docs/costs.md` has no rows, and the owner has not approved spend.

| Package | State |
| --- | --- |
| MA-0 schemas, lint | Done (`cc18c35`); ESLint added (`npm run lint`) |
| MA-1 Runware provider and lane CLI | Built and tested against fake fetch (`cc18c35`); its acceptance run (one paid Kling 4.0 clip) is **not done**, waiting on spend approval |
| MA-2 element and lanes | Done for `three-up` (`cc18c35`) |
| Spec database | Done (`6224bbf`): seven models in `packages/core/src/specs/`, checked field by field against the schema fixtures by `tests/model-specs.test.ts`. See [model-specs.md](model-specs.md) |
| Prompt composer | Done (`c67b5ea`, `3f27d9d`): `compose()` in `packages/core/src/compose.ts` |
| Blog panels | Done with placeholder clips (`7374e25`, `8657f41`): `layout="arena"` and `layout="guidance"`, record sets as tabs, `blog-demo.html` |
| MA-7 spec database | Done (`6224bbf`, `9b6d7a9`): `models.ts` and the specs are checked against each other |
| MA-8 composer and the record's shot | Done (`c67b5ea`, `3f27d9d`, `4dca3f2`): `record.shot`, `lane.composed`, `run-lane --shot` |
| MA-9 `<model-specs>` | Done (`c6b7806`): matrix, cards, live composer, `specs.html`, `dist/model-specs.json` |
| MA-10 character still | Done (`9b6d7a9`): `npm run still` (FLUX.2 [klein] 9B, Kling IMAGE 3.0), `run-lane --character`, Kling 4.0 Flash lane |
| MA-11 browser smoke test | Done (`e6284bf`): `npm run smoke` in headless Google Chrome; playback and the shared clock verified |
| MA-3 keyframes | Not started |
| MA-4 embed, capture mode, themes | Partly: the build is one file (`dist/model-arena.js`); the embed bundle for host apps is built (13 Nov, below); themes are `--ma-*` properties with neutral defaults, the dark lime look moved to `packages/element/themes/dark-lime.css`. `templates/embed.html` and capture mode are not built |
| MA-4b key panel, galleries | Built against a fake provider (13 Nov): `<arena-key>`, `generateFromGuide`, `<arena-generate>`, `<arena-gallery>`, `<arena-player>`. Live path unverified: no paid browser run yet. The Serverless recipe is not written |
| MA-5 | Not started (needs Serverless access) |
| MA-6 | README and docs done; the four published records wait on paid runs |

### Embed for a host app (13 November)

Built for a sibling path-drawing app that exports Motion Studio bundles (schema 0.5.0). One file, `npm run build:embed` → `dist/embed/model-arena-embed.js`, with types; how a host uses it is in [embed.md](embed.md).

- **Parts first.** `generateFromGuide()` (bundle files plus optional character sheet and environment image, a neutral shot `{ subject, environment, action, legend }` with `recipe.json`'s shot as the default, a price cap, a confirm callback, progress events, the key by reference from `<arena-key>`); `offeredModels()` and `composePrompt()` for hosts with their own controls; `<arena-player>` follows the host's clock within a frame.
- **All in one.** `<arena-generate>`: model picker (Kling 4.0, Seedance 2.5, MiniMax H3, then LTX-2.5 marked "audio + first frame only"), shot fields, own-prompt override, two reference slots, the composed prompt with its tags and the model's prompting guide, "Compare prompts", estimate, inline cost confirmation, result on one clock with the honest caption, Download, "Add to gallery", the costs.md row. Opens with a preset (`preset` attribute or `loadPreset`).
- **Gallery.** `<arena-gallery>`: records as a switcher, layout `inputs` (reference strip, guide and one to three outputs on one playhead, the guide's audio once, clip sound off by default), "Run this yourself" back into the generate element; empty state "No published runs yet".
- **Same task from the CLI.** `run-lane --bundle <dir> --character --environment` goes through the same planner (`providers/runware-api/guide-plan.ts`); a test compares the CLI's task with the element's.
- **Composer.** `ShotDescription` gains optional `environment` and `legend`; lanes may carry their own `shot` (schema version stays 1).
- **Checked by** `tests/generate.test.ts`, `tests/embed-elements.test.ts`, `tests/embed-parts.test.ts` and the smoke run of `examples/embed.html` from the built file under a static sub-path.
- **Open:** the first paid browser run (the live path, including how an invalid key is reported and whether the output CDN allows a cross-origin download); the real sign-up URL for "Get a key" (it points at runware.ai's home page).

### What changed from the 7 November assumptions

- **Kling 4.0 refuses small reference videos:** every input video must be 700-4553 px a side, 24-60 fps (`x-constraints`). The 1024×576 guide is refused; `npm run demo:media` makes a 1280×720 copy.
- **Upload first:** video and audio inputs take a media UUID or URL only, so local files go through a `mediaStorage` upload task, then the lane's task carries the UUID.
- **Seedance 2.5 and MiniMax H3 refuse a start frame beside any reference** (schema `allOf`). The still goes in as a reference image, which is weaker than a pinned first frame.
- **LTX-2.5 audio mode** is `inputs.audio` plus exactly one `inputs.referenceImages`, with no duration (the clip follows the audio), no `cameraMovement` and 1920×1080 only. The 7 Nov note ("audio and frameImages") was wrong.
- **H3 surcharges:** $0.13 per second of uploaded input video and $0.04 per image beyond five, on top of the output rate.
- **There is no plain "LTX-2.5":** Pro and Fast are separate models with different audio and duration limits.
- **LTX frame counts:** the API hides the open-weights 8k+1 frame and size-multiple rules behind fixed durations (Pro 6/8/10 s), fixed fps (24/25/50) and fixed width/height pairs; the docs state neither rule.
- **Kling 4.0 Flash** exists (720p, 3-20 s, no `resolution` field) and is a lane.

### What was added beyond the original plan

- **Spec database** (`packages/core/src/specs/`, `schema/model-spec.schema.json`): per model, which inputs it takes and their limits, combination rules, durations, sizes, prompt length, addressing syntax, prompt rules, seed, camera (parameter or prompt-only, with the guide's own words), rates. A field holds a value only when Runware's schema or docs state it; otherwise it is null with a "not stated" note.
- **Prompt composer** (`compose.ts`, `compose-text.ts`): one neutral shot (subject, action, camera move, references with roles, audio intent, duration, optional focus and timed beats) in; per model out: the prompt in its dialect, request params, how the camera is steered, inputs used with their addresses, inputs dropped with reasons, input kinds it cannot take.
  - Addressing: Kling `<<<image_n>>>`/`<<<video_n>>>` (images across frames then references; videos across `inputs.video` then `referenceVideos`), Seedance `@Image1`/`@Video1`/`@Audio1`, MiniMax "Image 1"/"Video 1", none for LTX and FLUX 3 Video.
  - Camera: LTX gets `settings.cameraMovement`; every other model gets the move in words. With a guide video, Kling uses Runware's "Reference only the … camera path and pacing of `<<<video_1>>>`" pattern and no camera words.
  - Rules from the spec: a start frame beside reference videos goes in as an image reference on Seedance and H3; LTX keeps the camera parameter over audio mode unless `prefer: "inputs"`.
- **Record sets** (`record-set.ts`): several records as tabs in one element.
- **Two blog views:**
  - `arena`: 2-5 models, a layout per count, a model menu per tile, cost per clip and seconds, list price for lanes not run;
  - `guidance`: guide beside output on one clock, model switcher, the three steering modes, inputs strip, composed prompt with copy.

### How to see it

`npm run demo:placeholders`, then `npm run dev` and open `/blog-demo.html`. `npm run shot -- <url> <width> <out.png>` screenshots a page and reports horizontal overflow (checked at 360 px and 1400 px: none).

### Open

- The first paid run (MA-1 acceptance) and real clips for the blog records, after the owner approves spend.
- Light and dark: the element defaults to the Runware blog's dark tokens because that page is dark-only; `theme="auto"` follows `prefers-color-scheme`. Confirm this default.
- MA-3 keyframes, the FLUX 3 Video keyframe lane, the embed template, capture mode and the key panel.
- Which model the router chose is read back with `getTaskDetails`; unverified until a paid router run.

## Stack and layout

TypeScript, Vite library mode, vitest, a standard custom element with no framework. Node 24.

```
packages/core/        record schema, guide-bundle JSON Schema, shared clock, lane fitting, keyframe extraction
packages/element/     <model-arena> custom element, layouts, captions, carousel, capture mode, themes
providers/types.ts    the provider interface
providers/runware-api/        browser client, per-model task builder, polling, cost
providers/runware-serverless/ stretch (MA-5)
templates/embed.html
examples/records/     published comparison records (media hosted outside the repo or small)
docs/                 PRD, plan, friction.md, costs.md
```

## Seed code

The Arena in the owner's studio project (camera-director `src/arena/`, `shared/arena-run.ts`). Lift two things:
- the shared-playhead clock;
- the record shape.

Do not port the rest; it is coupled to that studio's server, agent and MCP. The Runware Serverless client and container for MA-5 can be recovered from camera-director history, at `03a51ea7^`.

## Work packages

Rules for every package:
- one worktree, one branch `feat/ma-<n>-<slug>`, one PR;
- commits by Koshi only, no attribution lines;
- typecheck and tests green;
- a docs section;
- a hand-back of at most ten lines.

### MA-0, scaffold and schemas (Sat 7 to Sun 8 Nov, half a day)

- Vite library-mode workspace with `packages/core` and `packages/element`; vitest; lint; `docs/friction.md` and `docs/costs.md`.
- **Record schema** (`schemaVersion: 1`):
  - comparison id, title;
  - guide;
  - lanes, each with model, prompt, inputs sent, first-frame variant (A raw frame 0, B restyled still, C none), output URL, cost, seconds and the model that ran;
  - observations, preferred lane.
- **Guide-bundle JSON Schema:** video, audio, firstFrame, firstFrameStyled, beats, recipe, meta with asset licences. This is the contract `motion-studio` exports against.
- **Synced with Motion Studio 0.3.0 (11 November):** the schema now holds two forms, the inline guide a record embeds (schemaVersion 1) and the Motion Studio `bundle.json` manifest with its `beats`, `meta` and `camera` defs (optional camera track, onsets, peaks, `stick` and `blob`); `packages/core/src/bundle.ts` reads a bundle into the inline form without dropping them.
- **Acceptance:** `npm test` green. The schema validates the mannequin-and-two-fruits guide packed as a bundle (from the owner's Downloads: `mannequin-two-fruits-guide-1024x576-24fps.mp4`, the first-frame PNG, the depth MP4).

### MA-1, Runware API provider (Sun 8 Nov, one day)

Files: `providers/types.ts`, `providers/runware-api/client.ts`, `models.ts` (input mapping per model), `poll.ts`, plus tests.

- **Request:** `POST https://api.runware.ai/v1` with an array of tasks. Each task has `taskType`, `taskUUID` (UUID v4), `model`, `positivePrompt`, size or aspect fields, `duration`, `includeCost: true`, and the inputs block for that model.
- **Results:** video is async. Submit, then poll by `taskUUID` until a video URL is returned; store cost and seconds.
- **Read each model's schema at `runware.ai/docs/models/<id>/schema.json` before writing its mapping.** Check whether Seedance 2.5 and H3 accept `frameImages` together with `referenceVideos`.
- **Key:** typed by the user, held in memory or `sessionStorage`, labelled "stays in your browser", never logged, sent only to `api.runware.ai`.
- **Tests:**
  - a snapshot of the task JSON per model;
  - polling against a fake fetch;
  - cost parsing;
  - a refusal when a model cannot use an input.
- **Acceptance:** one approved 4-second Kling 4.0 run with the guide as reference video, made from a test page, with cost logged in `docs/costs.md`.

### MA-2, element and lanes (Sun 8 to Mon 9 Nov, one day)

Files: `packages/element/src/model-arena.ts`, `layouts/`, `captions.ts`; `packages/core/src/clock.ts`, `fit.ts`.

- **Lane fitting** (`fit.ts`):
  - the whole clip to Kling, Seedance and H3;
  - audio plus the first frame to LTX-2.5;
  - keyframes to FLUX (MA-3);
  - a clear refusal otherwise.
  On H3 and Seedance the pose-locked still goes in as an image reference wherever a start frame cannot sit beside reference videos.
- **Element:**
  - **Playback:** one shared clock; play all; play one alone; seek.
  - **Caption** under each clip: model, the inputs it was sent, the first-frame variant, cost, seconds, and the model that ran.
  - **Router lane:** `model: "auto"` with a requirements text and a price cap.
  - **Running lanes:** "Generate all" runs the lanes in parallel, each cost confirmed first.
- **Tests:** fitting per model, refusal paths, record round trip, clock drift under 1 frame over 10 seconds.
- **Acceptance:** the Sunday floor (see Milestones).

### MA-7, model spec database (done)

- One data-only spec per video model in `packages/core/src/specs/`: inputs and limits, combination rules, output, prompting (addressing syntax, rules from the guides, seed), camera (parameter or the guide's own words), pricing; every field sourced, every unknown `null` with a "not stated" note. See [model-specs.md](model-specs.md).
- **Acceptance:** every spec validates against `model-spec.schema.json`; every source URL is a Runware docs URL; each spec's inputs, durations, sizes, fps, prompt length, seed, camera values and rates agree with the saved schema fixture; `models.ts` agrees with the specs. All in `npm test`.

### MA-8, prompt composer and the record's shot (done)

- `compose()` turns one neutral shot (subject, action, camera move, references with roles, optional audio, focus and beats) into one prompt and request params per model, with warnings for what a model cannot take.
- Records may carry `shot`, and lanes `composed`; `run-lane --shot shot.json` composes the lane.
- **Acceptance:** snapshot per model, including a motion-transfer case that replaces the guide's placeholder figure with the character image; references numbered in each model's syntax; LTX gets `settings.cameraMovement` unless audio is attached; records with a shot validate by `parseRecord` and the JSON Schema.

### MA-9, `<model-specs>` (done)

- A second custom element: matrix of models against inputs, limits, camera, prompt syntax and price; a card per model with its rules and links to the model page, schema and guides; a live composer panel with copy buttons. Themable by `--ma-*`, no page overflow at 360 px.
- **Acceptance:** `tests/model-specs-element.test.ts`; `npm run smoke` checks the composer in Chrome.

### MA-10, character still (done)

- `npm run still` makes a still with FLUX.2 [klein] 9B or Kling IMAGE 3.0, text only or pose-matched to a reference (the guide's first frame). `run-lane --character` places it per model: beside the reference video on Kling, as `referenceImages` on Seedance and H3, refused on LTX and FLUX 3 Video.
- **Acceptance:** dry runs print tasks that validate against the saved image schemas; a fake-API run writes `still.png` and a cost row. A paid still (about $0.003 on klein) waits on approval.

### MA-11, browser smoke test and lint (done)

- `npm run smoke` drives headless Google Chrome against the dev server; `npm run lint` is ESLint with typescript-eslint.
- **Acceptance:** on `index.html`, `blog-demo.html` and `specs.html`, every lane video reaches `readyState >= 2` with a duration; Play all moves the clock and every video together (spread under 0.15 s); Play alone pauses the others; the composer renders a prompt per model and recomposes on input; no page errors.

### MA-3, keyframes from a clip (Fri 13 Nov, half a day, below the cut line)

- In `packages/core`: WebCodecs extraction of N frames at chosen times (first, last, beat positions from the bundle), returned as data URLs sized to each model's limit.
- Tests use a synthetic clip, checking timestamp-to-frame mapping and the count and size caps.
- Acceptance: the FLUX 3 Video lane runs with six keyframes at beat positions.

### MA-4, embed, layouts, capture mode, themes (Thu 12 Nov; layouts and themes done)

- **Layouts:** three-up landscape, 2×2 grid, one large plus a strip, portrait stack.
- **Embed:** `templates/embed.html`, one script tag plus a record URL.
- **Capture mode:** chrome off, fixed aspect, clips cued.
- **Themes:** CSS variables, with one provider look as a separate theme file. The core stays unbranded.
- **Acceptance:** the embed plays a four-lane record on a phone and a laptop; a second record swaps in by URL.

### MA-4b, generate it yourself and galleries (Fri 13 Nov, below the cut line; galleries done as record-set tabs)

- **Key panel** (PRD F10):
  - The key is held in memory or `sessionStorage` and sent only to the provider host.
  - A sign-up link for people without an account.
  - Per-lane rerun and "rerun all through the router", each with a price cap and a cost confirmation.
- **Gallery switcher** across records.
- **Serverless recipe:** `providers/runware-serverless/README.md` with a "deploy this workflow" recipe: the folder, then `runware auth login`, then one deploy command. Verify the exact CLI commands against Runware's docs before writing them.
- **Acceptance:**
  - a stranger reruns one lane of the published image-to-video record with their own key;
  - the key never appears in logs, network calls to other hosts, or storage beyond the session.

### Content plan: four records (Wed 11 to Sat 14 Nov)

Four records rather than more. Each record is **one neutral shot description** run through the composer, so every model gets the same intent in its own dialect and the record carries the shot (`record.shot`) beside the per-model prompts. Lanes: Kling 4.0, Seedance 2.5, MiniMax H3, LTX-2.5 Pro, FLUX 3 Video, with Kling 4.0 Flash where a cheaper Kling take is worth showing. Generic, unbranded subjects only: no real brand names or logos in prompts, stills or captions.

1. **Product, one object seen from several views** (Wed 11). A plain ceramic kettle on a turntable; reference images of the same object from three angles, camera `orbit`. Shows how each model holds one object across views, and where reference images are refused (LTX, FLUX).
2. **Clothing on a moving figure** (Wed 11). A plain linen jacket as a `garment` reference on a figure walking towards camera, camera `track-left`. Shows fabric motion and garment fidelity.
3. **Fast motion with a character sheet** (Thu 12). A character sheet still (front, side, back of one figure) as the `character` reference; the figure sprints and turns, camera `handheld`. Shows identity under fast motion.
4. **The mannequin guide with a character swap** (Thu 12). The Motion Studio mannequin guide as the `motion` reference plus a character still made by `npm run still`, pose-matched to guide frame 0; the composer writes "replace the mannequin with the character". Camera carried by the guide on Kling, written in words elsewhere, refused where a model takes no reference video (LTX: first frame plus audio instead).

Acceptance: four records in `examples/records/`, each with `shot`, real clips, cost and seconds per lane, and every lane's `composed` marker; each plays in `<model-arena>` and passes `npm run smoke`. Estimated spend, one take per lane at 5 s and 720p (LTX at its 6 s minimum), from the published rates: records 1-3 about $4.40 each with all six lanes, record 4 about $6.10 (video-input rates and H3's charge for 8 s of input video), so about $19 in all before retries, plus under a cent per klein still. To be approved before the first run.

### MA-5, Runware Serverless lane (stretch, only with Serverless access)

- Restore the container from camera-director `03a51ea7^` into `providers/runware-serverless/` and add the LTX Layout-to-Render workflow.
- One run from the guide, with cost recorded.
- If access does not come, the container is the "what I would build next" evidence.

### MA-6, examples and docs (Thu 12 to Sat 14 Nov)

- The four content records above in `examples/records/`; a README a stranger can follow in five minutes (done); a docs page per provider (done for Runware).

## Agent rules

- Builders are Opus at medium effort. UK English in docs.
- Read the PRD and this plan before writing code.
- A claim about a model's inputs is written only after its schema shows it.
- No paid call without the owner's approval. Every run is a row in `docs/costs.md`; every platform friction is a row in `docs/friction.md`.
- No key in logs, fixtures, screenshots or commits.
- Hand-back: branch, head SHA, what was verified by which command, what was not run, open questions.

## Order and cut lines

- **Done:** MA-0, MA-1 (bar its paid run), MA-2, MA-7 to MA-11.
- **Wed 11 to Thu 12:** spend approval, the MA-1 run, content records 1-4, the embed template.
- **Fri 13 to Sat 14:** MA-3 and MA-4b if time allows; otherwise they move to the next milestone (see the cut line under Milestones).
- **MA-5:** only with Serverless access.
