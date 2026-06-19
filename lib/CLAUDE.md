# Agent C — Utilities Agent

## Role
Implement the shared utility functions and hooks used by map, sidebar, detail panel,
and area tool. Pure functions and React hooks — no UI rendering.

## Reads (do not modify)
- `contracts/project-config.js`
- `contracts/events.js`
- `theme/colors.js`

## Writes (owns these files)
- `lib/colormap.js`             — D3 color scales  ✓ (implemented)
- `lib/format.js`               — number formatting ✓ (implemented)
- `lib/get-active-variable.js`  — variable resolver ✓ (implemented)
- `lib/area-stats.js`           — circle stats      ✓ (implemented)
- `lib/use-map-layer.js`        — MapLibre layer hook (needs testing)

## Must NOT touch
Everything outside `lib/`.

---

## lib/use-map-layer.js — MapLibre layer hook

This is the only file in lib/ that still needs work. See the stub at lib/use-map-layer.js.

The hook:
1. Adds a PMTiles source + circle layer on mount
2. Updates `circle-color` paint expression when `state.activeVariable` changes
3. Cleans up source + layer on unmount

Key detail: MapLibre's `setPaintProperty` only updates the visual; it does not reload
data. The color expression must be rebuilt from the active variable's domain using
`buildPaintExpression()` (already in the stub).

When `config.tilesUrl === 'REPLACE_WITH_R2_URL'`:
- Fall back to GeoJSON from `/fuel-treatment.geojson` if it exists in `public/`
- Otherwise: add nothing (map shows basemap only)

```js
const sourceConfig = config.tilesUrl !== 'REPLACE_WITH_R2_URL'
  ? { type: 'vector', url: `pmtiles://${config.tilesUrl}` }
  : { type: 'geojson', data: '/fuel-treatment.geojson' }
```

The layer type differs:
- PMTiles vector source: `type: 'circle'` with `source-layer: config.id`
- GeoJSON source: `type: 'circle'` with no `source-layer`

## lib/area-stats.js — circle statistics ✓

Already implemented. Key exports:
- `haversineKm(lat1, lng1, lat2, lng2)` — distance in km
- `featuresWithinCircle(features, lat, lng, radiusKm)` — spatial filter
- `computeAggregateStats(features, variableIds)` — returns AggregateStats
- `percentileThresholds(features, variableId, lowPct, highPct)` — returns {low, high} data values

## lib/get-active-variable.js — variable resolver ✓

Already implemented. Key exports:
- `getActiveVariable(config, activeLayer, activeDimensions)` → Variable | null
- `getDefaultDimensionsForLayer(config, layerId)` → Object

## Done when
- [ ] `use-map-layer.js` falls back to GeoJSON when PMTiles URL is placeholder
- [ ] `use-map-layer.js` correctly handles style reload (re-adds layers after setStyle)
- [ ] All other lib files pass basic smoke tests in /qa page
