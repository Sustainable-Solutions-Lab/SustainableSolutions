/**
 * projects/fuel-treatment/config.js
 *
 * Configuration for: California Wildfire Fuel Treatment Cost-Benefit Analysis
 *
 * Variable ids must match exact column names in the source CSV (and synthetic data).
 * Domain values are calibrated to the synthetic dataset; update after inspecting real data.
 *
 * @type {import('../../contracts/project-config').ProjectConfig}
 */
const config = {
  id: 'fuel-treatment',
  eyebrow: 'INTERACTIVE MAP',
  title: 'Firefuels',
  summary: 'Per-km² costs and benefits of wildfire fuel treatment in California.',
  // Long-form description has moved into projects/fuel-treatment/methods.mdx
  // (rendered when the user opens "Read Methods").
  description:
    'We\'ve analyzed the costs and benefits of treating (i.e. removing) wildfire fuels under a range of scenarios, and these maps show the net benefits, benefits, and costs in different locations across California depending on the type of treatment and assumed climate (current or 2100 under midrange or high warming). You can also see the breakdown of benefits of avoided damages to property and health (the latter related to transported smoke). For details, see <a href="https://eartharxiv.org/repository/view/9858/" target="_blank" rel="noopener noreferrer"><strong>Cheng et al., Prioritizing wildfire fuel management in California, in review.</strong></a>',

  region: {
    center: [-119.5, 37.3],
    zoom: 5.0,
    bounds: [-124.5, 32.5, -114.0, 42.1],
  },

  // ── Layers (sidebar tabs) ────────────────────────────────────────────────
  layers: [
    {
      id: 'net_benefits',
      label: 'Net Benefits',
      description: 'Benefit minus cost. Positive = cost-effective location.',
      dimensionIds: ['treatment', 'climate'],
    },
    {
      id: 'benefits',
      label: 'Benefits',
      description: 'Expected benefit per km² under current and future climate.',
      dimensionIds: ['benefit_component', 'climate'],
    },
    {
      id: 'costs',
      label: 'Costs',
      description: 'Treatment cost per km² by treatment type.',
      dimensionIds: ['treatment'],
    },
    {
      id: 'inputs',
      label: 'Inputs',
      description: 'Spatial inputs used in the model.',
      dimensionIds: ['input_var'],
      hidden: true,
    },
  ],

  // ── Dimensions ───────────────────────────────────────────────────────────
  dimensions: [
    {
      id: 'treatment',
      label: 'Treatment type',
      type: 'toggle',
      defaultValue: 'rx_burn',
      options: [
        { id: 'min',          label: 'Lowest Cost' },
        { id: 'rx_burn',      label: 'Prescribed Burning' },
        { id: 'mechanical',   label: 'Mechanical Thinning' },
        { id: 'hand',         label: 'Manual Thinning' },
        { id: 'herbicide',    label: 'Herbicide/Grazing' },
        { id: 'cheapest_type', label: 'Cheapest Type', visibleForLayers: ['costs'] },
      ],
    },
    {
      id: 'climate',
      label: 'Climate scenario',
      type: 'toggle',
      defaultValue: 'current',
      options: [
        { id: 'current', label: 'Current' },
        { id: 'ssp245',  label: 'SSP2-4.5' },
        { id: 'ssp585',  label: 'SSP5-8.5' },
      ],
    },
    {
      id: 'benefit_component',
      label: 'Component',
      type: 'toggle',
      defaultValue: 'total',
      options: [
        { id: 'total',    label: 'Total' },
        { id: 'property', label: 'Property' },
        { id: 'health',   label: 'Health' },
      ],
    },
    {
      id: 'input_var',
      label: 'Input variable',
      type: 'toggle',
      defaultValue: 'fire_prob',
      options: [
        { id: 'fire_prob',   label: 'Fire Risk' },
        { id: 'veg_density', label: 'Veg. Density' },
        { id: 'slope',       label: 'Slope' },
        { id: 'elevation',   label: 'Elevation' },
        { id: 'wui_dist',    label: 'WUI Distance' },
      ],
    },
  ],

  // ── Variables ────────────────────────────────────────────────────────────
  // Each variable has `layer` and `dimensionValues` so lib/get-active-variable.js
  // can resolve which variable to display from (activeLayer, activeDimensions).
  variables: [

    // ── COSTS ──────────────────────────────────────────────────────────────
    {
      id: 'cost_rx_burn',
      label: 'Cost — Prescribed Burn',
      unit: '$k/km²',
      colormap: 'RdBuRed',
      diverging: false,
      domain: { min: 0, max: 200000 },
      layer: 'costs',
      dimensionValues: { treatment: 'rx_burn' },
      description: 'Annualized cost of prescribed burning.',
    },
    {
      id: 'cost_mechanical',
      label: 'Cost — Mechanical Thinning',
      unit: '$k/km²',
      colormap: 'RdBuRed',
      diverging: false,
      domain: { min: 0, max: 360000 },
      layer: 'costs',
      dimensionValues: { treatment: 'mechanical' },
      description: 'Annualized cost of mechanical vegetation removal.',
    },
    {
      id: 'cost_hand',
      label: 'Cost — Hand Treatment',
      unit: '$k/km²',
      colormap: 'RdBuRed',
      diverging: false,
      domain: { min: 0, max: 420000 },
      layer: 'costs',
      dimensionValues: { treatment: 'hand' },
      description: 'Annualized cost of hand-crew fuel treatment.',
    },
    {
      id: 'min_cost',
      label: 'Lowest Treatment Cost',
      unit: '$k/km²',
      colormap: 'RdBuRed',
      diverging: false,
      domain: { min: 0, max: 200000 },
      layer: 'costs',
      dimensionValues: { treatment: 'min' },
      description: 'The minimum cost across all three treatment types at each location.',
    },
    {
      id: 'cost_herbicide',
      label: 'Cost — Herbicide/Grazing',
      unit: '$k/km²',
      colormap: 'RdBuRed',
      diverging: false,
      domain: { min: 0, max: 120000 },
      layer: 'costs',
      dimensionValues: { treatment: 'herbicide' },
      description: 'Annualized cost of herbicide application or targeted grazing.',
    },
    {
      type: 'categorical',
      id: 'cheapest',
      label: 'Cheapest Treatment Type',
      unit: '',
      layer: 'costs',
      dimensionValues: { treatment: 'cheapest_type' },
      categories: [
        { id: 'rx_burn',    label: 'Prescribed Burning',  color: '#cab2d6', colorDark: '#cab2d6', colorLight: '#6a3d9a' },
        { id: 'mechanical', label: 'Mechanical Thinning',  color: '#fdbf6f', colorDark: '#fdbf6f', colorLight: '#ff7f00' },
        { id: 'hand',       label: 'Manual Thinning',      color: '#fb9a99', colorDark: '#fb9a99', colorLight: '#e31a1c' },
        { id: 'herbicide',  label: 'Herbicide/Grazing',    color: '#b2df8a', colorDark: '#b2df8a', colorLight: '#33a02c' },
      ],
      description: 'Which treatment type has the lowest cost at each location.',
    },

    // ── BENEFITS ──────────────────────────────────────────────────────────
    // Total benefit
    {
      id: 'total_benefit_current',
      label: 'Total Benefit — Current',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 500000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'total', climate: 'current' },
    },
    {
      id: 'total_benefit_ssp245',
      label: 'Total Benefit — SSP2-4.5',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 650000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'total', climate: 'ssp245' },
    },
    {
      id: 'total_benefit_ssp585',
      label: 'Total Benefit — SSP5-8.5',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 800000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'total', climate: 'ssp585' },
    },
    // Property benefit
    {
      id: 'prop_benefit_current',
      label: 'Property Benefit — Current',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 400000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'property', climate: 'current' },
    },
    {
      id: 'prop_benefit_ssp245',
      label: 'Property Benefit — SSP2-4.5',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 520000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'property', climate: 'ssp245' },
    },
    {
      id: 'prop_benefit_ssp585',
      label: 'Property Benefit — SSP5-8.5',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 650000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'property', climate: 'ssp585' },
    },
    // Health benefit
    {
      id: 'health_benefit_current',
      label: 'Health Benefit — Current',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 200000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'health', climate: 'current' },
    },
    {
      id: 'health_benefit_ssp245',
      label: 'Health Benefit — SSP2-4.5',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 260000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'health', climate: 'ssp245' },
    },
    {
      id: 'health_benefit_ssp585',
      label: 'Health Benefit — SSP5-8.5',
      unit: '$k/km²',
      colormap: 'RdBuBlue',
      diverging: false,
      domain: { min: 0, max: 320000 },
      layer: 'benefits',
      dimensionValues: { benefit_component: 'health', climate: 'ssp585' },
    },

    // ── NET BENEFITS ───────────────────────────────────────────────────────
    // Rx burn
    {
      id: 'net_rx_current',
      label: 'Net Benefit — Rx Burn, Current',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -450000, max: 450000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'rx_burn', climate: 'current' },
    },
    {
      id: 'net_rx_ssp245',
      label: 'Net Benefit — Rx Burn, 2050',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -600000, max: 600000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'rx_burn', climate: 'ssp245' },
    },
    {
      id: 'net_rx_ssp585',
      label: 'Net Benefit — Rx Burn, 2100',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -750000, max: 750000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'rx_burn', climate: 'ssp585' },
    },
    // Mechanical
    {
      id: 'net_mech_current',
      label: 'Net Benefit — Mechanical, Current',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -350000, max: 350000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'mechanical', climate: 'current' },
    },
    {
      id: 'net_mech_ssp245',
      label: 'Net Benefit — Mechanical, 2050',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -450000, max: 450000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'mechanical', climate: 'ssp245' },
    },
    {
      id: 'net_mech_ssp585',
      label: 'Net Benefit — Mechanical, 2100',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -600000, max: 600000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'mechanical', climate: 'ssp585' },
    },
    // Hand
    {
      id: 'net_hand_current',
      label: 'Net Benefit — Hand, Current',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -400000, max: 400000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'hand', climate: 'current' },
    },
    {
      id: 'net_hand_ssp245',
      label: 'Net Benefit — Hand, 2050',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -400000, max: 400000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'hand', climate: 'ssp245' },
    },
    {
      id: 'net_hand_ssp585',
      label: 'Net Benefit — Hand, 2100',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -500000, max: 500000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'hand', climate: 'ssp585' },
    },
    // Herbicide/Grazing
    {
      id: 'net_herbicide_current',
      label: 'Net Benefit — Herbicide/Grazing, Current',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -350000, max: 350000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'herbicide', climate: 'current' },
    },
    {
      id: 'net_herbicide_ssp245',
      label: 'Net Benefit — Herbicide/Grazing, 2050',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -450000, max: 450000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'herbicide', climate: 'ssp245' },
    },
    {
      id: 'net_herbicide_ssp585',
      label: 'Net Benefit — Herbicide/Grazing, 2100',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -550000, max: 550000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'herbicide', climate: 'ssp585' },
    },
    // Min cost treatment
    {
      id: 'net_min_current',
      label: 'Net Benefit — Lowest Cost, Current',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -1200, max: 1200, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'min', climate: 'current' },
    },
    {
      id: 'net_min_ssp245',
      label: 'Net Benefit — Lowest Cost, 2050',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -600000, max: 600000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'min', climate: 'ssp245' },
    },
    {
      id: 'net_min_ssp585',
      label: 'Net Benefit — Lowest Cost, 2100',
      unit: '$k/km²',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: -750000, max: 750000, zero: 0 },
      layer: 'net_benefits',
      dimensionValues: { treatment: 'min', climate: 'ssp585' },
    },

    // ── SPATIAL INPUTS ─────────────────────────────────────────────────────
    {
      id: 'fire_prob',
      label: 'Fire Probability',
      unit: '(annual)',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 0.7 },
      layer: 'inputs',
      dimensionValues: { input_var: 'fire_prob' },
      description: 'Annual probability of a fire event at this location.',
    },
    {
      id: 'veg_density',
      label: 'Vegetation Density',
      unit: '(NDVI)',
      colormap: 'Greens',
      diverging: false,
      domain: { min: 0, max: 1 },
      layer: 'inputs',
      dimensionValues: { input_var: 'veg_density' },
      description: 'Normalized vegetation index (proxy for fuel load).',
    },
    {
      id: 'slope',
      label: 'Terrain Slope',
      unit: '°',
      colormap: 'Oranges',
      diverging: false,
      domain: { min: 0, max: 45 },
      layer: 'inputs',
      dimensionValues: { input_var: 'slope' },
      description: 'Average terrain slope in degrees — affects treatment cost and fire spread.',
    },
    {
      id: 'elevation',
      label: 'Elevation',
      unit: 'm',
      colormap: 'Blues',
      diverging: false,
      domain: { min: 0, max: 3000 },
      layer: 'inputs',
      dimensionValues: { input_var: 'elevation' },
    },
    {
      id: 'wui_dist',
      label: 'Distance to WUI',
      unit: 'km',
      colormap: 'Oranges',
      diverging: false,
      domain: { min: 0, max: 100 },
      layer: 'inputs',
      dimensionValues: { input_var: 'wui_dist' },
      description:
        'Distance to the nearest wildland-urban interface. Shorter distance = higher property benefit.',
    },
  ],

  // ── Percentile filter ────────────────────────────────────────────────────
  percentileFilter: {
    enabled: true,
    defaultLow: 0,
    defaultHigh: 100,
  },

  // ── Area tool ────────────────────────────────────────────────────────────
  areaTool: {
    enabled: true,
    defaultRadiusKm: 20,
    maxRadiusKm: 200,
    aggregateVariableIds: [
      'net_rx_current',
      'net_min_current',
      'total_benefit_current',
      'min_cost',
    ],
    // Per-ZIP polygon GeoJSON files (one per California ZIP) live at this
    // R2 prefix. Built locally with scripts/build-ca-zip-polygons.js, then
    // uploaded to R2. A 404 on a ZIP means it's outside California.
    zipsBaseUrl: 'https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/zips/',
  },

  // ── Data ─────────────────────────────────────────────────────────────────
  // Replace with the Cloudflare R2 URL once tiles are built:
  //   python scripts/build_tiles.py --input data.csv --output fuel-treatment.pmtiles
  //   # upload to R2, then:
  tilesUrl: 'https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/fuel-treatment.pmtiles',
  methodsPath: '/projects/fuel-treatment/methods',
}

export default config
