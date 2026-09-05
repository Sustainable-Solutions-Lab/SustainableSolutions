/**
 * projects/food-emissions/config.js
 *
 * Configuration for: Food Emissions — greenhouse-gas emissions from managing
 * the world's croplands, by source and over time.
 *
 * Companion paper: DeAngelo, Seifried, Steffen & Davis, "Mapped drivers of
 * food emissions" (in preparation) — an annual, corrected extension of
 * Cao et al. (2026, Nature Climate Change), merged with Cornerstone's
 * jurisdictional land-use-change framework.
 *
 * One canonical dataset (no variants): our updated Cao-lineage model
 * (IPCC 2019 reference rice parameters; updates coordinated with the
 * original authors) with drained-peatland emissions from the Cornerstone
 * steady-state occupation floor.
 *
 * Feature model (Gridded LM/pipeline/export_explorer_cells.py): 0.25-degree
 * cell centroids with per-source 2020 emissions (kt CO2e: fer man res rice
 * peat urea burn), the all-source total (tot), per-hectare intensity (intn,
 * masked where cropland <1000 ha), annual totals y2000..y2024 (each source
 * riding its country's national trajectory from the annual extension), plus
 * cropland ha and the m49 country code that keys the trend series.
 *
 * @type {import('../../contracts/project-config').ProjectConfig}
 */

const YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i)

const config = {
  id: 'food-emissions',
  eyebrow: 'INTERACTIVE MAP',
  title: 'Food Emissions',
  summary:
    'Greenhouse-gas emissions from managing the world’s croplands, by source and over time — draw an area to see its totals, mix, and trend.',
  description:
    'Greenhouse-gas emissions from the management of the world’s croplands — synthetic fertilizer and applied manure N₂O, rice paddy CH₄, cultivated drained peatland, crop residues, and residue burning — for 46 crops on a quarter-degree grid. The map shows the 2020 reference year; the Change-over-time layer and the area tool’s trend chart cover 2000–2024, with annual national statistics carrying the trend. Emissions follow our updated implementation of Cao et al. (2026), developed in coordination with the original authors, with drained-peatland emissions from the Cornerstone steady-state model. Livestock emissions beyond cropland-applied manure (enteric fermentation, manure on pasture) and land-use-change emissions are not yet included — they join through the Cornerstone jurisdictional framework.',

  region: {
    center: [15, 18],
    zoom: 1.5,
    minZoom: 1.2,
    maxZoom: 8,
    useCaliforniaOverlay: false,
    useWorldOverlay: true,
  },

  // ── Layers (sidebar tabs) ────────────────────────────────────────────────
  layers: [
    {
      id: 'total',
      label: 'Total emissions',
      description: 'All-source emissions per quarter-degree cell, 2020.',
      dimensionIds: [],
    },
    {
      id: 'source',
      label: 'By source',
      description: 'Emissions from a single source per cell, 2020.',
      dimensionIds: ['source'],
    },
    {
      id: 'years',
      label: 'Change over time',
      description:
        'All-source emissions per cell for any year 2000–2024. Cell patterns follow national statistics; drag the slider to watch the evolution.',
      dimensionIds: ['year'],
    },
    {
      id: 'intensity',
      label: 'Per-hectare intensity',
      description:
        'All-source emissions per hectare of cropland, 2020. Drained peatland dominates the extremes.',
      dimensionIds: [],
    },
  ],

  // ── Dimensions ───────────────────────────────────────────────────────────
  dimensions: [
    {
      id: 'source',
      label: 'Source',
      type: 'dropdown',
      defaultValue: 'rice',
      options: [
        { id: 'fer', label: 'Fertilizer N₂O' },
        { id: 'man', label: 'Manure N₂O' },
        { id: 'res', label: 'Residues N₂O' },
        { id: 'rice', label: 'Rice CH₄' },
        { id: 'peat', label: 'Peatland' },
        { id: 'urea', label: 'Urea CO₂' },
        { id: 'burn', label: 'Residue burning' },
      ],
    },
    {
      id: 'year',
      label: 'Year',
      type: 'slider',
      defaultValue: '2020',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
  ],

  // ── Variables ────────────────────────────────────────────────────────────
  variables: [
    {
      id: 'tot',
      label: 'Total emissions',
      unit: 'kt CO₂e',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 250 },
      alphaFloor: 0.35,
      alphaPower: 0.5,
      layer: 'total',
      description: 'All-source cropland-management emissions per quarter-degree cell, 2020.',
    },
    // By-source layer (kt per cell, 2020).
    ...[
      ['fer', 'Fertilizer N₂O', 40],
      ['man', 'Manure N₂O', 10],
      ['res', 'Residues N₂O', 6],
      ['rice', 'Rice CH₄', 120],
      ['peat', 'Peatland', 150],
      ['urea', 'Urea CO₂', 10],
      ['burn', 'Residue burning', 2],
    ].map(([id, label, max]) => ({
      id,
      label,
      unit: 'kt CO₂e',
      colormap: 'Oranges',
      diverging: false,
      domain: { min: 0, max },
      alphaFloor: 0.35,
      alphaPower: 0.5,
      layer: 'source',
      dimensionValues: { source: id },
      description: `${label} emissions per quarter-degree cell, 2020.`,
    })),
    // Change-over-time layer: one variable per year, same scale as Total.
    ...YEARS.map((y) => ({
      id: `y${y}`,
      label: `Total emissions — ${y}`,
      unit: 'kt CO₂e',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 250 },
      alphaFloor: 0.35,
      alphaPower: 0.5,
      layer: 'years',
      dimensionValues: { year: String(y) },
      description: `All-source emissions per cell in ${y}; national statistics carry the trend.`,
    })),
    {
      id: 'intn',
      label: 'Emissions intensity',
      unit: 't CO₂e/ha',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 6 },
      alphaFloor: 0.8,
      alphaPower: 0.25,
      layer: 'intensity',
      description:
        'All-source emissions per hectare of harvested cropland; extremes are drained-peatland cells.',
    },
  ],

  percentileFilter: {
    enabled: true,
    defaultLow: 0,
    defaultHigh: 100,
  },

  // ── Area tool ────────────────────────────────────────────────────────────
  areaTool: {
    enabled: true,
    defaultRadiusKm: 250,
    maxRadiusKm: 1500,
    aggregateVariableIds: ['tot', 'fer', 'man', 'res', 'rice', 'peat', 'urea', 'burn'],
    // Trend chart (stats-panel.jsx): the drawn area's 2000-2024 trajectory,
    // composed from national per-source series weighted by emissions inside
    // the circle. Fixed categorical order; adjacent-pair CVD-validated.
    trend: {
      url: '/tools/food-emissions/national-trends.json',
      sources: [
        { id: 'fer',  prop: 'fer',  label: 'Fertilizer', color: '#2a78d6' },
        { id: 'man',  prop: 'man',  label: 'Manure',     color: '#eb6834' },
        { id: 'res',  prop: 'res',  label: 'Residues',   color: '#1baf7a' },
        { id: 'rice', prop: 'rice', label: 'Rice CH₄',   color: '#eda100' },
        { id: 'peat', prop: 'peat', label: 'Peat',       color: '#e87ba4' },
        { id: 'urea', prop: 'urea', label: 'Urea CO₂',   color: '#008300' },
        { id: 'burn', prop: 'burn', label: 'Burning',    color: '#4a3aa7' },
      ],
      countryProp: 'm49',
      referenceYear: 2020,
    },
  },

  // Tiles on R2 like the other map tools; rebuild via
  // scripts/build-food-emissions-tiles.mjs, upload with
  // `rclone copy build/tiles/food-emissions/food-emissions.pmtiles r2:ssl-data/food-emissions/`.
  tilesUrl: 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions/food-emissions.pmtiles',
  sourceLayer: 'food-emissions',
  distributionsUrl: '/tools/food-emissions/distributions.json',
  // Single-scale cell renderer: every feature is a 0.25° (~28 km) cell that
  // grows with zoom to stay contiguous.
  scales: [{ value: 28, radiusMode: 'cell' }],
}

export default config
