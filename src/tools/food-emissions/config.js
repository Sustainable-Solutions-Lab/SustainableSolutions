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
 * @type {import('../_map/contracts/project-config').ProjectConfig}
 */

const YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i)

const config = {
  id: 'food-emissions',
  eyebrow: 'INTERACTIVE MAP',
  title: 'Mapping food system emissions',
  summary:
    'Toward spatially explicit, commodity-specific maps of greenhouse-gas emissions from land use and land management, worldwide and through time.',
  description:
    'Where do food-system greenhouse-gas emissions come from, and how is that changing? This tool works toward a complete, spatially explicit, commodity-specific accounting of emissions from land use and land management — mapped where they happen, traced to what is grown, and followed through time. Today it covers the management of the world’s croplands — synthetic fertilizer and applied manure N₂O, rice paddy CH₄, cultivated drained peatland, crop residues, and residue burning — for 46 crops on a quarter-degree grid, for any year 2000–2024. Emissions follow our updated implementation of Cao et al. (2026), developed in coordination with the original authors, with drained-peatland emissions from the Cornerstone steady-state model. Livestock beyond cropland-applied manure and land-use-change emissions join next, through the Cornerstone jurisdictional framework.',

  region: {
    // Central-Atlantic framing: North America fully in view alongside
    // Africa, Europe, and most of Asia.
    center: [-25, 22],
    zoom: 1.32,
    minZoom: 1.2,
    maxZoom: 8,
    // Poles truncated ~300 km beyond the highest-latitude plotted cells
    // (data spans -51.9 to 68.4): the land layer is clipped to [-55, 71.5]
    // and the camera center is softly clamped.
    centerLatRange: [-38, 52],
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
      id: 'diff',
      label: 'Difference between years',
      description:
        'Change in all-source emissions per cell between any two years. Blue = decline, red = growth.',
      dimensionIds: ['yearB', 'yearA'],
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
      animate: true,
      defaultValue: '2020',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
    {
      id: 'yearA',
      label: 'To year',
      type: 'slider',
      defaultValue: '2024',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
    {
      id: 'yearB',
      label: 'From year',
      type: 'slider',
      defaultValue: '2000',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
  ],

  // ── Variables ────────────────────────────────────────────────────────────
  variables: [
    {
      id: 'tot',
      label: 'Total emissions',
      unit: 'kt CO₂e',
      colormap: 'SpectralHot',
      diverging: false,
      domain: { min: 0, max: 250 },
      alphaFloor: 0.02,
      alphaPower: 0.35,
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
      colormap: 'SpectralHot',
      diverging: false,
      domain: { min: 0, max },
      alphaFloor: 0.02,
      alphaPower: 0.35,
      layer: 'source',
      dimensionValues: { source: id },
      description: `${label} emissions per quarter-degree cell, 2020.`,
    })),
    // Change-over-time layer: one variable per year, same scale as Total.
    ...YEARS.map((y) => ({
      id: `y${y}`,
      label: `Total emissions — ${y}`,
      unit: 'kt CO₂e',
      colormap: 'SpectralHot',
      diverging: false,
      domain: { min: 0, max: 250 },
      alphaFloor: 0.02,
      alphaPower: 0.35,
      layer: 'years',
      dimensionValues: { year: String(y) },
      // One fixed scale for the whole animation (anchored to the end year):
      // otherwise each frame re-normalizes to its own p99 and change is
      // absorbed by the shifting scale.
      colorAnchorId: `y${YEARS[YEARS.length - 1]}`,
      description: `All-source emissions per cell in ${y}; national statistics carry the trend.`,
    })),
    {
      id: 'ydiff',
      label: 'Change in emissions',
      unit: 'kt CO₂e',
      colormap: 'SpectralR',
      diverging: true,
      domain: { min: -60, max: 60, zero: 0 },
      alphaFloor: 0.05,
      alphaPower: 0.5,
      layer: 'diff',
      diffOfDims: ['yearA', 'yearB'],
      description:
        'All-source emissions in the To year minus the From year, per quarter-degree cell.',
    },
    {
      id: 'intn',
      label: 'Emissions intensity',
      unit: 't CO₂e/ha',
      colormap: 'SpectralHot',
      diverging: false,
      domain: { min: 0, max: 6 },
      alphaFloor: 0.02,
      alphaPower: 0.3,
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
      // Spectral picks (the lab's signature palette), ordered so adjacent
      // bands in the stack stay distinguishable.
      sources: [
        { id: 'fer',  prop: 'fer',  label: 'Fertilizer', color: '#3288BD' },
        { id: 'man',  prop: 'man',  label: 'Manure',     color: '#FDAE61' },
        { id: 'res',  prop: 'res',  label: 'Residues',   color: '#66C2A5' },
        { id: 'rice', prop: 'rice', label: 'Rice CH₄',   color: '#D53E4F' },
        { id: 'peat', prop: 'peat', label: 'Peat',       color: '#5E4FA2' },
        { id: 'urea', prop: 'urea', label: 'Urea CO₂',   color: '#ABDDA4' },
        { id: 'burn', prop: 'burn', label: 'Burning',    color: '#9E0142' },
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
  // Vertical emissions-by-latitude marginal along the map's right edge.
  latProfileUrl: '/tools/food-emissions/lat-profiles.json',
  // Single-scale cell renderer: every feature is a 0.25° (~28 km) cell that
  // grows with zoom to stay contiguous.
  scales: [{ value: 28, radiusMode: 'cell' }],
}

export default config
