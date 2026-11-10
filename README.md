# Model Arena

A drop-in web component that plays video-model outputs side by side on one clock, runs them with your own key, and shows exactly what each model was given and what it cost.

Status: first working slice (MA-0 to MA-2). The element plays a record; a Node CLI runs one lane through the Runware API.

- [Product requirements](docs/PRD.md) · [Implementation plan](docs/plan.md)
- [Runware provider: inputs, prices, camera parameters](docs/providers/runware-api.md)
- [Costs of every paid run](docs/costs.md) · [Platform friction log](docs/friction.md)

Companion repo: **motion-studio**, which makes guide clips. Model Arena reads its guide bundles (`packages/core/schema/guide-bundle.schema.json`); the two share files, not code.

## Run it

Node 24 (`nvm use 24`).

```sh
npm install
npm run demo:media   # copies the mannequin placeholder clips into examples/media/ (gitignored)
npm run dev          # demo page plays examples/records/mannequin-placeholder.json
npm test             # vitest
npm run typecheck
npm run build        # dist/model-arena.js, one ES module
```

Demo media is not committed. `examples/media/` is gitignored; `npm run demo:media [dir]` copies the three mannequin files from `~/Downloads` (or `dir`) and, with ffmpeg, makes a 1280×720 copy of the guide (Kling 4.0 refuses reference videos under 700 px), a 1280×720 first frame and a WAV of the guide's audio.

## Embed

```html
<script type="module" src="model-arena.js"></script>
<model-arena src="records/mannequin-five-models.json" layout="three-up"></model-arena>
```

Media paths in a record resolve against the record's URL; a record set's tab paths resolve against the set's URL. `npm run build` writes the element as one file, `dist/model-arena.js`.

Layouts:

- `arena`: the same shot from several models. The reader picks 2-5 models and a layout, swaps any tile's model from its menu, and plays all or one alone. `src` may be a record set, shown as test tabs.
- `guidance`: the Motion Studio guide beside one model's output on one clock, how that model is steered (camera parameter, guide video or prompt words), what it received and its composed prompt. `model="<lane id>"` picks the first lane shown.
- `three-up` (default): every lane with its full caption.

The element fills its container's width and collapses to one column below 640 px. Colours, fonts and radii are `--ma-*` custom properties (defaults: the Runware blog's dark tokens); `theme="auto"` follows the reader's light or dark setting.

## Blog demo, no key

```sh
npm run demo:media          # optional: the real mannequin guide from ~/Downloads
npm run demo:placeholders   # labelled placeholder clips and inputs in examples/media/placeholder/
npm run dev                 # then open http://localhost:5173/blog-demo.html
```

The records in `examples/records/blog/` come from `npm run demo:records`, which runs neutral shot descriptions through the prompt composer: the prompts, inputs and camera parameters are real; the clips are placeholders and no cost is claimed.

## Run one lane (paid)

```sh
# 1. Look at exactly what would be sent. Sends nothing, needs no key.
npm run lane -- --model kling-4 --duration 5 \
  --prompt "The mannequin from <<<video_1>>> performs the same motion beside two fruits on a wooden table, soft studio light, locked-off camera." \
  --guide examples/media/mannequin-two-fruits-guide-1280x720-24fps.mp4 --dry-run

# 2. Run it. Refuses without --max-price, or when the estimate is over it; asks you to type yes.
RUNWARE_API_KEY=... npm run lane -- <same flags, without --dry-run> --max-price 1.50
```

A run writes `runs/<date>-<model>-<uuid>/` (gitignored) with the plan, the task as sent, the inputs, `output.mp4` and a one-lane `record.json`, and appends a row to `docs/costs.md`. Open it in the demo with `?record=/runs/<folder>/record.json`. If polling stops, resume with `--resume <taskUUID>` and the same flags; never resubmit, because that bills a second generation.

Models: `kling-4`, `seedance-2.5`, `h3`, `ltx-2.5`, `ltx-2.5-fast`, `flux-3-video`, and `auto` (the router, with `--requirements`). `npm run lane -- --help` lists every flag.

## Your key

The key is read from `RUNWARE_API_KEY` by the CLI, and held in memory (or `sessionStorage` if asked) in the browser. It is sent only to `api.runware.ai` and is never logged or written to a record.

Licence: MIT.
