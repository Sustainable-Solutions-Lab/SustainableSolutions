/**
 * projects/food-emissions/config.js
 *
 * Configuration for: Food Emissions — greenhouse-gas emissions from managing
 * the world's croplands, by source, crop, and over time.
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
 * peat urea burn), the all-source total (tot), per-crop props for the top
 * twelve emitting crops (`tot_<crop>`, `<source>_<crop>`), plus cropland ha
 * and the m49 country code.
 *
 * UI model: ONE map. Source and Crop dropdowns pick what is shown; the
 * always-visible year bar at the bottom of the map picks when. Stored props
 * are the 2020 reference; other years multiply each source term by its
 * country's national trajectory (config.yearControl + national-trends.json,
 * computed in the paint expression — see _map/lib/year-factors.js). Compare
 * mode (checkbox in the year bar) shows the difference between two years on
 * a diverging palette.
 *
 * @type {import('../_map/contracts/project-config').ProjectConfig}
 */

const YEARS = Array.from({ length: 25 }, (_, i) => 2000 + i)

// Sources: [id, label, 2020 domain max kt/cell]. The id is the tile prop.
// Ordered roughly largest-first in the dropdown. The last three are
// livestock (interim FAOSTAT-GLE model; no per-crop attribution — a
// specific crop plus a livestock source renders an empty map).
const SOURCES = [
  ['ent', 'Enteric CH₄', 60],
  ['rice', 'Rice CH₄', 120],
  ['prp', 'Pasture manure N₂O', 30],
  ['fer', 'Fertilizer N₂O', 40],
  ['peat', 'Peatland', 150],
  ['mms', 'Manure management CH₄+N₂O', 12],
  ['man', 'Manure applied N₂O', 10],
  ['res', 'Residues N₂O', 6],
  ['urea', 'Urea CO₂', 10],
  ['burn', 'Residue burning', 2],
]
const SOURCE_IDS = SOURCES.map(([id]) => id)
// Cropland sources only — these carry per-crop props (`<src>_<crop>`).
const CROPLAND_SOURCE_IDS = ['fer', 'man', 'res', 'rice', 'peat', 'urea', 'burn']

// Per-crop props exported for the top-emitting crops (exporter TOP_CROPS,
// 81% of the global total). Prop naming: `tot_<crop>`, `<source>_<crop>`.
const CROPS = [
  ['rice', 'Rice'],
  ['whea', 'Wheat'],
  ['maiz', 'Maize (corn)'],
  ['soyb', 'Soybean'],
  ['oilp', 'Oil palm'],
  ['sugc', 'Sugarcane'],
  ['cott', 'Cotton'],
  ['grou', 'Groundnut'],
  ['barl', 'Barley'],
  ['rape', 'Rapeseed'],
  ['pota', 'Potato'],
  ['sorg', 'Sorghum'],
]

// One variable per source × crop cell of the selection grid. `yearTerms`
// lists the reference-year props (with their source for factor lookup) that
// sum to the variable — the year bar scales each term by its national
// trajectory, so every combination animates and compares without per-year
// tile props.
function makeVariable({ source, crop }) {
  const cropSuffix = crop === 'all' ? '' : `_${crop}`
  const cropLabel = crop === 'all' ? null : CROPS.find(([c]) => c === crop)[1]
  const shared = {
    unit: 'kt CO₂e',
    colormap: 'SpectralHot',
    diverging: false,
    alphaFloor: 0.02,
    alphaPower: 0.35,
    layer: 'map',
    dimensionValues: { source, crop },
  }
  if (source === 'all') {
    return {
      ...shared,
      id: `tot${cropSuffix}`,
      label: cropLabel ? `Total emissions — ${cropLabel}` : 'Total emissions',
      domain: { min: 0, max: crop === 'all' ? 250 : 120 },
      yearTerms: (crop === 'all' ? SOURCE_IDS : CROPLAND_SOURCE_IDS)
        .map((s) => ({ prop: `${s}${cropSuffix}`, src: s })),
      description: cropLabel
        ? `All-source emissions attributed to ${cropLabel.toLowerCase()} per quarter-degree cell.`
        : 'All-source cropland-management emissions per quarter-degree cell.',
    }
  }
  const [, srcLabel, srcMax] = SOURCES.find(([s]) => s === source)
  return {
    ...shared,
    id: `${source}${cropSuffix}`,
    label: cropLabel ? `${srcLabel} — ${cropLabel}` : srcLabel,
    domain: { min: 0, max: crop === 'all' ? srcMax : Math.max(1, srcMax / 2) },
    yearTerms: [{ prop: `${source}${cropSuffix}`, src: source }],
    description: cropLabel
      ? `${srcLabel} emissions attributed to ${cropLabel.toLowerCase()} per quarter-degree cell.`
      : `${srcLabel} emissions per quarter-degree cell.`,
  }
}

const config = {
  id: 'food-emissions',
  mapControlsSide: 'left',
  eyebrow: 'INTERACTIVE MAP',
  title: 'Mapping food system emissions',
  summary:
    'Toward spatially explicit, commodity-specific maps of greenhouse-gas emissions from land use and land management, worldwide and through time.',
  description:
    'Where do food-system greenhouse-gas emissions come from, and how is that changing? This tool works toward a complete, spatially explicit, commodity-specific accounting of emissions from land use and land management — mapped where they happen, traced to what is grown, and followed through time. Today it covers the management of the world’s croplands — synthetic fertilizer and applied manure N₂O, rice paddy CH₄, cultivated drained peatland, crop residues, and residue burning — for 46 crops on a quarter-degree grid, for any year 2000–2024, plus direct livestock emissions: enteric CH₄, manure-management CH₄ and N₂O, and manure deposited on pasture. Cropland emissions follow our updated implementation of Cao et al. (2026), developed in coordination with the original authors, with drained-peatland emissions from the Cornerstone steady-state model; livestock currently distributes FAO national series across gridded animal densities, to be upgraded with forthcoming spatially explicit livestock data. Land-use-change emissions join next, through the Cornerstone jurisdictional framework.',

  region: {
    // Central-Atlantic framing: North America fully in view alongside
    // Africa, Europe, and most of Asia.
    center: [-25, 22],
    zoom: 1.32,
    minZoom: 1.2,
    maxZoom: 8,
    // Poles truncated ~300 km beyond the highest-latitude plotted cells
    // (data spans -51.9 to 68.4): the land layer is clipped to [-55, 71.5]
    // and the viewport edges are hard-locked to the same band, so dragging
    // can never reveal the cut.
    latBounds: [-55, 71.5],
    useCaliforniaOverlay: false,
    useWorldOverlay: true,
  },

  // ── Layers ───────────────────────────────────────────────────────────────
  // A single map: what is shown = Source × Crop dropdowns; when = year bar.
  layers: [
    {
      id: 'map',
      label: 'Emissions',
      description: 'Cropland-management emissions per quarter-degree cell.',
      dimensionIds: ['source', 'crop', 'year', 'yearB', 'compare'],
    },
  ],

  // ── Dimensions ───────────────────────────────────────────────────────────
  // `location: 'map'` keeps a dimension out of the sidebar — the year bar
  // at the bottom of the map renders it instead.
  dimensions: [
    {
      id: 'source',
      label: 'Source',
      type: 'dropdown',
      defaultValue: 'all',
      options: [
        { id: 'all', label: 'All sources' },
        ...SOURCES.map(([id, label]) => ({ id, label })),
      ],
    },
    {
      id: 'crop',
      label: 'Crop',
      type: 'dropdown',
      defaultValue: 'all',
      options: [
        { id: 'all', label: 'All crops' },
        ...CROPS.map(([id, label]) => ({ id, label })),
      ],
    },
    {
      id: 'year',
      label: 'Year',
      type: 'slider',
      animate: true,
      location: 'map',
      defaultValue: '2024',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
    {
      id: 'yearB',
      label: 'From year',
      type: 'slider',
      location: 'map',
      defaultValue: '2000',
      options: YEARS.map((y) => ({ id: String(y), label: String(y) })),
    },
    {
      id: 'compare',
      label: 'Compare years',
      type: 'toggle',
      location: 'map',
      defaultValue: 'off',
      options: [
        { id: 'off', label: 'Off' },
        { id: 'on', label: 'On' },
      ],
    },
  ],

  // ── Year scaling (the year bar + national trajectory factors) ────────────
  yearControl: {
    dimensionId: 'year',
    yearBDimensionId: 'yearB',
    compareDimensionId: 'compare',
    referenceYear: 2020,
    trendsUrl: '/tools/food-emissions/national-trends.json',
    compareColormap: 'SpectralR',
  },

  // ── Variables ────────────────────────────────────────────────────────────
  variables: [
    makeVariable({ source: 'all', crop: 'all' }),
    ...CROPS.map(([crop]) => makeVariable({ source: 'all', crop })),
    ...SOURCES.flatMap(([source]) => [
      makeVariable({ source, crop: 'all' }),
      ...CROPS.map(([crop]) => makeVariable({ source, crop })),
    ]),
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
    aggregateVariableIds: ['tot', 'ent', 'rice', 'prp', 'fer', 'peat', 'mms', 'man', 'res', 'urea', 'burn'],
    // Trend chart (stats-panel.jsx): the drawn area's 2000-2024 trajectory,
    // composed from national per-source series weighted by emissions inside
    // the circle. Fixed categorical order; adjacent-pair CVD-validated.
    trend: {
      url: '/tools/food-emissions/national-trends.json',
      // Spectral picks (the lab's signature palette), ordered so adjacent
      // bands in the stack stay distinguishable.
      sources: [
        { id: 'ent',  prop: 'ent',  label: 'Enteric CH₄',  color: '#F46D43' },
        { id: 'rice', prop: 'rice', label: 'Rice CH₄',     color: '#D53E4F' },
        { id: 'prp',  prop: 'prp',  label: 'Pasture N₂O',  color: '#FEE08B' },
        { id: 'fer',  prop: 'fer',  label: 'Fertilizer',   color: '#3288BD' },
        { id: 'peat', prop: 'peat', label: 'Peat',         color: '#5E4FA2' },
        { id: 'mms',  prop: 'mms',  label: 'Manure mgmt',  color: '#E6F598' },
        { id: 'man',  prop: 'man',  label: 'Manure appl.', color: '#FDAE61' },
        { id: 'res',  prop: 'res',  label: 'Residues',     color: '#66C2A5' },
        { id: 'urea', prop: 'urea', label: 'Urea CO₂',     color: '#ABDDA4' },
        { id: 'burn', prop: 'burn', label: 'Burning',      color: '#9E0142' },
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
