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
