/**
 * projects/food-emissions/config.js
 *
 * Configuration for: Mapped Drivers of Food Emissions — global cropland
 * management GHG emissions by source, with a dataset-variant switcher.
 *
 * Companion project: "Mapped drivers of food emissions" (Davis & DeAngelo,
 * in prep) — an annual gridded extension of Cao et al. (2026, Nature Climate
 * Change), replicated bit-exactly and corrected (see the paper's replication
 * appendix), merged with Cornerstone's jurisdictional direct land-use-change
 * framework.
 *
 * Feature model: 0.25-degree cell centroids exported by the analysis repo
 * (Gridded LM/pipeline/export_explorer_cells.py). Each cell carries
 * per-source 2020 emissions (kt CO2e: fer man res rice peat urea burn),
 * per-variant totals (tot_cor / tot_rep / tot_mrg), per-variant cropland
 * intensities (int_* in t CO2e/ha), cropland area (ha), and the country
 * code (m49) that keys the national trend series in the area panel.
 *
 * Variants:
 *   corrected   - Cao et al. model with the rice-parameter bugs fixed (default)
 *   replication - faithful to the published Cao et al. numbers
 *   merged      - peat replaced by the Cornerstone LM floor (LUC pulse joins
 *                 once JDLUC event grids land)
 *
 * @type {import('../../contracts/project-config').ProjectConfig}
 */
const config = {
  id: 'food-emissions',
  eyebrow: 'INTERACTIVE MAP',
  title: 'Food Emissions',
  summary:
    'Global cropland greenhouse-gas emissions by source — draw an area to see its totals, mix, and trend.',
  description:
    'Greenhouse-gas emissions from global cropland management — fertilizer and manure N₂O, rice CH₄, drained peatland, crop residues, and residue burning — on a quarter-degree grid, reference year 2020. Use the area tool to draw a circle and see the enclosed emissions total, source mix, and national-trend composite for 2000–2024. The variant toggle switches between a faithful replication of Cao et al. (2026), a corrected version of that model, and a merged lineage using the Cornerstone peatland framework.',

  region: {
    center: [15, 18],
    zoom: 1.5,
    minZoom: 1.2,
    maxZoom: 8,
    useCaliforniaOverlay: false,
  },

  // ── Layers (sidebar tabs) ────────────────────────────────────────────────
  layers: [
    {
      id: 'total',
      label: 'Total intensity',
      description: 'All-source emissions per hectare of cropland, 2020.',
      dimensionIds: ['variant'],
    },
    {
      id: 'source',
      label: 'By source',
      description: 'Emissions from a single source per cell, 2020 (corrected variant).',
      dimensionIds: ['source'],
    },
  ],

  // ── Dimensions ───────────────────────────────────────────────────────────
  dimensions: [
    {
      id: 'variant',
      label: 'Dataset variant',
      type: 'toggle',
      defaultValue: 'cor',
      options: [
        { id: 'cor', label: 'Corrected' },
        { id: 'rep', label: 'Replication' },
        { id: 'mrg', label: 'Merged peat' },
      ],
    },
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
  ],

  // ── Variables ────────────────────────────────────────────────────────────
  variables: [
    // Total-intensity layer: one variable per dataset variant.
    ...[
      ['int_cor', 'cor', 'Total emissions intensity — corrected'],
      ['int_rep', 'rep', 'Total emissions intensity — replication'],
      ['int_mrg', 'mrg', 'Total emissions intensity — merged peat'],
    ].map(([id, variant, label]) => ({
      id,
      label,
      unit: 't CO₂e/ha',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 8 },
      alphaFloor: 0.25,
      alphaPower: 0.5,
      layer: 'total',
      dimensionValues: { variant },
      description:
        'All-source cropland emissions per hectare of harvested area, 2020.',
    })),
    // By-source layer: absolute kt per cell (corrected variant).
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
      alphaFloor: 0.25,
      alphaPower: 0.5,
      layer: 'source',
      dimensionValues: { source: id },
      description: `${label} emissions per quarter-degree cell, 2020 (corrected variant).`,
    })),
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
    aggregateVariableIds: [
      'tot_cor', 'tot_rep', 'tot_mrg',
      'fer', 'man', 'res', 'rice', 'peat', 'urea', 'burn',
    ],
    // Opt-in trend chart (stats-panel.jsx): compose the area's 2000-2024
    // trajectory from national per-source series, weighting each country's
    // trend by the share of its emissions inside the circle.
    trend: {
      url: '/tools/food-emissions/national-trends.json',
      // Fixed categorical order; adjacent-pair CVD-validated.
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

  // Local build for now (gitignored); production moves to R2 like the other
  // map tools: scripts/build-food-emissions-tiles.mjs → upload → swap URL.
  tilesUrl: '/tools/food-emissions/food-emissions.pmtiles',
  sourceLayer: 'food-emissions',
  // Single-scale circle renderer: every feature is a 0.25° (~28 km) cell.
  scales: [{ value: 28 }],
}

export default config
