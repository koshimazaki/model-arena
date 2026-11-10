---
tags: [plan, model-arena, agents]
summary: Implementation plan for Model Arena as work packages MA-0 to MA-6, with files, tests and acceptance, for builder agents.
---

# Model Arena: implementation plan

Written 7 November 2026; state updated 10 November. Product scope is in [PRD.md](PRD.md). The cross-repo overview, covering both this repo and `motion-studio`, is kept privately by the owner. This file is the build plan for this repo.

## Milestones

| Date | State |
| --- | --- |
| Sun 8 Nov | MA-0, MA-1, MA-2 done. **This is the floor:** an existing guide clip through Kling 4.0, Seedance 2.5, MiniMax H3, LTX-2.5 and a router lane, playing together in the element |
| Mon 9 Nov | MA-3 keyframes; the FLUX 3 Video lane |
| Wed 11 Nov | MA-4: embed, layouts, capture mode, themes |
| Thu 12 Nov | Preview: repo public, README runnable in five minutes |
| Sat 14 Nov | Final for the first milestone |

## State on 10 November

Branch `feat/ma-floor`, not pushed. No paid run has been made: `docs/costs.md` has no rows, and the owner has not approved spend.

| Package | State |
| --- | --- |
| MA-0 schemas | Done (`cc18c35`) |
| MA-1 Runware provider and lane CLI | Built and tested against fake fetch (`cc18c35`); its acceptance run (one paid Kling 4.0 clip) is **not done**, waiting on spend approval |
| MA-2 element and lanes | Done for `three-up` (`cc18c35`) |
| Spec database | Done (`6224bbf`): seven models in `packages/core/src/specs/`, checked field by field against the schema fixtures by `tests/model-specs.test.ts`. See [model-specs.md](model-specs.md) |
| Prompt composer | Done (`c67b5ea`, `3f27d9d`): `compose()` in `packages/core/src/compose.ts` |
| Blog panels | Done with placeholder clips (`7374e25`, `8657f41`): `layout="arena"` and `layout="guidance"`, record sets as tabs, `blog-demo.html` |
| MA-3 keyframes | Not started |
| MA-4 embed, capture mode, themes | Partly: the build is one file (`dist/model-arena.js`); themes are `--ma-*` properties with the Runware blog tokens as defaults. `templates/embed.html` and capture mode are not built |
| MA-4b key panel, galleries | Galleries partly, as record-set tabs; the key panel is not built |
| MA-5, MA-6 | Not started |

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

### MA-3, keyframes from a clip (Mon 9 Nov, half a day)

- In `packages/core`: WebCodecs extraction of N frames at chosen times (first, last, beat positions from the bundle), returned as data URLs sized to each model's limit.
- Tests use a synthetic clip, checking timestamp-to-frame mapping and the count and size caps.
- Acceptance: the FLUX 3 Video lane runs with six keyframes at beat positions.

### MA-4, embed, layouts, capture mode, themes (Wed 11 Nov, one day)

- **Layouts:** three-up landscape, 2×2 grid, one large plus a strip, portrait stack.
- **Embed:** `templates/embed.html`, one script tag plus a record URL.
- **Capture mode:** chrome off, fixed aspect, clips cued.
- **Themes:** CSS variables, with one provider look as a separate theme file. The core stays unbranded.
- **Acceptance:** the embed plays a four-lane record on a phone and a laptop; a second record swaps in by URL.

### MA-4b, generate it yourself and galleries (Wed 11 Nov, with MA-4)

- **Key panel** (PRD F10):
  - The key is held in memory or `sessionStorage` and sent only to the provider host.
  - A sign-up link for people without an account.
  - Per-lane rerun and "rerun all through the router", each with a price cap and a cost confirmation.
- **Gallery switcher** across records.
- **Serverless recipe:** `providers/runware-serverless/README.md` with a "deploy this workflow" recipe: the folder, then `runware auth login`, then one deploy command. Verify the exact CLI commands against Runware's docs before writing them.
- **Acceptance:**
  - a stranger reruns one lane of the published image-to-video record with their own key;
  - the key never appears in logs, network calls to other hosts, or storage beyond the session.

### First records to publish (content plan)

1. **"Same image, five models" (the floor, low risk).** One still and one motion prompt per lab's guide, sent to Kling 4.0, Seedance 2.5, MiniMax H3, LTX-2.5 and FLUX 3 Video through the Runware API, plus a router lane. It is the blog-post and social-post comparison.
2. **"One mannequin guide, five ways in" (the depth piece, only if the first-frame test passes).** The Motion Studio guide via reference video, keyframes and audio.

### MA-5, Runware Serverless lane (stretch, only with Serverless access)

- Restore the container from camera-director `03a51ea7^` into `providers/runware-serverless/` and add the LTX Layout-to-Render workflow.
- One run from the guide, with cost recorded.
- If access does not come, the container is the "what I would build next" evidence.

### MA-6, examples and docs (Thu 12 Nov)

- Two published records in `examples/records/`; a README a stranger can follow in five minutes; a docs page per provider.

## Agent rules

- Builders are Opus at medium effort. UK English in docs.
- Read the PRD and this plan before writing code.
- A claim about a model's inputs is written only after its schema shows it.
- No paid call without the owner's approval. Every run is a row in `docs/costs.md`; every platform friction is a row in `docs/friction.md`.
- No key in logs, fixtures, screenshots or commits.
- Hand-back: branch, head SHA, what was verified by which command, what was not run, open questions.

## Order and cut lines

- **The floor:** MA-0 → MA-1 → MA-2, Sunday night.
- **Raising the ceiling:** MA-3 on Monday, MA-4 on Wednesday, MA-6 on Thursday.
- **MA-5:** only with Serverless access by Monday.
