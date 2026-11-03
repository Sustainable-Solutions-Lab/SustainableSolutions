/**
 * ui/mapVariables.js — what the map can show. Result views come from the
 * evaluation; "in year" views are recomputed for the year-bar year; input
 * views show the raw layers so users can see what drives the result.
 */
import { yearField } from '../engine/evaluate.js'

export const RESULT_VARIABLES = [
  { id: 'lcoa', label: 'Cost per tonne (levelized)', unit: '$/t CO₂e', colormap: 'Spectral', clampMin: 0, clampMax: 1000, hint: 'Present value of all costs over the horizon divided by the tonnes mitigated.' },
  { id: 'net_benefit_ha', label: 'Net benefit per hectare at the carbon price', unit: '$/ha', colormap: 'RdBu', diverging: true, hint: 'Present value of the carbon revenue minus the costs, per treated hectare.' },
  { id: 'mit_total_ha', label: 'Abatement over the horizon, per ha', unit: 't CO₂e/ha', colormap: 'SpectralR' },
  { id: 'mit_total_cell', label: 'Abatement over the horizon, per cell', unit: 't CO₂e', colormap: 'SpectralR' },
  { id: 'mit_rate', label: 'Abatement in year, per ha', unit: 't CO₂e/ha/yr', colormap: 'SpectralR', yearly: true },
  { id: 'mit_cum', label: 'Abatement through year, per ha', unit: 't CO₂e/ha', colormap: 'SpectralR', yearly: true },
  { id: 'cost_ha_yr', label: 'Cost per ha per year (annualized)', unit: '$/ha/yr', colormap: 'SpectralR' },
  { id: 'cost_ha', label: 'Cost in year, per ha', unit: '$/ha', colormap: 'SpectralR', yearly: true },
  { id: 'area', label: 'Treated area', unit: 'ha', colormap: 'SpectralR' },
]

export function layerVariables(grid) {
  return Object.values(grid.meta).map((m) => ({
    id: `layer:${m.id}`, layer: m.id, label: m.label ?? m.id, unit: m.unit ?? '', colormap: 'Viridis', group: 'Inputs', source: m.source,
  }))
}

export function computeField(variable, res, grid, year) {
  if (variable.layer) return grid.layers[variable.layer]
  switch (variable.id) {
    case 'lcoa': return res.lcoa
    case 'net_benefit_ha': {
      const out = new Float32Array(res.area.length)
      for (let i = 0; i < out.length; i++) out[i] = res.area[i] > 0 ? res.netBenefit[i] / res.area[i] : NaN
      return out
    }
    case 'mit_total_ha': {
      const out = new Float32Array(res.area.length)
      for (let i = 0; i < out.length; i++) out[i] = res.area[i] > 0 ? res.mitTotal[i] / res.area[i] : NaN
      return out
    }
    case 'mit_total_cell': return res.mitTotal
    case 'mit_rate': return yearField(res, year, 'mit_rate')
    case 'mit_cum': return yearField(res, year, 'mit_cum')
    case 'cost_ha_yr': return res.costPerHaYr
    case 'cost_ha': return yearField(res, year, 'cost_ha')
    case 'area': {
      const out = new Float32Array(res.area.length)
      for (let i = 0; i < out.length; i++) out[i] = res.area[i] > 0 ? res.area[i] : NaN
      return out
    }
    default: return res.lcoa
  }
}
