# Agent E — Sidebar Agent

## Role
Build the left sidebar with: layer tabs, dimension controls, legend, percentile filter,
and summary stats line. All controls are driven purely by config — zero hardcoded values.

## Reads (do not modify)
- `contracts/project-config.js`
- `contracts/events.js`
- `lib/colormap.js`           (buildLegendStops)
- `lib/format.js`             (formatValue)
- `lib/get-active-variable.js`(getActiveVariable)
- `theme/index.js`

## Writes (owns these files)
- `components/sidebar/index.js`
- `components/sidebar/layer-tabs.js`
- `components/sidebar/dimension-control.js`
- `components/sidebar/legend.js`
- `components/sidebar/percentile-filter.js`

## Must NOT touch
Everything outside `components/sidebar/`.

---

## components/sidebar/index.js

```js
// Props:
// config:    ProjectConfig
// state:     AppState
// dispatch:  Dispatch
export function Sidebar({ config, state, dispatch }) { ... }
```

Layout: fixed left panel, 280px wide, full-height. Collapsible via a toggle button
on its right edge. On mobile (< 640px): collapses to a bottom sheet.

Top-to-bottom structure:
1. Project title + one-line description
2. `<LayerTabs>` — which display mode (Costs / Benefits / Net Benefits / Inputs)
3. One `<DimensionControl>` per dimension in the active layer's `dimensionIds`
4. `<Legend>` for the active variable
5. `<PercentileFilter>` — always visible, applies to active variable
6. "Area tool" toggle button (dispatches TOGGLE_AREA_TOOL)
7. "Methods" link (dispatches TOGGLE_METHODS)

---

## components/sidebar/layer-tabs.js

```js
// Props: config, state, dispatch
export function LayerTabs({ config, state, dispatch }) { ... }
```

Renders `config.layers` as a row of tab buttons (or pills). Active tab has a
colored bottom border using `theme.colors.primary`. On click:
```js
dispatch({ type: Actions.SET_LAYER, layerId: layer.id })
```

---

## components/sidebar/dimension-control.js

```js
// Props:
// dimension: Dimension
// value:     current value (from state.activeDimensions[dimension.id])
// dispatch:  Dispatch
export function DimensionControl({ dimension, value, dispatch }) { ... }
```

Renders the right control for `dimension.type`:
- `'toggle'`  → row of pill buttons; active one highlighted
- `'slider'`  → HTML range input with numeric labels
- `'dropdown'`→ native <select>

On change: `dispatch({ type: Actions.SET_DIMENSION, dimensionId, value })`

---

## components/sidebar/legend.js

```js
// Props: variable (Variable | null)
export function Legend({ variable }) { ... }
```

- If `variable` is null or type is 'categorical': render category swatches
- Otherwise: horizontal gradient bar from `buildLegendStops(variable, 30)` stops
- Labels: min on left, zero/midpoint in center (if diverging), max on right
- Variable unit shown above the bar
- Uses inline SVG rect or CSS linear-gradient for the color bar

---

## components/sidebar/percentile-filter.js

```js
// Props:
// variable:          Variable | null      - active variable (for label/unit)
// percentileRange:   { low: number, high: number }
// featureCount:      number   - total features (to show filtered count)
// filteredCount:     number   - features within percentile range
// filteredMean:      number | null
// filteredMedian:    number | null
// dispatch:          Dispatch
export function PercentileFilter({ variable, percentileRange, featureCount,
                                   filteredCount, filteredMean, filteredMedian,
                                   dispatch }) { ... }
```

Renders:
1. Section header: "Filter" with the active variable label
2. A **dual-handle range slider** for low/high percentile (0–100)
   - Use two overlapping `<input type="range">` elements, each with `z-index` logic
     to handle which thumb is on top
3. Labels: "Bottom X%" and "Top X%" (derived from 100 - high)
   - e.g., "Top 11%" when high = 89
4. Below the slider:
   - `{filteredCount} cells ({pct}%)` count line
   - `Mean: {formatted}  ·  Median: {formatted}`

On slider change:
```js
dispatch({ type: Actions.SET_PERCENTILE, low: newLow, high: newHigh })
```

### Notes on dual-handle range
Two `<input type="range">` stacked absolutely with pointer-events logic:
```jsx
<div style={{ position: 'relative', height: 20 }}>
  <input type="range" min={0} max={100} value={low}
    style={{ position: 'absolute', pointerEvents: high < 100 ? 'none' : 'auto' }}
    onChange={e => dispatch({ type: Actions.SET_PERCENTILE, low: +e.target.value, high })} />
  <input type="range" min={0} max={100} value={high}
    style={{ position: 'absolute' }}
    onChange={e => dispatch({ type: Actions.SET_PERCENTILE, low, high: +e.target.value })} />
</div>
```

---

## Mobile behavior

The sidebar does NOT handle its own show/hide on mobile — that is controlled by
`pages/index.js` via a `sidebarOpen` boolean. The sidebar simply renders normally;
the parent shows or hides it.

What the sidebar DOES own:
- The **lab symbol logo** at the very bottom, above the Methods link:
  ```jsx
  <img
    src={state.colorScheme === 'dark' ? '/LabLogo_light.png' : '/LabLogo_border.png'}
    alt="Sustainable Solutions Lab"
    style={{ width: 40, height: 40, marginBottom: 8 }}
  />
  ```
  This is a clickable link to `https://sustainablesolutions.stanford.edu`.

---

## Done when
- [ ] Layer tabs render and clicking changes state.activeLayer
- [ ] Dimension controls show only for the active layer's dimensionIds
- [ ] Legend gradient matches active variable's colormap
- [ ] Categorical legend shows swatches (for cheapest_type)
- [ ] Dual-handle percentile slider updates state.percentileRange
- [ ] Filtered count and mean/median display below slider
- [ ] Area tool toggle button dispatches TOGGLE_AREA_TOOL
- [ ] Methods link dispatches TOGGLE_METHODS
- [ ] Lab symbol logo renders at bottom, switches with color scheme
