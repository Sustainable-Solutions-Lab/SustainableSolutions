# Just Air — overnight notes

Steve — picking up where we paused.  This is a one-night sweep through
your morning's "Just Air" plan; you can delete this file after reading.

## TL;DR

- `/tools/just-air` now ships on `main` and auto-deploys to the Vercel
  production URL the repo is wired to (`sustainablesolutions.vercel.app`).
  Six commits tonight, deploys all healthy:
  - `33c8bba` — page + project wiring
  - `5e2bf9e` — multi-source polygon render hook
  - `5c0dcd5` — this notes file
  - `182ab25` — **fix**: gate the CA-only static overlays so they don't
    paint over everything outside California (without this, 14 of the
    15 metros would have been invisible — the CA out-of-bounds mask
    was unconditional)
  - `4240293` — z-order fix so the metro boxes / labels render above
    the data layers
  - `81051ca` — hide Just Air's percentile filter UI (the slider lives
    inside a Firefuels-only distribution chart, so it was dead).
- The page mounts the generic map tool against a new project config and
  renders the city PMTiles + the synthetic 9 km national surface.
- Outline boxes mark the 15 metros on the low-zoom national view and
  fade out as you zoom into the pixel data.
- The diff layers use an inverted RdBu (`BuRd`) — positive diff (high
  CDR is dirtier / kills more people) reads red, negative reads blue.
  Opposite of Firefuels' net-benefit semantics, which is why a new
  colormap rather than a shared one.

## What's in `main`

### New
- `src/pages/tools/just-air.astro` — page mirror of `firefuels.astro`,
  mounts `<MapTool projectId="just-air" />`.
- `src/tools/map/projects/just-air/config.js` — project config.
- `src/tools/map/projects/just-air/methods.mdx` — markdown source for the
  methods panel (the JSX in `methods-panel.jsx` is the live copy; this
  file is the human-editable reference).
- `src/tools/map/lib/use-multi-source-layers.js` — new render hook for
  projects whose data is one or more polygon-tiled PMTiles, with
  per-source fade-in / fade-out zoom ranges.

### Modified
- `src/tools/map/MapTool.jsx` — now accepts a `projectId` prop and seeds
  `activeLayer` + `activeDimensions` from the project config.  Falls
  back to `'fuel-treatment'` so the existing Firefuels mount is
  unchanged.  The fuel-treatment-specific GeoJSON prefetch is gated on
  `projectId === 'fuel-treatment'`.
- `src/tools/map/components/map/index.jsx` — honours
  `config.region.minZoom/maxZoom`; calls the new multi-source hook in
  parallel with the legacy `useMapLayer`; renders the box overlay (fill
  + dashed outline + corner labels) when `config.boxOverlay` is set,
  and re-adds it after `setStyle()` for dark/light toggles.
- `src/tools/map/components/methods-panel.jsx` — switches between
  `FuelTreatmentMethods` and `JustAirMethods` by `config.id`.
- `src/tools/map/components/area-tool/index.jsx` — `queryRenderedFeatures`
  now uses a `dataLayerIds(config)` helper that returns the multi-source
  fill layers when present, falling back to the legacy Firefuels layer
  list otherwise.  So drawing a circle on Just Air should aggregate
  pixels correctly.
- `src/tools/map/lib/use-map-layer.js` — early-returns inside the effect
  when `config.tileSources` is set, so it doesn't fight the new hook.
- `src/tools/map/lib/colormap.js` — adds `BuRd` (inverted `RdBu`).
- `src/tools/map/contracts/project-config.js` — documents the new
  additive fields (`tileSources`, `boxOverlay`, `region.minZoom/maxZoom`).
- `src/tools/map/projects/index.js` — registers `just-air`.
- `src/pages/tools/[slug].astro` — `just-air` added to the skip set so
  the dynamic `[slug]` route doesn't shadow the hand-written page.

## What to check on the live URL when you wake up

Open `https://sustainablesolutions.vercel.app/tools/just-air` and skim:

1. **National view loads at z4.2.**  You should see (a) the 9 km
   synthetic surface in `YlOrRd` (light/yellow over most of the country,
   warmer near major metro centers) and (b) 15 dashed-outline boxes with
   tiny city labels at the top-left of each box.  *Caveat: the national
   surface is synthetic data, deliberately rough.  Real values
   overwrite at the next data drop.*
2. **Switch scenarios in the sidebar.**  "Low CDR" → "High CDR" → "Δ
   (High − Low)".  The diff view should swap to the diverging blue/red
   colormap with white near zero.
3. **Switch layers.**  "PM₂.₅" → "Mortality".  Mortality magnitudes are
   small (per-pixel deaths), so the national field looks mostly faint.
4. **Zoom into Los Angeles or NYC.**  Past z7.5, the city pixel layer
   should fade in over the synthetic 9 km field.  By z8.5 you should be
   seeing block-scale heterogeneity inside the metro box.  The box
   outlines and labels should disappear by z9.
5. **Methods panel.**  "Read methods" should open the Just-Air-specific
   content (mentions Bergero et al., the two scenarios, the difference
   colormap convention).
6. **Dark/light toggle in the site nav.**  Boxes, labels, and data
   should all redraw correctly.  This is the historic flake point — if
   anything disappears here, that's the regression to flag.

## Decisions I made on your behalf

- **Cities-only vs cities + national for v1.**  Both are wired in
  simultaneously.  The synthetic national surface gives the
  low-zoom view something to look at; the city pixels stack on top
  inside the metro boxes.  When you ship the real national data, just
  rebuild and replace the R2 file — no config change needed.
- **Box overlay style.**  Dashed line (2px on / 2px off) at ~55%
  opacity in the foreground ink color, faint 4%-fill so hovering
  doesn't suddenly turn the boxes opaque, and 10 px sans-serif label
  pinned to the top-left of each bbox with a halo.  Fades 7→9.  Tell
  me if it reads as too quiet or too noisy.
- **Inverted RdBu for the diff layers.**  D3's stock `RdBu` puts blue
  on positive values, which would mean "blue = High CDR is dirtier" —
  the wrong direction.  I added a `BuRd` interpolator (just
  `RdBu(1−t)`) and pointed the two diff variables at it.  The legend
  + map will both render in this orientation.
- **Stub layers (Population, Minority share, Income) are hidden in v1.**
  They're in the config as `hidden: true` so they don't show up in the
  sidebar at all.  Flip the flag when you have data.
- **Distribution chart in the sidebar will be empty.**  The chart is
  populated by a fuel-treatment-only GeoJSON prefetch.  Doing a real
  prefetch from the city PMTiles is doable but expensive (a quarter-GB
  pull just to compute a histogram).  Easier path is a small build-time
  side-car JSON of per-variable values — happy to wire that on request.
- **The percentile-filter slider/button is non-functional on Just Air.**
  The legend control still appears in the sidebar, but clicking the
  preset percentile buttons won't visibly filter the map.  I left the
  control in place rather than hide it because the wiring it needs
  (querySourceFeatures across two sources, then filter expressions on
  the fill layers) is more than a one-shot change.
- **Area-selection circle DOES work.**  Drawing a circle on Just Air
  should aggregate pixels inside it; the StatsPanel shows the mean of
  the active variable across the circle.  The ZIP-search input is
  Firefuels-only (it's gated on `config.areaTool.zipsBaseUrl`, which
  Just Air doesn't set).

## Manual follow-ups for you

1. **Add a row to the "Tools" tab in your Google Sheet** so Just Air
   shows up on the `/tools` index:

   | column        | value                                                                                                                |
   |---------------|----------------------------------------------------------------------------------------------------------------------|
   | `slug`        | `just-air`                                                                                                           |
   | `title`       | Just Air                                                                                                             |
   | `eyebrow`     | INTERACTIVE MAP                                                                                                      |
   | `summary`     | Air-quality and mortality consequences of two net-zero scenarios across 15 U.S. metros.                              |
   | `description` | (optional, longer prose for an auto-detail page — irrelevant here since `just-air` is in the skip set)               |
   | `image_filename` | (optional hero image filename, in `public/tools/` or `public/images/`)                                            |
   | `link`        | `/tools/just-air`                                                                                                    |
   | `doi`         | (the Bergero et al. DOI when it's assigned; leave blank for now)                                                     |
   | `order`       | `20` (Firefuels is `10`)                                                                                             |

   The page itself (`/tools/just-air`) works without this row — the row
   only governs whether a card appears on the `/tools` index page.

2. **When the paper's DOI is assigned**, drop it in the `doi` column.
   The Companion-paper line in the sidebar will then auto-populate
   from `publications.json` (which is fetched from the Publications
   sheet).  Until then the methods panel cites the researchsquare
   preprint URL hardcoded into `JustAirMethods`.

3. **When real national data lands**, replace
   `just-air-national.pmtiles` in your R2 bucket.  The build script
   `scripts/build-just-air-tiles.mjs` regenerates it from
   `Outputs for map app/`; I left the synthetic CONUS generator in
   that script for now — swap it for a real-data path when the
   numbers are available.

## Known rough edges (i.e. things I'd want to fix in v1.1)

- **Sidebar distribution chart is hidden on Just Air** (because the
  percentile filter is disabled — the two share the same gate).  When
  the filter is generalized for multi-source projects, the chart will
  also need to draw from somewhere other than the Firefuels-only
  GeoJSON prefetch.  Cleanest path: switch the chart to render from
  the area-tool's `activeVarValues` when a circle is open, which makes
  it interactive in the bargain.
- **No place-name labels at high zoom on Just Air.**  The CA-cities
  labels are correctly suppressed, but no replacement set of US-city
  labels is wired in.  Inside a metro at z11 you see just the data.
  Box-overlay labels disappear past z9.  Easiest fix: a small
  US-cities GeoJSON in `static-layers.jsx`, gated on a new
  `region.usCityLabels` flag.
- **`config.areaTool.defaultRadiusKm` is dead code.**  The area tool
  derives its default radius from the current zoom (50 km at z5,
  exponentially smaller at higher zooms) and ignores the config value.
  Not a regression; just inherited from Firefuels.  Worth wiring once
  there's a reason.
- **Aggregate-stats panel shows all six variables for Just Air.**  I
  left the area-tool config listing all of pm25_low/high/diff and
  mort_low/high/diff, which is dense.  Consider trimming to the active
  pair if/when you use the tool.
- **No tile-source error UI.**  If R2 is down, the map quietly stays
  blank.  A small "tiles unavailable" toast would be friendly.
- **Legend numbers on the diff layer.**  The PM₂.₅ diff domain is
  ±5 µg/m³; if real diffs are smaller (or bigger), I'll need to
  re-calibrate `domain.min/max/zero` in the config.  Eyeball the
  legend when you check the live site.

## How to roll back if anything is on fire

The Just Air commits are isolated; to fully back out, revert in
reverse order so each revert lands cleanly:

```
git revert --no-edit 81051ca 4240293 182ab25 5e2bf9e 33c8bba
git push origin main
```

(The notes-only commit `5c0dcd5` is harmless to leave behind.)
`/tools/just-air` will 404 after that and the rest of the site —
including Firefuels — is untouched, because every change behind a
generic config field defaults to the Firefuels behaviour.

## Reach me

I've left work in the repo, not in memory.  If you want me to pick up
where I left off (filter UI gating, build-time summary stats, real
national data swap, etc.), point me back at this file and I'll know
where we are.
