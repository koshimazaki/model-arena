---
tags: [provider, runware, model-arena]
summary: How the Runware API provider builds, prices and runs a lane; per-model inputs and camera parameters as read from each schema on 10 Nov 2026.
---

# Runware API provider

Code: `providers/runware-api/` (`models.ts` facts per model, `task.ts` builds the task, `client.ts` talks to `https://api.runware.ai/v1`, `poll.ts` polls `getResponse`, `key.ts` holds the browser key).

Every fact below was read from the model's published schema on 10 November 2026 at `https://runware.ai/docs/models/<slug>/schema.json`. The slug comes from `https://runware.ai/docs/models/index.json`; the AIR id does not work in that path. Copies of the schemas live in `tests/fixtures/runware-schemas/`, and every task the builder makes is validated against them in `tests/runware-task.test.ts`. Refresh them with `sh scripts/fetch-schemas.sh`.

## How a local file reaches the API

Video and audio inputs take a **media UUID or a URL** only. A local file is sent first as a `mediaStorage` task (`operation: "upload"`, `media: "data:video/mp4;base64,…"`), which returns a `mediaUUID`; the lane's task then carries that UUID. Images could go inline as data URIs, but the provider uploads them the same way so the printed task stays readable. An `https://` URL is passed through untouched. The CLI and the browser use the same code; only how the bytes are read differs.

## Run flow

1. Upload each local file (`mediaStorage`).
2. `POST` the `videoInference` task with `deliveryMethod: "async"` and `includeCost: true`.
3. Poll `getResponse` by `taskUUID`: first poll after 5 s, then every 2 s growing to 15 s, for up to 45 min. Never resubmit; resume with the same UUID.
4. The success row carries `videoURL` and `cost` (USD). Output URLs are kept for 7 days by default.
5. Model that ran: the named model for a named lane. For the router lane, `getTaskDetails` is read back (the response has no `model` field; see `docs/friction.md`).

Failed generations are not charged (pricing page).

## Models

| Lane key | AIR | Inputs used by the lane | Duration | Resolution | Start frame beside reference video? |
| --- | --- | --- | --- | --- | --- |
| `kling-4` | `klingai:kling-video@4.0` | `referenceVideos` (≤5, each 3-30 s, ≥700 px a side, 24-60 fps), optional `frameImages` first | 3-30 s | `720p`, `1080p` | Yes (`first-frame+reference-videos` mode) |
| `kling-4-flash` | `klingai:kling-video@4.0-flash` | As Kling 4.0, reference videos 3-20 s; `frameImages` first only | 3-20 s | 720p only, no `resolution` field (size follows the input) | Yes |
| `seedance-2.5` | `bytedance:seedance@2.5` | `referenceVideos` (≤10, 2-30 s), `referenceAudios` (≤10), still as `referenceImages` | 4-30 s or `auto` | `480p`, `720p`, `1080p` | No: still goes in as `referenceImages` |
| `h3` | `minimax:h3@0` | `referenceVideos` (≤3, 2-15 s each, 15 s total), `referenceAudios` (≤3, needs an image or video reference), still as `referenceImages` | 4-15 s | `768p`, `1440p` | No: still goes in as `referenceImages` |
| `ltx-2.5` | `lightricks:ltx@2.5-pro` | Audio mode: `inputs.audio` (2-10 s) plus exactly one `referenceImages`; no duration. Otherwise `frameImages` first. No reference video. | 6, 8, 10 s or `auto` | width/height 1280×720 or 1920×1080 (audio mode: 1920×1080 only) | n/a |
| `ltx-2.5-fast` | `lightricks:ltx@2.5-fast` | As Pro; audio 2-20 s | 6-20 s, even | as Pro (the schema also lists 2K and 4K; the lane offers 720p and 1080p) | n/a |
| `flux-3-video` | `bfl:flux@3-video` | `frameImages` (≤10, `first`/`last` or a frame index); `video` is extension only, so the guide clip is refused | 5-20 s or `auto` | `720p`, `1080p` | n/a |
| `auto` | `auto` | Whatever the lane sends; `routing.maxPrice` (required here), `routing.requirements` | as sent | not sent; describe in `requirements` | The router lane sends the still as `referenceImages` |

Prompt tokens: Kling uses `<<<video_1>>>` / `<<<image_1>>>`; Seedance uses `@Video1`, `@Image1`, `@Audio1`.

## Camera-control parameters

| Model | Camera parameters in the schema |
| --- | --- |
| Kling VIDEO 4.0 | None |
| Seedance 2.5 | None (`settings` has `audio`, `draft`, `operation`) |
| MiniMax H3 | None (`settings.promptExpansion` only) |
| LTX-2.5 Pro / Fast | `settings.cameraMovement`: `dolly_in`, `dolly_out`, `dolly_left`, `dolly_right`, `jib_up`, `jib_down`, `static`, `focus_shift`. Forbidden beside `inputs.audio`. |
| FLUX 3 Video | None (`settings` has `audio`, `draft`, `safetyTolerance`) |

Elsewhere, describe the camera in the prompt. The CLI's `--camera` refuses on models without the parameter.

## Prices used for estimates (`x-pricing`, USD per output second)

- Kling 4.0: 720p $0.157 (no video input) / $0.188 (video input); 1080p $0.235 / $0.282.
- Seedance 2.5: text/image 480p $0.1025, 720p $0.2304, 1080p $0.61354; video-to-video 480p $0.1313, 720p $0.2953, 1080p $0.73415.
- MiniMax H3: 768p $0.08, 2K $0.13, plus $0.13 per second of uploaded input video, plus $0.04 per image beyond five.
- LTX-2.5 Pro: 720p $0.12, 1080p $0.17. Fast: $0.09 / $0.13 (2K $0.19, 4K $0.30).
- FLUX 3 Video: 720p $0.17, 1080p $0.29 (text/image to video).

An `auto` duration is estimated at the model's longest clip. The router lane's estimate is its `maxPrice`.

## The key

The browser key panel (MA-4b) uses `KeyStore`: memory by default, `sessionStorage` only on request, never `localStorage`. The CLI reads `RUNWARE_API_KEY` and nothing else. `RunwareClient` sends the key only to `https://api.runware.ai/v1` and redacts it from error text. CORS on `api.runware.ai` was re-checked on 10 Nov: the preflight allows any origin and the `Authorization` header.

## A character in place of the guide's figure

`--character <png>` sends a still that replaces the guide's placeholder figure. It is always a reference image, never a frame image, and comes first among the reference images so the composer's numbering holds:

| Lane | Where the character goes | Addressed as |
| --- | --- | --- |
| Kling 4.0 / Flash | `inputs.referenceImages`, beside `referenceVideos` | `<<<image_1>>>`, or `<<<image_2>>>` when a first frame is also sent (images are numbered across `frameImages` then `referenceImages`) |
| Seedance 2.5 | `inputs.referenceImages` | `@Image1` |
| MiniMax H3 | `inputs.referenceImages` | "Image 1" |
| Router | `inputs.referenceImages` | as the chosen model |
| LTX-2.5, FLUX 3 Video | refused: no reference image beside a guide; pass the still as `--first-frame` | |

`--shot shot.json` lets the composer write the prompt, camera parameter and duration for the lane (see `examples/shots/motion-swap.json`); the run's record keeps the shot. The CLI refuses when the shot uses a reference whose flag is missing.

## Character stills (image inference)

`npm run still` (`scripts/make-still.ts`; table in `providers/runware-api/image-models.ts`, planner in `image.ts`) runs `imageInference`. Each row is read from the model's `schema.json` (fixtures in `tests/fixtures/runware-schemas/`); klein 9B and Kling IMAGE 3.0 on 10 Nov 2026, the rest on 13 Nov 2026. Every model takes text to image. Families are for a two-step picker.

| Family | Key | AIR | References | Size | Transparent | Price (`x-pricing`) |
| --- | --- | --- | --- | --- | --- | --- |
| FLUX | `klein-9b` | `runware:400@2` | up to 4, aspect 1:8 to 8:1 | 128-2048 px, multiples of 16; defaults to the reference's size, snapped | no | compute time; estimate bounded by the highest published example, $0.00338 |
| FLUX | `flux-3-image` | `bfl:flux@3-image` | up to 10, each at least 128 px a side | 60 fixed pairs in 0.75K/1K/2K/4K tiers (default 1360×768); with a reference, `resolution` 0.75K-4K (default 1K) or a listed pair | no | per image: 0.75K $0.041, 1K $0.048, 2K $0.10, 4K $0.607 |
| FLUX | `flux-3-image-klein` | `bfl:flux@3-image-klein` | up to 4, each at least 16 px | 128-4096 px, multiples of 16 | no | compute time; bounded by the measured run at or above the area (16 steps: 1024² $0.006 ... 4096² $0.1013); with references, by the highest reference example ($0.0149) up to 1.57 MP and no estimate above |
| OpenAI GPT Image | `gpt-image-2.6-flare`, `gpt-image-2.6-sunburst` | `openai:gpt-image@2.6-flare`, `@2.6-sunburst` | up to 16, each up to 50 MB | 16-3840 px, multiples of 16, 0.66-8.29 MP, aspect 1:3 to 3:1 | yes (PNG or WEBP) | per token: $5 text in, $8 image in, $30 image out per 1M: no published bound; runs with `--allow-unpriced` |
| MiniMax H3 | `h3-image`, `h3-image-highspeed` | `minimax:h3@image`, `minimax:h3@image-highspeed` | up to 16, 128-8192 px, aspect 1:4 to 4:1, up to 64 MB | 468-7745 px, 0.66-20 MP, aspect 1:3 to 3:1, or `resolution` 1K/2K/4K | no | per token (image out $3.80 / $7.60 per 1M): about $0.024 for a still up to about 4 MP with a short prompt, an estimate from the page's approximate token counts plus 25% |
| ByteDance Seedream | `seedream-5.5` | `bytedance:seedream@5.5` | up to 10, at least 15 px, aspect 1:16 to 16:1, up to 30 MB and 36 MP | 256-16383 px, 0.92-4.62 MP, aspect 1:16 to 16:1, or `resolution` 1K/1.5K/2K | yes (PNG or WEBP) | per image: up to 2.61 MP $0.02, above $0.035; + $0.008 per input image |
| Kling IMAGE | `kling-image-3` | `klingai:kling-image@3` | exactly one | without a reference, one of 16 fixed pairs (default 1360×768); with one, `resolution` 1K or 2K and the reference's aspect | no | $0.028 per image |

- **Token-priced models** (`image-tokens.ts`). *H3 Image and Highspeed:* the model pages (13 Nov 2026) give approximate counts: up to about 4 MP about 4,100 image tokens, 4K about 16,400, about 2,050 per reference, and the rewritten prompt billed as text. These counts explain only 50-89% of each published example's price; the rest is the rewrite, whose length is not published. The estimate therefore allows the most rewrite text tokens any example of the same mode implies (H3 about 1,430 without references and 9,350 with two; Highspeed about 4,800 and 13,400), adds the prompt's bytes, then 25%. It is labelled an estimate, covers every published example, and runs under `--max-price` with no flag. Custom sizes above 4K (5472×3072) have no figure and need `--allow-unpriced`. *GPT-Image-2.6:* no token count is published, so a real run needs `--allow-unpriced` and `--max-price` is compared with the highest published example (Flare $0.193, Sunburst $0.192). `--quality` (auto by default, then low to max) sets its output tokens. The cost row keeps the cost Runware reports (`includeCost`).
- **Not sent** although the schema has them: GPT's `maskImage` and `markupImage` edits, SVG and GIF output, `quality` and `thinkingLevel`; FLUX 3 bounding boxes; Seedream layer decomposition. Each model lists these in `notOffered`.
- **Sizing from a reference:** with no size given, grid models take the first reference's size, scaled into the area range and snapped; if that cannot fit (an extreme aspect), the default 1280×720 is used and a note says so. References themselves are never resized.

Options: `--reference` (repeat for several), `--width`/`--height` or `--resolution`, `--transparent`, `--format PNG|JPG|WEBP`. Pose-matching: pass the guide's first frame as `--reference` and say in the prompt that the figure keeps its pose and framing. The output is fetched from `imageURL` and saved as `runs/<date>-still-<model>-<id>/still.<format>`, with a row in `docs/costs.md`.
