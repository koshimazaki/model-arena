# Model Arena

A drop-in web component that plays video-model outputs side by side on one clock, runs them with your own key, and shows exactly what each model was given and what it cost.

Status: first milestone in progress (10 November 2026). The element plays records; `<model-specs>` shows what each video model takes, how you prompt it and how you move its camera; a Node CLI runs one lane, or makes a character still, through the Runware API. No paid run has been made yet.

- [Product requirements](docs/PRD.md) · [Implementation plan](docs/plan.md)
- [Model specs: the format and how to add a model](docs/model-specs.md)
- [Runware provider: inputs, prices, camera parameters, character stills](docs/providers/runware-api.md)
- [Costs of every paid run](docs/costs.md) · [Platform friction log](docs/friction.md)

Companion repo: **motion-studio**, which makes guide clips. Model Arena reads its guide bundles (`packages/core/schema/guide-bundle.schema.json`); the two share files, not code.

## Five minutes, no key

You need Node 24 (`nvm use 24`) and ffmpeg (for the placeholder clips). Nothing here sends a request or needs a key.

```sh
npm install
npm run demo:placeholders   # labelled placeholder clips and stills in examples/media/placeholder/ (gitignored)
npm run dev                 # Vite on http://localhost:5173
```

Then open:

- **http://localhost:5173/specs.html**: the spec matrix, a card per model with links to its Runware API page and guides, and the composer. Type one shot description, pick a camera move, and read each model's prompt and request params side by side.
- **http://localhost:5173/blog-demo.html**: the `arena` and `guidance` layouts playing placeholder clips on one clock.

A dry run prints exactly what a paid run would send, and sends nothing:

```sh
# One lane: the composer writes Seedance's prompt from a neutral shot (guide video plus a character still).
npm run lane -- --model seedance-2.5 --shot examples/shots/motion-swap.json \
  --guide examples/media/placeholder/guide.mp4 --character examples/media/placeholder/inputs/character.png --dry-run

# A character still with FLUX.2 [klein] 9B, pose-matched to the guide's first frame.
npm run still -- --model klein-9b --reference examples/media/placeholder/inputs/first-frame.png \
  --prompt "A figure in a plain grey jumpsuit, in exactly the pose and framing of the reference image." --dry-run
```

Checks:

```sh
npm test            # vitest: schemas, specs against Runware's schemas, composer, provider, CLIs, elements
npm run typecheck
npm run lint
npm run smoke       # headless Google Chrome: every clip loads, Play all keeps one clock, the composer renders
npm run build       # dist/model-arena.js (both elements, one ES module) and dist/model-specs.json
```

`npm run smoke` expects Google Chrome at its macOS path; set `CHROME_PATH` elsewhere.

The real mannequin guide is not committed. If you have it, `npm run demo:media [dir]` copies it from `~/Downloads` (or `dir`) and, with ffmpeg, makes a 1280×720 copy (Kling 4.0 refuses reference videos under 700 px), a 1280×720 first frame and a WAV of its audio; `index.html` plays it.

## Embed

```html
<script type="module" src="model-arena.js"></script>
<model-arena src="records/mannequin-five-models.json" layout="three-up"></model-arena>
<model-specs models="kling-4,seedance-2.5,h3,ltx-2.5,flux-3-video"></model-specs>
```

`<model-specs>` takes `models` (spec ids, default all seven) and `view` (`matrix`, `cards` or `composer` to show one part only). A record may carry `shot`, the one neutral description its lanes' prompts were composed from; captions then show the intent behind every per-model prompt.

Media paths in a record resolve against the record's URL; a record set's tab paths resolve against the set's URL. `npm run build` writes the element as one file, `dist/model-arena.js`.

Layouts:

- `arena`: the same shot from several models. The reader picks 2-5 models and a layout, swaps any tile's model from its menu, and plays all or one alone. `src` may be a record set, shown as test tabs.
- `inputs`: the reference images as a strip, the guide and one to three outputs on one playhead with their prompts, the guide's audio once.
- `guidance`: the Motion Studio guide beside one model's output on one clock, how that model is steered (camera parameter, guide video or prompt words), what it received and its composed prompt. `model="<lane id>"` picks the first lane shown.
- `three-up` (default): every lane with its full caption.

The element fills its container's width and collapses to one column below 640 px. Colours, fonts and radii are `--ma-*` custom properties with neutral defaults (the dark lime look is `packages/element/themes/dark-lime.css`); `theme="auto"` follows the reader's light or dark setting.

## Embed in another app

`npm run build:embed` writes one file, `dist/embed/model-arena-embed.js`: a key panel, the generate flow as a function and as an element, a player that follows a host clock, and a gallery. See [docs/embed.md](docs/embed.md); `examples/embed.html` shows all of it against a fake provider (`npm run demo:embed` first).

## Blog demo records

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

Models: `kling-4`, `kling-4-flash`, `seedance-2.5`, `h3`, `ltx-2.5`, `ltx-2.5-fast`, `flux-3-video`, and `auto` (the router, with `--requirements`). `npm run lane -- --help` lists every flag.

- `--shot shot.json` lets the composer write the prompt, camera parameter and duration for that model; the run's record keeps the shot.
- `--character still.png` sends a still that replaces the guide's figure: a reference image beside the guide on Kling, Seedance, H3 and the router, never a frame image. LTX and FLUX 3 Video refuse it.
- `npm run still -- --model klein-9b|kling-image-3 --prompt ... [--reference frame0.png] --max-price 0.05` makes that still; same refusals, confirmation and cost row as a lane.

## Your key

The key is read from `RUNWARE_API_KEY` by the CLI, and held in memory (or `sessionStorage` if asked) in the browser. It is sent only to `api.runware.ai` and is never logged or written to a record.

Licence: MIT.
