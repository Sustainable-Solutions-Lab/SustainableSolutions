# Agent F — Detail Panel Agent

## Role
Build the panel that appears when a user clicks a grid cell, showing all variable values
for that cell plus a small bar chart comparing benefit vs. cost.

## Reads (do not modify)
- `contracts/project-config.js`
- `contracts/events.js`
- `lib/format.js`         (formatValue, formatCoord)
- `theme/index.js`

## Writes (owns these files)
- `components/detail-panel/index.js`
- `components/detail-panel/bar-chart.js`

## Must NOT touch
Everything outside `components/detail-panel/`.

---

## components/detail-panel/index.js

```js
// Props:
// config:    ProjectConfig
// cell:      CellData | null
// dispatch:  Dispatch
export function DetailPanel({ config, cell, dispatch }) { ... }
```

Behavior:
- Renders nothing (returns null) when `cell` is null
- Appears as a card overlaid on the map (bottom-right on desktop, bottom on mobile)
- Shows: formatted coordinates, then a row per variable with label + formatted value
- Highlights the currently active variable row
- Shows `<BenefitCostChart>` below the value rows
- Has a close button that dispatches DESELECT_CELL

Use `theme/index.js` cards.panel variant for the card background.

## components/detail-panel/bar-chart.js

```js
// Props:
// cell:    CellData
// config:  ProjectConfig
export function BenefitCostChart({ cell, config }) { ... }
```

A small horizontal bar chart (SVG, ~200×80px) showing:
- One bar for total_benefit (green)
- One bar for treatment_cost (orange)
- A vertical line at the net_benefit breakeven point

If the cell values don't include these specific columns, render nothing gracefully.
All bar widths are relative to the larger of the two values.

---

## Done when
- [ ] Panel is null when no cell is selected
- [ ] Panel shows all variable values from config.variables
- [ ] Values are formatted correctly via formatValue
- [ ] Coordinates are shown via formatCoord
- [ ] Close button dispatches DESELECT_CELL
- [ ] BenefitCostChart renders benefit vs cost bars
- [ ] Chart handles missing values without crashing
