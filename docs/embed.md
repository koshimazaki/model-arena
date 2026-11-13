---
tags: [embed, model-arena, runware]
summary: How a host app vendors the embed bundle — the key panel, the generate flow (as a function or an element), the result player that follows a host clock, and the gallery — plus presets, theming tokens, the cost row and the command-line recipe.
---

# Embedding Model Arena in another app

Written 13 November 2026. `npm run build:embed` writes one ES module, `dist/embed/model-arena-embed.js` (about 223 kB, 63 kB gzipped), and its types (`dist/embed/model-arena-embed.d.ts` plus `dist/embed/types/`). Styles live in each element's shadow root, so there is no CSS file. Vendor the folder, load the file by a **relative** URL, and it works from any sub-path of a static host: no server, no absolute paths, no framework.

**Live path unverified.** Every check here runs against a fake provider (`npm test`, `npm run smoke`). No paid call has been made through the browser flow, and no real key has been used.

## What is in the bundle

| Part | What it is for |
| --- | --- |
| `<arena-key>` | The reader's own Runware key: a password field, memory by default, `sessionStorage` only behind "Remember for this tab". Mount it anywhere, such as a header |
| `generateFromGuide()` | The main entry: a guide bundle through one model, with progress events. Hosts draw their own controls around it |
| `offeredModels()`, `composePrompt()` | The models offered (Kling 4.0, Seedance 2.5, MiniMax H3, then LTX-2.5 marked "audio + first frame only") with each one's one-line note and prompting-guide link; the composed prompt for a shot, model and references |
| `imageModels()`, `imageFamilies()`, `generateImage()` | The image models for stills (character sheets, environment images) as data for a picker, flat or by family, and one call that makes an image with the reader's key. `planImage`, `runImage` and `RunwareClient` are exported for hosts that want the steps |
| `<arena-player>` | One output clip that follows the host's clock within a frame; muted by default; no controls with `controls="none"` |
| `<arena-gallery>` | Published records, playable without a key: reference images as a strip, the guide and one to three outputs on one playhead with their prompts, the guide's audio once |
| `<arena-generate>` | The all-in-one, built from the parts above, for hosts that want the whole flow |
| `<model-arena>` | The player the gallery and the generate result use; also usable directly |

## Three snippets

### 1. Parts: the host's own controls, the key panel in the header, the player on the host's clock

```html
<script type="module" src="vendor/model-arena/model-arena-embed.js"></script>
<arena-key id="key"></arena-key>
<arena-player id="result" controls="none"></arena-player>
<script type="module">
  import { generateFromGuide, offeredModels, composePrompt } from "./vendor/model-arena/model-arena-embed.js";

  const key = document.getElementById("key");
  const player = document.getElementById("result");
  const models = offeredModels();            // [{ key, name, use, line, guide: { title, url } }, ...]
  const shot = { subject: "A courier in a yellow raincoat", environment: "a rain-soaked crossing at dusk",
                 action: "runs along the path and leaps on the downbeat", legend: "The orange figure is the character" };
  const preview = composePrompt(shot, "kling-4", { character: true, environment: true }, { seconds: 5, hasAudio: true });
  // preview.prompt, preview.tags ([{ tag: "<<<image_1>>>", input: "character" }, ...]), preview.dropped, preview.notes

  async function run(bundleFiles, character, environment) {
    const r = await generateFromGuide({
      guide: bundleFiles,                    // FileList, File[] or { "bundle.json": Blob, "guide.mp4": Blob, ... }
      model: "kling-4",
      shot,                                  // or omit: recipe.json's "shot" is the default
      references: { character, environment },// Blobs, both optional
      maxPrice: 2,
      key,                                   // the panel itself: read by reference, at request time
      confirm: (q) => window.confirm(`Spend up to $${q.usd.toFixed(2)} on ${q.modelName}?`),
      onProgress: (p) => console.log(p.stage, p.message),
    });
    player.setAttribute("src", r.videoURL);
    return r.record;                         // a one-lane record for the gallery
  }

  // Every frame of the host's own playhead:
  function onHostFrame(t) { player.currentTime = t; }
</script>
```

### 2. All in one, opened with an example already loaded

```html
<script type="module" src="vendor/model-arena/model-arena-embed.js"></script>
<arena-key id="key"></arena-key>
<arena-generate key-panel="key" preset="examples/preset.json" max-price="2"></arena-generate>
```

`preset.json` (URLs relative to the preset file):

```json
{ "bundle": "media/guide-bundle/",
  "references": { "character": "media/character.png", "environment": "media/environment.png" },
  "shot": { "subject": "…", "environment": "…", "action": "…", "legend": "…" },
  "model": "kling-4" }
```

### 3. The gallery, and "Run this yourself"

```html
<arena-gallery src="runs/index.json" generate="gen"></arena-gallery>
<arena-generate id="gen" key-panel="key"></arena-generate>
<script type="module">
  const gallery = document.querySelector("arena-gallery");
  document.getElementById("gen").addEventListener("arena-gallery-add", (e) => gallery.add(e.detail.record, e.detail.base));
</script>
```

`runs/index.json` is an array of records or of record URLs (relative to the list), or `{ "records": [...] }`. Media in a record resolve against the record's URL. With no records it shows "No published runs yet". "Run this yourself" turns the record back into a preset and loads it into the element named by `generate`.

## Image models and `generateImage`

`imageFamilies()` returns the families in a fixed order, each with its models: FLUX (FLUX.2 [klein] 9B, FLUX 3 Image, FLUX 3 Image Klein), OpenAI GPT Image (GPT-Image-2.6 Flare, Sunburst), MiniMax H3 (H3 Image, H3 Image Highspeed), ByteDance Seedream (5.5), Kling IMAGE (3.0). `imageModels()` is the same list, flat. Each entry is plain data: `key`, `name`, `air`, `family`, `provider`, `maker`, `accepts` (`text`, `referenceImages` with `max` and the per-image limits, `transparent`, `outputFormats`, `notOffered`), `prompt` limits, `size` (`rule`, a one-line `summary`, `default`), `estimate` for a text-to-image still at the default size, and `pricing` (`kind`, `summary`, `source`, `read`). Facts and prices per model: [providers/runware-api.md](providers/runware-api.md#character-stills-image-inference).

`generateImage()` mirrors `generateFromGuide()`: the key by reference (a string, a getter or the `<arena-key>` panel), a refusal over `maxPrice`, `confirm` with the same cost question before anything is uploaded, and the same `GenerateError` codes. `references` are Blobs (PNG, JPEG or WebP; a File keeps its name), https URLs, or `{ blob, src, name }`, checked against the model's count and size limits before any upload. A reference is never resized or dropped: one the model cannot take is refused (`refused`, naming the limit and how to fix the image). The result notes say so plainly, and also say when the output size was fitted from a reference and when a URL's size could not be checked here. Token-priced models (GPT-Image-2.6, H3 Image) have no estimate, so a run on them is refused with `no-estimate`.

```js
import { imageFamilies, generateImage } from "./vendor/model-arena/model-arena-embed.js";

const families = imageFamilies();          // [{ family: "FLUX", models: [{ key, name, accepts, size, estimate, ... }] }, ...]
const r = await generateImage({
  model: "seedream-5.5",
  prompt: "A character sheet of a courier in a yellow raincoat: front, side and back, plain grey background.",
  references: [sketchFile],                // Blobs or https URLs; optional
  size: { resolution: "2K" },              // or { width, height }; omit for the default or the reference's size
  maxPrice: 0.1,
  key: document.getElementById("key"),
  confirm: (q) => window.confirm(`Spend up to $${q.usd.toFixed(3)} on ${q.modelName}?`),
});
// r.imageURL (Runware keeps it about 7 days), r.costUsd, r.taskUUID, r.modelRan, r.estimate, r.inputsSent, r.notes, r.costRowText
// Feed it back as a reference: pass r.imageURL to generateImage, or fetch it into a Blob for
// generateFromGuide({ references: { character } }); whether the image host allows a browser fetch is not checked yet.
```

## The guide bundle and the shot

The bundle is the Motion Studio manifest form (schema 0.5.0): `bundle.json`, `meta.json`, `beats.json`, the guide `.mp4`, frame 0, optional audio and `recipe.json`. If `recipe.json` carries `shot: { subject, environment, action, legend }`, that is the default shot. Media facts (size, fps, length) come from `meta.json`.

What each model gets, read from the schema fixtures in `tests/fixtures/runware-schemas/`:

| Model | Guide | Audio | Reference images beside the guide | Tags |
| --- | --- | --- | --- | --- |
| Kling 4.0 | `referenceVideos` (3-30 s, 700-4553 px, 24-60 fps) | none | up to 10 (frame plus reference images), character then environment | `<<<video_1>>>`, `<<<image_1>>>`, `<<<image_2>>>` |
| Seedance 2.5 | `referenceVideos` (2-30 s) | `referenceAudios` | up to 30 | `@Video1`, `@Image1`, `@Image2`, `@Audio1` |
| MiniMax H3 | `referenceVideos` (2-15 s) | `referenceAudios` while clip plus audio fit 15 s together (schema x-constraints). Over that (an 8 s guide with 8 s of audio), the guide video goes alone and the result and caption say "Music not sent to MiniMax H3: video and audio together may not exceed 15 s; timing comes from the guide video"; `inputsSent` lists no audio. Only `requireAudio: true` (CLI `--require-audio`) refuses instead. The rule lives in `fit.ts`, so the CLI behaves the same | up to 9 (12 files in all) | "Video 1", "Image 1", "Image 2" |
| LTX-2.5 Pro | not used | `inputs.audio` drives the clip (2-10 s) | exactly one image: frame 0, the character sheet or the environment image; both is refused | none |

**Camera.** With no `camera` in the shot, the camera comes from the guide video, in each model's reference wording: Kling "Reference only the motion, camera path and pacing of `<<<video_1>>>`", Seedance opens with "Camera: follow the camera move of `@Video1`", and MiniMax's "Video 1 is the motion reference: follow its body motion, timing and camera move". A neutral move in `shot.camera` overrides this on Seedance and H3. LTX-2.5 sees no guide video and gets no camera words.

**Reference images** are checked before any upload: PNG, JPEG or WebP whose header gives the size, then each model's limits from its schema fixture (Kling and Seedance at least 300 px a side, H3 256 px; aspect 0.4-2.5; 30 MB). A refusal names the model and the limit, and says how to fix the image (resize, crop or re-save).

A free-text prompt (`prompt`) replaces the composed one; the lane then has no `composed` marker. Refusals come back as `GenerateError` with a code: `bad-bundle`, `refused` (an input the model cannot take, with the reason), `over-price`, `no-estimate`, `not-confirmed`, `invalid-key`, `timeout` (with `taskUUID`; poll it, do not resubmit), `aborted` (says whether the task may still be billed), `provider`.

## Element reference

| Element | Attributes | Properties and methods | Events |
| --- | --- | --- | --- |
| `<arena-key>` | `signup-url`, `theme` | `connected`, `getKey()`, `connect(key, remember?)`, `disconnect()` | `arena-key-change` `{ connected, remembered }` (never the key) |
| `<arena-player>` | `src`, `controls="none"`, `muted="false"`, `fps`, `label`, `theme` | `currentTime` (set every frame), `follow(t)`, `seek(t)`, `play()`, `pause()`, `muted`, `duration`, `paused`, `video` | `arena-player-ready` `{ duration }`, `arena-player-error` |
| `<arena-generate>` | `subject`, `environment`, `action`, `legend`, `prompt`, `model`, `max-price`, `guide-src`, `preset`, `key-panel`, `theme` | `guide`, `references`, `preset`, `loadPreset(p, base?)`, `whenReady()`, `fetch`, `pollOptions`, `confirm` | `arena-generate-progress`, `arena-generate-result`, `arena-generate-error` `{ code, message }`, `arena-gallery-add` `{ record, base }` |
| `<arena-gallery>` | `src`, `generate`, `theme` | `records`, `add(record, base?)` | `arena-run-yourself` `{ preset, record }` |
| `<model-arena>` | `src`, `layout` (`inputs`, `guidance`, `arena`, `three-up`), `tab`, `model`, `theme` | `record`, `setRecord(record, base?)` | |

The key is never an attribute, never in the DOM, an event, a URL, a log line or a record, and is sent only to `api.runware.ai`. `tests/generate.test.ts`, `tests/embed-elements.test.ts` and the smoke run check this with a fake fetch.

## Theming

Every colour, radius and font is a custom property with neutral defaults. Set them on the elements from the host page; outer rules win over the elements' own defaults, and nested elements inherit them.

| Token | Default (dark) | Used for |
| --- | --- | --- |
| `--ma-bg` | `#18181b` | screens, inner panels |
| `--ma-card` | `#1f1f23` | element background |
| `--ma-fg` | `#f4f4f5` | text |
| `--ma-muted` | `#a1a1aa` | secondary text |
| `--ma-line` | `#3f3f46` | borders |
| `--ma-input` | `#27272a` | fields, buttons |
| `--ma-chip` | `#2e2e33` | badges, menus |
| `--ma-accent` | `#e4e4e7` | primary buttons, focus, selection, playhead |
| `--ma-accent-fg` | `#18181b` | text on the accent |
| `--ma-warn` | `#fbbf24` | errors and refusals |
| `--ma-ok` | `#86efac` | the connected dot |
| `--ma-radius`, `--ma-radius-lg` | `7px`, `12px` | corners |
| `--ma-gap` | `8px` | grid gaps |
| `--ma-font`, `--ma-mono` | system UI, system mono | type |

`theme="light"` forces the light set; `theme="auto"` follows the reader. A lime-on-dark host:

```css
arena-key, arena-player, arena-generate, arena-gallery {
  --ma-accent: var(--host-accent); --ma-accent-fg: #10130b; --ma-bg: #14160f; --ma-card: #181a13;
}
```

## Costs: every real run is a row

A browser run cannot write to `docs/costs.md`, so the result carries the row: `result.costRow` (the fields) and `result.costRowText` (the table line, status `ok (browser)`), also shown under the result as "Cost row for docs/costs.md". Paste it into `docs/costs.md` after any real run. The columns map as: date, model asked (`plan.modelId`), model ran, task UUID, duration (or "audio length" for LTX), resolution, inputs (roles joined by `+`), estimate, cost (`includeCost`), seconds, output URL (Runware keeps it about 7 days), status.

## The same flow from the command line

`npm run lane -- --bundle <dir>` uses the same planner as the element, so for the same files it sends the same task (`tests/embed-parts.test.ts` compares the two for Kling, Seedance and H3 with both reference images). The agent recipe, three steps:

1. **Script.** Write the shot: `{ "subject", "environment", "action", "legend" }`, into the sibling app's `recipe.json`, or a separate `shot.json`.
2. **Bundle.** Export the guide bundle with the sibling app's own command-line export (see that repository; nothing here calls it).
3. **One lane per model.**

```sh
npm run lane -- --model kling-4 --bundle path/to/bundle --character sheet.png --environment place.png --dry-run
# prints the composed prompt, the inputs, the estimate and the exact task; sends nothing
RUNWARE_API_KEY=... npm run lane -- --model kling-4 --bundle path/to/bundle --character sheet.png --environment place.png --max-price 1.50
# then seedance-2.5 and h3; ltx-2.5 takes at most one of the two images
```

A real run needs the owner's spend approval, `--max-price` and a typed confirmation, and appends its own row to `docs/costs.md`.

## Building and checking

```sh
npm run demo:embed     # placeholder bundle, reference images and a fake result clip (ffmpeg), gitignored
npm run build:embed    # dist/embed/model-arena-embed.js and its types
npm run smoke          # includes examples/embed.html from the built file, served statically under a sub-path
```
