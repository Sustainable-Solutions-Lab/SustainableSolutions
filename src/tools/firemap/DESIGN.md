# Map tool design rules

Defaults and tuning levers for the interactive map platform under
`src/tools/map/`. These are the conclusions from the Just Air iteration,
written down so future tools can start from a known-good baseline
instead of rediscovering each knob from scratch.

The full contract lives in `contracts/project-config.js`; this file is
the *design* counterpart — when and why to set each field.

---

## 1. Map view

| Field | Default | What it controls |
| --- | --- | --- |
| `region.center` | — | `[lng, lat]` the map opens on |
| `region.zoom` | — | initial zoom level. Pick so the project's geographic extent fills the visible map area (sidebar excluded) |
| `region.minZoom` | 2 | how far the user can zoom *out*. Set just below `region.zoom` if the extent is the only useful framing |
| `region.maxZoom` | 10 | how far the user can zoom *in*. Past 10–11 the data circles dwarf the basemap and orientation goes away — stop the zoom there |
| `region.bounds` | — | optional pan clamp `[w, s, e, n]` |
| `region.useCaliforniaOverlay` | false (default `true`) | CA-only static layers (mask, county lines, CA cities) |
| `region.useUsOverlay` | false | 48-state borders + ~30 US-city labels (rank-2/3 stay hidden until z ≥ 5) |

**Rule of thumb:** the default view should show the *entire* data extent
with a margin. `maxZoom` should bottom out where you lose every
recognizable place-name on the basemap.

---

## 2. LOD bands (`scales[]`)

A tool's data lives in **one PMTiles** with every feature tagged by a
`_scale` property (cell side length in km). The renderer adds one circle
layer per `scales[]` entry, filtered to that scale value, with the
listed zoom band controlling visibility.

| Field | Pattern | Notes |
| --- | --- | --- |
| `value` | km (e.g. 36, 9, 3, 1) | matches the `_scale` baked into the tile |
| `minZoom` | first zoom at which this scale appears | layer is hidden below this |
| `maxZoom` | first zoom at which this scale disappears | optional — omit for the finest scale and let it stay until camera max |

**Rule of thumb — zoom band per scale:**

| Scale (km) | minZoom | maxZoom |
| ---: | ---: | ---: |
| 36 (CONUS overview supercells) | 2 | 4 |
| 9 (national grid) | 4 | — (no max; the within-metro tile data is bbox-truncated by the build script) |
| 3 (within-metro bridge) | 7 | 9 |
| 1 (native city pixels) | 9 | — |

A new tool with different extents should:

1. Set the coarsest scale's `minZoom` at the project's `region.minZoom` and `maxZoom` at the project's default `region.zoom + 1`.
2. Each subsequent scale picks up where the previous one ended.
3. The *tile* zoom hints (in the build script's `tippecanoe: { minzoom, maxzoom }`) must align with these render bands — drop a feature one zoom *before* its layer appears so it doesn't pop into existence with empty tiles.

The build script tags national-grid cells whose centroid is inside any
metro bbox with a tighter tile maxzoom so the high-res city tiers can
take over without the same area being painted twice at the same zoom.

---

## 3. Circle radius (`use-just-air-layers.js` constants)

Three stops on a `['exponential', 2]` interpolation: a small `R3` for
the CONUS-overview view, a much larger `R4` for the moment the next
scale takes over, and a `R12` upper anchor at the natural tiling size.
This shape is the reason "circles stayed too large at z 4" was
*solved* by adding the `R3` stop — without it the exponential
extrapolation back to z 3 made supercells balloon before the LOD swap.

```js
const R3  = 0.04   // 36 km cell at z 3 ≈ 1.5 px radius
const R4  = 0.44   //  9 km cell at z 4 ≈   4 px radius
const R12 = 16.0   //  1 km cell at z 12 ≈ 16 px (tiling-exact)
const MAX_RADIUS_PX = 8     // caps any cell at high zoom
```

**Rule of thumb:** at each scale's *first* zoom, target a circle radius
around **3–4 px**. Smaller looks dotted; larger and the cells overlap
into a wash. Then let the exponential carry them to `MAX_RADIUS_PX` by
the time the next finer scale is about to take over.

`MAX_RADIUS_PX`:
- 8 px (current Just Air) — compact, leans on density-not-size for
  conveying the data
- 12 px — more bold, similar to Firefuels at the same data spread
- 14+ px — only if you want overlapping blobs at high zoom

---

## 4. Color & alpha

### Sequential variables

Use a colormap whose **low end is near the paper background**
(YlOrRd, Purples, Oranges, …). Alpha varies with `|value − zero|` so
the magnitude carries through both color and opacity.

| Field | Use |
| --- | --- |
| `colormap` | name from `lib/colormap.js`'s `INTERPOLATORS` map |
| `colormapStart` | 0–1; clip off the colormap's lowest stops so visible cells start at a saturated hue and the pale low end is replaced by transparency (e.g. PM₂.₅ uses 0.35 to skip the pale-yellow third of YlOrRd) |
| `solidColor` | single hex string — replaces the colormap entirely. The map paints every cell in this hue with alpha varying by `|value − zero|` |

### Diverging variables

| Field | Use |
| --- | --- |
| `colormap` | `RdBu`, `BuRd`, etc. — used by the histogram chart and as a fallback |
| `solidColor` | hex string for the **positive** side (overrides the default anchors) |
| `solidColorNegative` | hex string for the **negative** side |

Just Air's diff layers use `#d73027` (positive ≡ "worse outcome") and
`#4575b4` (negative ≡ "better outcome"). The map renders a binary
sign-keyed color with alpha-from-magnitude, the same way Firefuels'
net-benefit layer does.

### Alpha curve

```js
const ALPHA_FLOOR = 0.40   // anything below this t fully transparent
function alphaForValue(v) {
  const t = (v - zero) / maxPosDev          // (or negDev for diverging)
  if (t < ALPHA_FLOOR) return 0
  const tr = (t - ALPHA_FLOOR) / (1 - ALPHA_FLOOR)
  return Math.min(1, Math.pow(tr, 1.8))     // steep ramp from floor to opaque
}
```

`maxPosDev` / `maxNegDev` come from the data's p99 of `|value − zero|`
(computed in `useJustAirLayers` once the source loads), not the configured
`domain.max` — many variables have a long tail far above what the user
typically sees.

**Rule of thumb:** `ALPHA_FLOOR` ≈ 0.40 for single-hue variables;
0.25–0.30 for colormap variables (their low-end colors fade naturally,
so less needs to be clipped to alpha 0).

---

## 5. Histogram chart (`percentileFilter` + `histogramMin`)

Set `percentileFilter.enabled: true` to surface the distribution +
slider in the sidebar. The chart bars are colored to match the map
(same `solidColor` / `colormap`); the slider clips the data layers when
moved off `[0, 100]`.

`variable.histogramMin` clips the bottom of the chart's visible range
so the histogram focuses on the elevated portion of the distribution
(e.g. PM₂.₅ chart starts at 8 µg/m³ — anything below is rural baseline
noise that just compresses the visible bars).

---

## 6. Box overlay (`boxOverlay`)

For projects that have a low-resolution surface plus fine-resolution
inset regions (Just Air's national grid + 15 metro pixels), the box
overlay marks each inset region with a dashed rectangle + corner
label that fades out as the user zooms into the inset data itself.

| Field | Default | What it does |
| --- | --- | --- |
| `manifestUrl` | — | JSON URL: array of `{ slug, label, bbox: [w, s, e, n] }` |
| `fadeOutMinZoom` | 7 | boxes fully visible up to this zoom |
| `fadeOutMaxZoom` | 9 | boxes fully invisible at this zoom and above |
| `labelSize` | 10 | label font size in px |

---

## 7. Common starting point for a new sequential variable

```js
{
  id: 'my_var',
  label: 'My variable — scenario',
  unit: 'whatever',
  layer: 'pm25',
  dimensionValues: { scenario: 'low' },

  // Color
  colormap: 'YlOrRd',
  colormapStart: 0.35,        // OR use `solidColor: '#…'` and drop the colormap

  // Distribution
  domain: { min: 0, max: 15 },
  histogramMin: 8,
}
```

And for a diverging variable:

```js
{
  id: 'my_diff',
  label: 'Δ scenario (positive − negative)',
  unit: 'whatever',
  layer: 'pm25',
  dimensionValues: { scenario: 'diff' },

  diverging: true,
  colormap: 'BuRd',
  solidColor: '#d73027',
  solidColorNegative: '#4575b4',
  domain: { min: -5, max: 5, zero: 0 },
}
```

---

## 8. Tuning checklist when something looks wrong

| Symptom | Knob |
| --- | --- |
| Whole map painted in one color, no contrast | Lower `FILL_FACTOR` (less overlap) and/or raise `ALPHA_FLOOR` |
| Rural baseline visible as faint wash | Raise `ALPHA_FLOOR` |
| Circles too big at high zoom | Lower `MAX_RADIUS_PX` |
| Circles too small at low zoom | Add/raise the `R3` stop |
| LOD transition feels too late | Push the next scale's `minZoom` down; align tile zoom hints |
| LOD transition pops (sudden size change) | Use the three-stop radius (R3/R4/R12) so each band starts at a sensible size |
| Histogram empty | `percentileFilter.enabled: true` AND `MapTool` must populate `statewideValues` for that project |
| State borders / labels hidden under data | Layer order — data layers go *before* the static overlay layers (see `beforeId` logic in `useJustAirLayers`) |
| Map blank entirely | Almost always an invalid paint expression — open dev-tools console; MapLibre rejects bad layers silently and won't add them |
