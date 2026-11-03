/**
 * interventions/library.js
 *
 * Presets the user can start from. Cover cropping is the worked example;
 * the others are sketches that show the same machinery handling one-off
 * applications, material costs, transport and pulse mitigation. Their
 * numbers are placeholders and are labelled as such in the tool.
 */
import { coverCropping } from './cover-cropping.js'
import { blankDefinition } from '../engine/schema.js'

const biochar = {
  id: 'biochar',
  name: 'Biochar (sketch)',
  description: 'A one-off application of biochar to cropland. Carbon in the stable fraction stays in the soil; the labile fraction is lost over a few years.',
  notes: 'Placeholder numbers to show one-off material costs and a pulse response. Replace before use.',
  horizon: { years: 30, startYear: 2026 },
  finance: { discountRate: 0.05, carbonPrice: 100, discountCarbon: false },
  area: { layer: 'cropland_ha', share: 1, eligibility: [{ layer: 'cropland_frac', min: 0.01 }] },
  costs: [
    { id: 'biochar', label: 'Biochar, delivered', category: 'opex_variable', basis: 'per_t_material', value: 350, quantity: { type: 'constant', value: 10 }, modifiers: [], timing: { type: 'once', year: 0 }, escalation: 0 },
    { id: 'spreading', label: 'Spreading and incorporation', category: 'capex', basis: 'per_ha', value: 60, modifiers: [], timing: { type: 'once', year: 0 }, escalation: 0 },
    { id: 'mrv', label: 'Monitoring and verification', category: 'mrv', basis: 'per_tco2', value: 5, modifiers: [], timing: { type: 'constant' }, escalation: 0 },
  ],
  mitigation: [
    // 10 t/ha × 75% C × 44/12 × 80% stable ≈ 22 t CO2/ha, booked in year 0.
    { id: 'stable', label: 'Stable biochar carbon', gas: 'CO2', sign: 1, rate: { type: 'constant', value: 22 }, profile: { type: 'once', year: 0 }, leakage: 0, reversal: 0.001 },
    // Labile fraction: 5.5 t CO2/ha returns to the atmosphere over ~5 years (an emission relative to the pulse).
    { id: 'labile', label: 'Labile fraction lost', gas: 'CO2', sign: -1, rate: { type: 'constant', value: 1.1 }, profile: { type: 'window', from: 0, to: 4 }, leakage: 0, reversal: 0 },
  ],
}

const enhancedWeathering = {
  id: 'erw',
  name: 'Enhanced rock weathering (sketch)',
  description: 'Crushed basalt spread on cropland every few years. Weathering is faster where it is warm and wet; rock has to be quarried, ground and hauled.',
  notes: 'Placeholder numbers to show recurring material costs, transport scaled by a layer, and a climate-driven rate. Replace before use.',
  horizon: { years: 30, startYear: 2026 },
  finance: { discountRate: 0.05, carbonPrice: 100, discountCarbon: false },
  area: { layer: 'cropland_ha', share: 1, eligibility: [{ layer: 'cropland_frac', min: 0.01 }, { layer: 'prec_mm', min: 300 }] },
  costs: [
    { id: 'rock', label: 'Rock, crushed at quarry', category: 'opex_variable', basis: 'per_t_material', value: 25, quantity: { type: 'constant', value: 10 }, modifiers: [], timing: { type: 'every', interval: 5, from: 0 }, escalation: 0 },
    { id: 'haul', label: 'Haulage', category: 'transport', basis: 'per_t_material', value: 0.12, quantity: { type: 'constant', value: 10 }, modifiers: [{ type: 'constant', value: 200, label: 'Distance to quarry (km)' }], timing: { type: 'every', interval: 5, from: 0 }, escalation: 0 },
    { id: 'spreading', label: 'Spreading', category: 'opex_fixed', basis: 'per_ha', value: 15, modifiers: [], timing: { type: 'every', interval: 5, from: 0 }, escalation: 0 },
    { id: 'mrv', label: 'Monitoring and verification', category: 'mrv', basis: 'per_tco2', value: 15, modifiers: [], timing: { type: 'constant' }, escalation: 0 },
  ],
  mitigation: [
    {
      id: 'weathering', label: 'CO₂ drawdown by weathering', gas: 'CO2', sign: 1,
      rate: {
        type: 'product',
        factors: [
          { type: 'constant', value: 2.5, label: 'Base rate (t CO₂/ha/yr)' },
          { type: 'layer_linear', layer: 'tavg_c', x0: 5, y0: 0.3, x1: 25, y1: 1.2, min: 0.1, max: 1.4, label: 'Temperature factor', missing: 1 },
          { type: 'layer_linear', layer: 'prec_mm', x0: 300, y0: 0.3, x1: 1500, y1: 1.2, min: 0.2, max: 1.3, label: 'Rainfall factor', missing: 1 },
        ],
      },
      profile: { type: 'ramp', years: 5 },
      leakage: 0,
      reversal: 0,
    },
  ],
}

const noTill = {
  id: 'no_till',
  name: 'No-till (sketch)',
  description: 'Switching from conventional to no-till. Small soil carbon gains that saturate, fuel and labour savings, a possible yield penalty.',
  notes: 'Placeholder numbers to show a cost saving (negative cost) alongside a slow saturating gain. Replace before use.',
  horizon: { years: 30, startYear: 2026 },
  finance: { discountRate: 0.05, carbonPrice: 100, discountCarbon: false },
  area: { layer: 'cropland_ha', share: 1, eligibility: [{ layer: 'cropland_frac', min: 0.01 }] },
  costs: [
    { id: 'equipment', label: 'No-till drill (annualized share)', category: 'capex', basis: 'per_ha', value: 25, modifiers: [], timing: { type: 'constant' }, escalation: 0 },
    { id: 'fuel', label: 'Fuel and labour saved', category: 'revenue', basis: 'per_ha', value: -35, modifiers: [], timing: { type: 'constant' }, escalation: 0 },
    { id: 'herbicide', label: 'Additional herbicide', category: 'opex_fixed', basis: 'per_ha', value: 20, modifiers: [], timing: { type: 'constant' }, escalation: 0 },
    { id: 'mrv', label: 'Monitoring and verification', category: 'mrv', basis: 'per_tco2', value: 5, modifiers: [], timing: { type: 'constant' }, escalation: 0 },
  ],
  mitigation: [
    { id: 'soc', label: 'Soil organic carbon gain', gas: 'CO2', sign: 1, rate: { type: 'product', factors: [{ type: 'constant', value: 0.6, label: 'Base rate (t CO₂/ha/yr)' }, { type: 'layer_classes', layer: 'aridity', breaks: [0.5], values: [1.2, 0.8], label: 'Dryland factor', missing: 1 }] }, profile: { type: 'saturating', k: 0.05 }, leakage: 0, reversal: 0.02 },
  ],
}

export const PRESETS = [coverCropping, biochar, enhancedWeathering, noTill, { ...blankDefinition(), id: 'blank', name: 'Start from scratch' }]

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]
