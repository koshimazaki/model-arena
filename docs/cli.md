---
tags: [cli, runware, model-arena]
summary: Running one lane or making a character still from the command line: dry runs, the price cap and confirmation, resuming, the model keys, and where the key lives.
---

# The command line

## Dry runs

A dry run prints exactly what a paid run would send, and sends nothing:

```sh
# One lane: the composer writes Seedance's prompt from a neutral shot (guide video plus a character still).
npm run lane -- --model seedance-2.5 --shot examples/shots/motion-swap.json \
  --guide examples/media/placeholder/guide.mp4 --character examples/media/placeholder/inputs/character.png --dry-run

# A character still with FLUX.2 [klein] 9B, pose-matched to the guide's first frame.
npm run still -- --model klein-9b --reference examples/media/placeholder/inputs/first-frame.png \
  --prompt "A figure in a plain grey jumpsuit, in exactly the pose and framing of the reference image." --dry-run
```

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
- `npm run still -- --model <key> --prompt ... [--reference frame0.png] --max-price 0.05` makes that still with any of nine image models (FLUX.2 [klein] 9B, FLUX 3 Image and Image Klein, GPT-Image-2.6 Flare and Sunburst, MiniMax H3 Image and Highspeed, Seedream 5.5, Kling IMAGE 3.0; `--help` lists them); same refusals, confirmation and cost row as a lane. GPT-Image-2.6 has no published bound and runs with `--allow-unpriced`, capped against the highest published example (`--quality low` for drafts); MiniMax H3 Image runs on an estimate from its approximate token counts.

## Your key

The key is read from `RUNWARE_API_KEY` by the CLI, and held in memory (or `sessionStorage` if asked) in the browser. It is sent only to `api.runware.ai` and is never logged or written to a record.
