---
tags: [prd, model-arena]
summary: Product requirements for Model Arena, a drop-in web component that plays video-model outputs side by side on one clock, runs them with the user's own key, and records what each model was given.
---

# Model Arena: product requirements

Status: planning, 7 November 2026. Owner: Koshi.

## One line

Drop one script tag into a page and readers see several video models' takes on the same input, side by side, on one clock. Each clip shows what the model was given, what it cost and how long it took.

## Problem

Model comparisons are usually screen recordings stitched from separate tools. Readers cannot replay them in sync, cannot see which inputs each model actually received, and never see the cost. Teams that post about new models every week need a reusable, embeddable comparison they can drop into a blog post or landing page. Developers evaluating models need to rerun a comparison with their own key.

## Users

- **DevRel and content teams** posting model comparisons on blogs, socials and docs.
- **Developers** choosing a model for a job.
- **Creators** comparing styles and motion fidelity on their own material, such as a guide clip from `motion-studio`.

## Principles

- **Viewing first.** It plays, compares and embeds. It does not record or edit video; that stays in Genobi or any screen recorder.
- **Honest captions.** Each clip states the inputs the model received, the first-frame variant, the model that actually ran, the cost and the seconds.
- **Provider-agnostic.** Every service is an adapter in `providers/`. Runware is the first.
- **Your key stays in your browser.** It goes only to the provider, is held in memory or `sessionStorage`, and is never logged.
- **No framework, no server.** A standard custom element; static hosting is enough.

## Features, first milestone (preview 12 November)

- **F1 Record schema:** a comparison with:
  - the guide (video, audio, first frame, keyframes, beats);
  - its lanes, each with model, prompt, inputs sent, first-frame variant, output URL, cost, seconds and the model that ran;
  - observations and a preferred lane.
  Includes the guide-bundle JSON Schema that `motion-studio` exports against.
- **F2 `<model-arena>` element:**
  - one shared clock; play all; play one alone;
  - captions under each clip;
  - a carousel of several records.
- **F3 Layouts:** three side by side (landscape), a 2×2 grid, one large clip plus a strip, and a portrait stack for phones.
- **F4 Embed template:** `templates/embed.html`, one script tag plus a record URL.
- **F5 Capture mode:** controls hidden, fixed aspect, clips cued, so any recorder captures it cleanly.
- **F6 Runware provider** (`providers/runware-api`):
  - **Requests:** browser-side, with the user's own key. CORS preflight on `api.runware.ai` was verified on 7 Nov: it allows any origin and the Authorization header.
  - **Per-model task builder:** generated from each model's published schema.
  - **Results:** async polling; `includeCost` for the price.
  - **Router lane:** one lane with `model: "auto"`, preferences and a price cap. The record stores the model that ran.
- **F7 Lane fitting:** each lane adapts the guide to what its model accepts:
  - the whole clip to Kling 4.0, Seedance 2.5 and MiniMax H3;
  - audio plus the first frame to LTX-2.5;
  - keyframes to FLUX 3 Video.
  Anything else is refused with a clear message.
- **F8 Keyframes from a clip:** frames extracted with WebCodecs at chosen times (first, last, beat positions), sized to each model's limit.
- **F10 Generate it yourself:** next to every published record.
  - **"Generate this yourself":** opens a key panel with a password-style field, held in memory or `sessionStorage`, labelled "stays in your browser".
  - **No account?** A link to sign up with the provider.
  - **Rerun:** any lane reruns, or the whole record through the router lane, with a price cap and a cost confirmation.
  - **Open-weights lanes:** link to a "deploy this workflow to serverless" recipe in the repo. There is a folder plus one CLI command, because Runware Serverless deploys through its CLI; no deploy button or deploy-from-GitHub flow is documented, as checked on 8 Nov. A one-click deploy link is a product suggestion for the provider.
  - **Unverified:** whether a provider offers any "connect your account" flow for third-party pages. Runware's Serverless introduction page mentions none, and the pasted key is the default.
- **F11 Galleries:** switch between records, such as "same image, five models" and "same mannequin guide, five ways in", and compare lanes side by side.
- **F9 Themes:** CSS variables. A provider or brand look is one theme file; the core stays unbranded.

## Later

- Runware Serverless lane for open-weights workflows (LTX Layout-to-Render).
- More providers: fal, Replicate, Comfy Cloud, RunPod.
- Rating and voting per lane; shareable record URLs; a hosted gallery of records.

## Non-goals

- Recording, editing or rendering video.
- Motion authoring; that is `motion-studio`.
- Accounts, a backend, or storing keys anywhere except the user's browser session.

## Success measures

- A page embeds a record with one script tag and plays it on a phone and a laptop.
- One guide runs through five lanes, and every caption tells the truth about the inputs sent.
- No key leaves the browser except in requests to the provider.
- Someone outside the project publishes their own comparison from the README alone.

## Known constraints

- **Per-model inputs on Runware** (schemas read 7 Nov):

  | Model | Inputs |
  | --- | --- |
  | Kling 4.0 | `referenceVideos`, up to 5 |
  | Seedance 2.5 | `referenceVideos` up to 10, plus `referenceAudios` |
  | MiniMax H3 | `referenceVideos` up to 3, plus `referenceAudios` |
  | LTX-2.5 | `inputs.audio` and `frameImages`; no reference video |
  | FLUX 3 Video | `frameImages` with positions; its `video` input is extension only |

  Re-read each schema before writing a field.
- **On Magnific:** H3 and Seedance 2.5 refuse a start frame together with reference videos. Check the same on Runware.
- **Generation calls cost money.** The element plays published records without a key; running new lanes needs the user's key and a cost confirmation.

## Open questions

1. Is the record schema versioned from the start (`schemaVersion: 1`)?
2. Where are published records and media hosted by default? Static files next to the page, or object storage?
3. Should the first milestone ship as an npm package, or as a plain ES module file?

## Credits

- The shared-playhead idea and record shape come from the Arena in the owner's studio project.
- The comparison need was raised by a team that posts model comparisons weekly.
