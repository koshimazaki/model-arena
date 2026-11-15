---
tags: [element, embed, model-arena]
summary: The two elements, <model-arena> and <model-specs>: their attributes, the four layouts, how media paths resolve and how to theme them.
---

# The elements

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
- `guidance`: the Draw Control guide beside one model's output on one clock, how that model is steered (camera parameter, guide video or prompt words), what it received and its composed prompt. `model="<lane id>"` picks the first lane shown.
- `three-up` (default): every lane with its full caption.

The element fills its container's width and collapses to one column below 640 px. Colours, fonts and radii are `--ma-*` custom properties with neutral defaults (the dark lime look is `packages/element/themes/dark-lime.css`); `theme="auto"` follows the reader's light or dark setting.

To put the generate flow, the key panel and the gallery inside another app, see [embed.md](embed.md).
