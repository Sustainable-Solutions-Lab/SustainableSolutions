# Agent D — Map Agent

## Role
Initialize the MapLibre GL map, manage the basemap style, data layer, percentile
filter, and cell-click handler. The area tool is handled by a separate component
(components/area-tool/) that this component passes the map instance to.

## Reads (do not modify)
- `contracts/project-config.js`
- `contracts/events.js`
- `lib/use-map-layer.js`
- `lib/get-active-variable.js`
- `lib/area-stats.js`        (percentileThresholds)
- `theme/index.js`

## Writes (owns these files)
- `components/map/index.js`
- `components/map/basemap-style.js`
- `components/map/click-handler.js`

## Must NOT touch
Everything outside `components/map/`.

---

## components/map/index.js

```js
// Props:
// config:    ProjectConfig
// state:     AppState
// dispatch:  Dispatch
// height:    string (CSS)
// onMapReady: (map) => void   — called when map finishes loading; parent uses this
//                              to pass map instance to <AreaTool>
export function Map({ config, state, dispatch, height, onMapReady }) { ... }
```

### Map initialization
- Container div: `position: absolute, inset: 0`
- MapLibre init with `config.region.center`, `config.region.zoom`, `config.region.bounds`
- Style: `basemapStyle(state.colorScheme)` (see below)
- Store map in `useRef` (not state)
- On `map.once('load')`: call `onMapReady(map)`

### Data layer
Call `useMapLayer(map, config, state)` from `lib/use-map-layer.js`.

### Percentile filter
When `state.percentileRange` changes, update the MapLibre filter expression on the layer:
```js
const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
if (variable && variable.type !== 'categorical') {
  const { low, high } = percentileThresholds(
    map.querySourceFeatures('firemap-data'),
    variable.id,
    state.percentileRange.low,
    state.percentileRange.high,
  )
  map.setFilter('firemap-cells', [
    'all',
    ['>=', ['get', variable.id], low],
    ['<=', ['get', variable.id], high],
  ])
}
```

### Color scheme change
```js
useEffect(() => {
  if (map) map.setStyle(basemapStyle(state.colorScheme))
}, [state.colorScheme])
```

Re-add data layers after style change since setStyle removes all layers.
Use `map.once('styledata', addLayers)` pattern.

### Click handler
Call `useClickHandler(map, config, dispatch)` — see click-handler.js.

---

## components/map/basemap-style.js

```js
// Returns a MapLibre style URL for the basemap (no API key required)
export function basemapStyle(scheme) { ... }
```

Use Stadia Maps free styles (no key required for development):
- Dark:  `'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'`
- Light: `'https://tiles.stadiamaps.com/styles/alidade_smooth.json'`

---

## components/map/click-handler.js

```js
// Adds map click listener. Returns cleanup function.
export function useClickHandler(map, config, dispatch) { ... }
```

On click:
1. Query features at the click point from layer 'firemap-cells'
2. If a feature is found: dispatch `SELECT_CELL` with all feature properties as `values`
3. If no feature: dispatch `DESELECT_CELL`

```js
import { Actions } from '../../contracts/events.js'

map.on('click', 'firemap-cells', (e) => {
  const props = e.features[0]?.properties
  if (!props) return
  dispatch({
    type: Actions.SELECT_CELL,
    cell: { lat: e.lngLat.lat, lng: e.lngLat.lng, values: props },
  })
})
map.on('click', (e) => {
  // Only fires if no feature was clicked (use layer-specific handler above for features)
})
```

---

## components/map/static-layers.js

Add two permanent overlay layers on top of the basemap. Call this from `index.js`
inside the `map.once('load')` callback, before `onMapReady`.

### 1. California county borders (always visible)

Source: load `/counties-ca.geojson` from the `public/` folder (a lightweight
~300 KB file of California county boundaries — Agent G or orchestrator will add this
from the Census TIGER simplified data).

```js
map.addSource('counties', { type: 'geojson', data: '/counties-ca.geojson' })
map.addLayer({
  id: 'county-borders',
  type: 'line',
  source: 'counties',
  paint: {
    'line-color': ['case', ['==', scheme, 'dark'], 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.2)'],
    'line-width': 0.8,
    'line-dasharray': [3, 2],
  },
})
```

Re-apply after `setStyle()` calls (style reload removes all custom layers).

### 2. Lat/lon graticule (toggled via a map control button)

Generate GeoJSON lines programmatically — no external file needed:

```js
function buildGraticule(latStep = 2, lonStep = 2) {
  // Returns a GeoJSON FeatureCollection of horizontal and vertical lines
  // covering the California bounding box [-125, 32, -113, 43]
  const features = []
  for (let lat = 32; lat <= 43; lat += latStep) {
    features.push({ type: 'Feature', geometry: { type: 'LineString',
      coordinates: [[-125, lat], [-113, lat]] },
      properties: { label: `${lat}°N`, type: 'lat' } })
  }
  for (let lon = -124; lon <= -113; lon += lonStep) {
    features.push({ type: 'Feature', geometry: { type: 'LineString',
      coordinates: [[lon, 32], [lon, 43]] },
      properties: { label: `${Math.abs(lon)}°W`, type: 'lon' } })
  }
  return { type: 'FeatureCollection', features }
}
```

Add as source + layer (type: 'line', dashed, low opacity). Add a symbol layer
on top for the degree labels at map edges (font size 10, color muted).

Toggle visibility with `map.setLayoutProperty('graticule', 'visibility', 'visible'|'none')`.

Add a small toggle button in the bottom-right corner of the map (not inside the
sidebar) that calls this. Button shows a grid icon (⊞ or similar).

State for graticule visibility lives locally in the Map component (not in global
AppState) — it's a purely cosmetic preference.

---

## Header logo

The map component does NOT render the logo — that is the Pages Agent's responsibility.
The header is rendered in `pages/index.js` above the map/sidebar layout.

Logo files (use correct version per color scheme):
- Dark mode:  `SDSS_brand.png` (wordmark) + `LabLogo_light.png` (symbol)
- Light mode: `SDSS_brand_white.png` (wordmark) + `LabLogo_border.png` (symbol)

Placement:
- Wordmark → top-left of a fixed header bar (56px tall), same position as
  "CarbonPlan" in the reference site
- Symbol → bottom of the sidebar, above the Methods link

---

## Done when
- [ ] Map initializes centered on California
- [ ] Basemap switches dark ↔ light
- [ ] Data layer appears when tilesUrl is set (or GeoJSON fallback for dev)
- [ ] County borders render as dashed lines at all zoom levels
- [ ] Graticule toggle button shows/hides lat/lon lines with degree labels
- [ ] Percentile filter updates the MapLibre filter expression
- [ ] Cell click dispatches SELECT_CELL with all properties
- [ ] `onMapReady` is called so parent can pass map to AreaTool
- [ ] Map cleans up on unmount
