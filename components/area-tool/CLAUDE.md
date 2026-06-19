# Agent I — Area Tool Agent

## Role
Build the circle-drawing area selection tool. When active, the user clicks the map to
set a center and drags to set a radius. On release, the tool computes aggregate
statistics (mean, median, min, max) for all features within the circle and displays
them in a panel.

## Reads (do not modify)
- `contracts/events.js`            — Actions, DrawnCircle, AggregateStats
- `contracts/project-config.js`   — AreaToolConfig, Variable
- `lib/area-stats.js`             — featuresWithinCircle, computeAggregateStats
- `lib/format.js`                 — formatValue, formatCoord
- `theme/index.js`

## Writes (owns these files)
- `components/area-tool/index.js`    — the <AreaTool> component
- `components/area-tool/stats-panel.js` — the stats display card

## Must NOT touch
Everything outside `components/area-tool/`.

---

## components/area-tool/index.js

```js
// Props:
// map:      MapLibre map instance (or null)
// config:   ProjectConfig
// state:    AppState   (reads: areaToolActive, drawnCircle)
// dispatch: Dispatch
export function AreaTool({ map, config, state, dispatch }) { ... }
```

### Drawing interaction

When `state.areaToolActive === true`:
1. Change map cursor to 'crosshair'
2. On `mousedown` on the map canvas: record the click point as circle center
3. On `mousemove` (while button held): compute current radius in km using
   `haversineKm` from `lib/area-stats.js`, re-render the circle overlay
4. On `mouseup`: finalize the circle

   a. Call `map.queryRenderedFeatures()` to get all visible features from
      the 'firemap-cells' layer (layer id is the constant from lib/use-map-layer.js)
   b. Filter with `featuresWithinCircle(features, lat, lng, radiusKm)`
   c. Compute stats with `computeAggregateStats(filtered, config.areaTool.aggregateVariableIds)`
   d. Dispatch `SET_DRAWN_CIRCLE` and `SET_AGGREGATE_STATS`

5. Restore cursor to default when `areaToolActive === false`

### Circle rendering

Draw the circle as a MapLibre GeoJSON layer (not a DOM element):
- Source: GeoJSON generated from `circleToGeoJSON(lat, lng, radiusKm)` — a polygon
  approximating a circle with 64 points
- Layer type: 'fill' with low opacity + 'line' for the border
- Update the source on every `mousemove` during drawing

```js
// Helper: generate a GeoJSON polygon approximating a circle
function circleToGeoJSON(lat, lng, radiusKm, nPoints = 64) { ... }
```

### Radius in km from pixel drag

To convert from pixel coordinates to km:
1. Get `map.getCenter()` distance reference using MapLibre's `LngLat.distanceTo()`
2. Or: convert the drag endpoint to LngLat with `map.unproject()` and use `haversineKm`

---

## components/area-tool/stats-panel.js

```js
// Props:
// config:          ProjectConfig
// drawnCircle:     DrawnCircle | null
// aggregateStats:  AggregateStats | null
// dispatch:        Dispatch
export function StatsPanel({ config, drawnCircle, aggregateStats, dispatch }) { ... }
```

Renders a card (bottom-left of screen, or alongside the detail panel):
- Circle info: center coordinates, radius in km, number of cells in circle
- One row per variable in `config.areaTool.aggregateVariableIds`:
  - Variable label
  - Mean value (formatted)
  - Median value (formatted)
- Close button dispatches `SET_DRAWN_CIRCLE({ circle: null })` and `SET_AGGREGATE_STATS({ stats: null })`
- Returns null when `drawnCircle` is null

---

## Done when
- [ ] Click + drag on the map draws a visual circle
- [ ] Circle radius updates in real-time during drag
- [ ] On mouseup: stats panel appears with mean/median for aggregate variables
- [ ] Circle layer is properly cleaned up when tool is deactivated
- [ ] StatsPanel returns null when no circle is drawn
- [ ] Close button clears both circle and stats
