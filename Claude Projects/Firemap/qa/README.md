# QA System

Two-track visual quality assurance: Python (data) and browser (UI components).

---

## Track 1 — Data QA (Python)

**`qa/inspect_data.py`** — run after generating synthetic data or loading real data.

```bash
cd /path/to/firemap
python qa/inspect_data.py --input data/synthetic_ca.csv --output qa/output/
```

Produces PNG files in `qa/output/`:

| File | What to check |
|------|---------------|
| `map_fire_prob.png`     | Fire risk centers in Sierra Nevada foothills and S. CA mountains |
| `map_veg_density.png`   | Vegetation concentrated in mountains and coastal ranges |
| `map_net_rx_current.png`| Blue (positive) zones overlap with high fire risk + WUI proximity |
| `map_cheapest.png`      | Rx burn dominant in moderate terrain; mechanical in dense flat areas |
| `hist_costs.png`        | All three cost distributions; rx burn should be cheapest on average |
| `hist_benefits.png`     | Benefit distributions; 2100 shifted right relative to current |
| `hist_net_benefits.png` | Net benefit distributions; mean should be near paper's $90–220k/km² |
| `correlation.png`       | fire_prob × total_benefit should be strongly correlated |
| `summary_stats.csv`     | Min/mean/max/median for every numeric column |

### What makes good synthetic data

- **Fire risk**: clearly concentrated in Sierra foothills (37–40°N, 119–121°W) and
  S. CA mountains, not uniform noise
- **Cheapest treatment**: Rx burn dominant in accessible flat/moderate terrain;
  mechanical or hand treatment cheapest in very steep/dense areas
- **Net benefit sign**: positive (blue) in high fire risk + WUI areas; negative (red)
  in low-risk/high-cost areas
- **Climate amplification**: 2050 benefits should be visibly higher than current;
  2100 higher still. Distribution shift clearly visible in histograms.
- **BCR distribution**: most cells < 1 (treatment not cost-effective); a minority
  (top ~10–20%) strongly positive — this matches the paper's finding that
  prioritizing top decile dramatically increases efficiency.

---

## Track 2 — UI Component QA (browser)

**`/qa` route** — run the dev server and navigate to `http://localhost:3000/qa`.

```bash
npm install
npm run dev
# open http://localhost:3000/qa
```

The QA page is organized in sections, one per agent:

| Section | What to check |
|---------|---------------|
| **Color Scales** | Each variable's legend renders correctly. Diverging scales centered at zero/midpoint. Categorical scale shows 3 distinct swatches. |
| **Variable Selector** | All layer tabs render. Clicking changes active layer. Dimension controls show/hide correctly per layer. |
| **Legend** | Gradient bar, min/max labels, and unit all display. Diverging variables show midpoint label. |
| **Detail Panel** | All variable values display with correct formatting ($220k/km², 3.2 ratio, etc.). Close button works. Bar chart renders. |
| **Sidebar** | Collapsible toggle works. Percentile filter renders as dual-handle slider. Area tool toggle visible. |
| **Map (mini)** | Basemap loads (Stadia dark). California is centered. |

### Red flags to watch for

- Any component that crashes with "cannot read properties of undefined" — means the
  component is not handling `config.variables.find()` returning undefined gracefully
- Color bar showing uniform gray — colormap name doesn't match `INTERPOLATORS` in lib/colormap.js
- Percentile filter showing wrong count — make sure it's counting features, not rows
- Detail panel values showing "—" for all fields — variable id mismatch between config
  and CSV column names

---

## Track 3 — Integration QA (manual)

After agents D, E, F complete Phase 3:

1. Run `npm run dev`
2. Open `http://localhost:3000`
3. Check this list:

- [ ] Map loads and California is centered
- [ ] Each layer tab switches the map variable
- [ ] Dimension toggles (treatment, climate) update the map
- [ ] Clicking a grid cell opens the detail panel with values
- [ ] Closing the detail panel works
- [ ] Color scheme toggle switches dark ↔ light
- [ ] Percentile filter to top 11% shows only the highest net-benefit cells
- [ ] Mean and median update when percentile filter changes
- [ ] Area tool: click activates drawing mode, drag draws circle
- [ ] Area stats panel shows mean/median for variables in areaTool.aggregateVariableIds
- [ ] Methods panel opens and shows the MDX content
- [ ] Page title matches project title
