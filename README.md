# Model Arena

A drop-in web component that plays video-model outputs side by side on one clock, runs them with your own key, and shows exactly what each model was given and what it cost.

Status: planning. Nothing is built yet; the documents below are the plan.

- [Product requirements](docs/PRD.md)
- [Implementation plan](docs/plan.md)

Companion repo: **motion-studio**, which makes guide clips. Model Arena reads its guide bundles; the two share files, not code.

Embed target (not built yet):

```html
<script type="module" src="model-arena.js"></script>
<model-arena src="records/mannequin-five-models.json" layout="three-up"></model-arena>
```

Providers are adapters in `providers/`. Runware is the first; others plug in behind the same interface. Your key stays in your browser.

Licence: MIT.
