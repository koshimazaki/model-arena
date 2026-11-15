---
tags: [developing, model-arena]
summary: A map of the repo, the checks to run, and how the demo media and demo records are made.
---

# Developing

## What is here

| Folder | What it holds |
| --- | --- |
| `blog/` | the published post: a static page, its player (`scenes.js`) and its posters. Clips load from R2 |
| `packages/element/` | `<model-arena>` and `<model-specs>`, the embeddable elements, and their themes |
| `packages/core/` | the record and guide-bundle schemas, the model specs and the prompt composer |
| `providers/` | provider adapters behind one interface. Runware is the first |
| `scripts/` | the CLIs (`run-lane`, `make-still`), the builds and the smoke tests |
| `site/` | the element-driven version of the post and its build |
| `docs/` | the PRD and plan, model specs, the Runware provider notes, costs, friction and deploy notes |

The post plays its clips with `blog/scenes.js` (three clips on one clock, Full view, prompts with changes marked). Folding that player into `<model-arena>` is the next step. [deploy.md](deploy.md) covers publishing the post and adding a clip.

## Checks

```sh
npm test            # vitest: schemas, specs against Runware's schemas, composer, provider, CLIs, elements
npm run typecheck
npm run lint
npm run smoke       # headless Google Chrome: every clip loads, Play all keeps one clock, the composer renders
npm run build       # dist/model-arena.js (both elements, one ES module) and dist/model-specs.json
```

`npm run smoke` expects Google Chrome at its macOS path; set `CHROME_PATH` elsewhere.

## Demo media

`npm run demo:placeholders` writes labelled placeholder clips and stills to `examples/media/placeholder/` (gitignored), which is all the demo pages need.

The real mannequin guide is not committed. If you have it, `npm run demo:media [dir]` copies it from `~/Downloads` (or `dir`) and, with ffmpeg, makes a 1280×720 copy (Kling 4.0 refuses reference videos under 700 px), a 1280×720 first frame and a WAV of its audio; `index.html` plays it.

## Demo records

The records in `examples/records/blog/` come from `npm run demo:records`, which runs neutral shot descriptions through the prompt composer: the prompts, inputs and camera parameters are real; the clips are placeholders and no cost is claimed.
