/**
 * interventions/cover-cropping.js
 *
 * Default definition for cover cropping on existing cropland. Every number
 * here is a starting point to be replaced by the user's own data; the
 * sources and the reasoning are in docs/interventions/cover-cropping.md.
 * Values are real 2024 USD.
 */

export const coverCropping = {
  id: 'cover_cropping',
  name: 'Cover cropping',
  description: 'A winter or off-season cover crop on existing cropland, terminated before the cash crop. Soil carbon accumulates toward a new equilibrium; seed, planting and termination recur every year.',
  notes: 'Default rates follow the Poeplau & Don (2015) meta-analysis (0.32 t C/ha/yr initial gain, saturating). Climate and soil factors are illustrative placeholders pending calibration.',
  horizon: { years: 30, startYear: 2026 },
  finance: { discountRate: 0.05, carbonPrice: 100, discountCarbon: false },
  area: {
    layer: 'cropland_ha',
    share: 1,
    eligibility: [
      { layer: 'cropland_frac', min: 0.01 },
      // Too cold for an off-season cover crop to establish.
      { layer: 'tavg_c', min: 0 },
    ],
  },
  costs: [
    {
      id: 'seed', label: 'Seed', category: 'operating', basis: 'per_ha', value: 90,
      modifiers: [], timing: { type: 'constant' }, escalation: 0,
    },
    {
      id: 'planting', label: 'Planting (drill or broadcast)', category: 'operating', basis: 'per_ha', value: 37,
      modifiers: [], timing: { type: 'constant' }, escalation: 0,
    },
    {
      id: 'termination', label: 'Termination (herbicide or roller)', category: 'operating', basis: 'per_ha', value: 30,
      modifiers: [], timing: { type: 'constant' }, escalation: 0,
    },
    {
      id: 'yield', label: 'Cash-crop yield effect', category: 'opportunity', basis: 'per_ha', value: 0,
      modifiers: [], timing: { type: 'constant' }, escalation: 0,
    },
    {
      id: 'mrv', label: 'Monitoring and verification', category: 'mrv', basis: 'per_tco2', value: 5,
      modifiers: [], timing: { type: 'constant' }, escalation: 0,
    },
    {
      id: 'setup', label: 'Programme set-up', category: 'capital', basis: 'per_project', value: 2_000_000,
      modifiers: [], timing: { type: 'once', year: 0 }, escalation: 0,
    },
  ],
  mitigation: [
    {
      id: 'soc', label: 'Soil organic carbon gain', gas: 'CO2', sign: 1,
      rate: {
        type: 'product',
        factors: [
          // 0.32 t C/ha/yr × 44/12 = 1.17 t CO2/ha/yr in the first year.
          { type: 'constant', value: 1.17, label: 'Base rate (t CO₂/ha/yr)' },
          // Water limits cover-crop biomass, hence carbon input.
          { type: 'layer_classes', layer: 'aridity', breaks: [0.2, 0.5, 0.65], values: [0.3, 0.7, 0.9, 1.0], label: 'Aridity factor', missing: 1 },
          // Growing-season length and decomposition balance.
          { type: 'layer_classes', layer: 'tavg_c', breaks: [5, 12, 22], values: [0.6, 0.9, 1.0, 1.1], label: 'Temperature factor', missing: 1 },
          // Headroom: carbon-poor soils gain more, carbon-rich soils less.
          { type: 'layer_linear', layer: 'soc_030_tc_ha', x0: 20, y0: 1.2, x1: 80, y1: 0.6, min: 0.5, max: 1.2, label: 'Soil carbon headroom', missing: 1 },
        ],
      },
      // Time constant 50 years: total potential ≈ 1.17 / (1 − e^−0.02) ≈ 59 t CO2/ha ≈ 16 t C/ha.
      profile: { type: 'saturating', k: 0.02 },
      leakage: 0,
      reversal: 0,
    },
    {
      id: 'n2o', label: 'Nitrous oxide change', gas: 'N2O', sign: -1,
      rate: { type: 'constant', value: 0.1 },
      profile: { type: 'constant' },
      leakage: 0,
      reversal: 0,
    },
  ],
}
