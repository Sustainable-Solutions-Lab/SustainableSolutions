# Scientific plots, dashboards, cartography, geospatial interactions & data

## General evidence-first visualization contract

Every plot/map must answer a named question, use a meaningful visual encoding, show uncertainty and methodological limits when material, and allow a non-visual equivalent. Inputs and plotted results must be reproducible and tied to the same underlying data version.

**Before choosing a chart:** define audience, metric, population/denominator, time range, geography, units, scenario names, missingness, confidence/uncertainty, comparisons, baseline, meaningful origin, user decisions and export needs.

## Visualization choice matrix

| Research task | Preferred forms | Cautions |
|---|---|---|
| Trend through time | line + uncertainty band, small multiples | avoid dual axes, misleading interpolation, unmarked breaks |
| Compare ordered categories | aligned bars/dots | sort intentionally, show zero/reference, avoid 3D |
| Relationship | scatter + fit interval when justified | overplotting, correlation vs causation, log scaling |
| Distribution | histogram, box/violin with sample info | show bins and N, avoid decorative smoothing |
| Share of total | 100% bars, small parts | avoid pies when comparisons require precision |
| Spatial exposure | choropleth or hex grid with normalized values | never color raw counts when rates are intended |
| Spatial intensity | raster, continuous surface, contours | legend thresholds, resolution, interpolation notes |
| Scenario tradeoffs | side-by-side small multiples / scatter / Pareto frontier | clear baseline, scales, unit harmonization |
| Sankey/network | labeled flow diagram when topology is essential | provide accessible tabular edge list |
| Model uncertainty | interval, quantile ribbon, density, fan chart | CI vs range vs ensemble spread precisely labeled |
| Change across two states | slope/dumbbell, diverging bars | label reference period and sign |

## Chart design spec checklist

- Figure ID/number, title, question, result takeaway and descriptive short summary.
- Metric, unit, dimension and normalization (per capita, % vs percentage points, km², etc.).
- Axis title, ticks, time zone/calendar, tick formatting, zero or nonzero minimum justification, log base if used.
- Legend labels, direct labels if feasible, semantic meaning of line types, markers and color; exact legend entries must match marks.
- Clear data-to-visual mapping; accessible categorical colors, textures/line styles, sufficient contrast in light/dark.
- Missing, suppressed, not measured, negative, zero, projected and out-of-domain values are distinct.
- Outliers, aggregation, sampling, inclusion/exclusion thresholds, scenario naming, significance and ranges are explicit.
- Tooltip supports keyboard and is not sole place essential values exist; expose a sortable/scrollable table and downloadable CSV.
- Export PNG/SVG/PDF as applicable with title, legend, methods reference, source, date, units, notes and credits intact.
- Avoid chart junk, 3D, gradients with ambiguous quantitative meaning, auto-animated data that undermines comprehension.

## Plot template specification (normalized object)

```json
{
  "id": "figure-1",
  "title": "ILLUSTRATIVE: Change in modeled exposure",
  "question": "How do scenario outcomes compare by year?",
  "status": "synthetic-example-not-research",
  "measure": {"name": "Illustrative index", "unit": "index points", "aggregation": "annual"},
  "x": {"field": "year", "type": "temporal", "domain": [2030, 2050]},
  "y": {"field": "index", "type": "quantitative", "domain": [0, 100], "zeroBaseline": true},
  "series": [{"id": "baseline", "label": "Baseline", "style": "solid"}, {"id": "scenario", "label": "Alternative", "style": "dashed"}],
  "uncertainty": {"kind": "none", "explanation": "Demonstration data only"},
  "footnotes": [],
  "source": null,
  "dataVersion": "example-1",
  "accessibleTable": true,
  "exports": ["csv", "svg"]
}
```

## Map template specification

```json
{
  "id": "map-1",
  "title": "ILLUSTRATIVE: Spatial data explorer",
  "studyArea": "Specify study region and polygon/bounds",
  "coordinateReferenceSystem": "EPSG:4326 for interoperable data; actual display CRS must be named",
  "layers": [{"id": "exposure", "name": "Illustrative index", "kind": "choropleth", "unit": "index points", "breakMethod": "fixed", "breaks": [0, 20, 40, 60, 80, 100]}],
  "baseMap": {"provider": null, "style": null, "attribution": null},
  "data": {"publisher": null, "date": null, "license": null, "downloadUrl": null},
  "controls": ["keyboard zoom", "region select", "layer toggle", "legend", "reset view", "table view"],
  "missingness": ["no data", "outside scope", "suppressed"],
  "accessibility": {"textSummary": true, "regionTable": true},
  "caveats": ["Not a navigation map; do not infer point precision from coarse grid"]
}
```

## Cartography decision record

- Projection/CRS, layer ordering, precision and aggregation must match the scientific question.
- Color ramps: sequential for magnitude, diverging for signed difference with *meaningful* center, qualitative for categories. No rainbow heat maps without scientifically justified encoding.
- Legend includes min/max/interval method, units, no-data class, population/time period and a human-readable caption. On mobile the legend must be legible and available outside hover.
- Boundary layers label whether administrative divisions imply political claim; use neutral borders and responsible geographic treatment.
- Choose interaction: search by place, selection by name/ID, keyboard zoom, reset, spatial filter, on-map help and table alternative. Keep focus visible.
- Tile/source attribution, geocoding provider, imagery date/license and download attribution must remain legible on mobile and on all exports.
- Support unstable networks: graceful no-tile fallback preserving data table and controls. Chunk expensive layers, bounds-check, simplify geometry at suitable zoom and respect zoom limits.
- Never infer precise coordinates from area-level aggregates; display uncertainty, minimum spatial resolution and CRS.
- Include map scale bar / north direction only where meaningful and correct in the chosen map view.

## Data, model and API behavior

- Explicit dataset and model semantic version, timestamp/time zone, update cadence, geographic and temporal extent, units and number format, last successful refresh, staleness threshold, schema, license and privacy handling.
- Maintain reproducibility for exports: filters, thresholds, scenario IDs, input assumptions, citation, data timestamp, model version, generation timestamp and query hash when available.
- Fetch cancellation and race handling: latest request wins; loading/empty/error/partial/stale are distinct; no silent extrapolation outside supported bounds.
- Cache only when scientifically safe; stale badge/expiry and immutable archived releases where required.
- If comparing scenarios, show their input assumptions side by side and ensure scales/ranges are identical unless deliberately and visibly different.
- If estimates influence safety/health/policy, clearly explain known limitations and avoid overprecision, predictive guarantees or unsupported personal recommendations.
- Preserve machine-readable export fields and accessible data provenance in accompanying README / metadata JSON; use CSV UTF-8, consistent separators, canonical units and date formats; prevent spreadsheet formula injection in untrusted cells.

## Suggested libraries (not mandated)

Inspect existing chart/map tooling first. In React projects, accessible wrappers around the current chart library are preferred over switching for novelty. For geospatial work, verify the actual Leaflet/MapLibre/Mapbox license, browser support and worker requirements. Do not add third-party tracking by default.
