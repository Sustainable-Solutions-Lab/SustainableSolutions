# Template — Research tool catalog card

## Fields

`type` (controlled vocabulary), `title`, `description` (max ~2 lines target on desktop, no hard truncation of essential info), `href`, `companionPaper?`, `venue/status/year?`, `github?`, `zenodo?`, `website?`, `image?` (only if current catalog design supports it).

## Content example (verified labels, links must be resolved from current source)

```text
INTERACTIVE MODEL
Predicting contrails at booking
Predicted contrail warming for any scheduled flight — check before you book and find lower-warming alternatives in the same window.
COMPANION PAPER
Flyers can identify the most-warming flights when booking
in review · 2026
GitHub ↗ · Zenodo ↗
```

This example is transcribed from the current catalog's public text on 2026-11-09. Pull canonical URLs and updated metadata from site/CMS before shipping.

## Behavior

Title links to tool. Separate external link targets for paper, code and archive. Never nest anchors. Link accessible names must make the destination clear. Use natural wrapping, keyboard focus, visible hover and mobile stacked layout. Do not add per-card iconography just for decoration if the catalog uses editorial text-first cards.
