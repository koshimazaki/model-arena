---
tags: [costs, model-arena]
summary: One row per paid generation run, appended by scripts/run-lane.ts. Estimates come from each model's published per-second rates; cost is what the API reported with includeCost.
---

# Costs

Every paid run is a row. `scripts/run-lane.ts` appends rows automatically, including failed runs (which Runware does not charge for). Estimate is the upper bound computed from the schema's `x-pricing` rates before the run; cost is the `cost` field the API returned.

| Date | Model asked | Model ran | Task UUID | Duration | Resolution | Inputs | Estimate | Cost | Seconds | Output | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
