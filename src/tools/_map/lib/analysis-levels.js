/**
 * lib/analysis-levels.js
 *
 * Level (snapshot-intensity) analysis variables: per-area ratios computed
 * directly from stored props on either the cells or the unit polygons —
 * e.g. emissions intensity of land (kg CO2e/ha) or land intensity of
 * production (ha/Gkcal). Declared in config.paleMap.levels; selecting one
 * repaints the ACTIVE map view rather than showing the LMDI change
 * polygons.
 */

export function levelFor(config, state) {
  if (state.analysis !== 'pale') return null
  return (config.paleMap?.levels ?? []).find((l) => l.id === state.analysisDriver) ?? null
}

export function makeLevelVariable(lvl) {
  const num = ['to-number', ['coalesce', ['get', lvl.num], 0]]
  const den = ['to-number', ['coalesce', ['get', lvl.den], 0]]
  // denMin: a meaningful-denominator floor. Cells whose denominator is a
  // sliver (e.g. 3 ha of cropland under rangeland livestock emissions)
  // have no meaningful intensity and would otherwise explode the ratio.
  const dmin = lvl.denMin ?? 0
  const ratio = ['/', ['*', num, lvl.mul ?? 1], den]
  return {
    id: lvl.id,
    label: lvl.label,
    unit: lvl.unit,
    colormap: lvl.colormap ?? 'SpectralHotDeep',
    diverging: false,
    domain: { min: 0, max: 1 },
    alphaFloor: 0.02,
    alphaPower: 0.5,
    colorMax: lvl.colorMax,
    colorPercentile: lvl.colorPercentile ?? 0.95,
    rawExpr: ['case', ['>', den, dmin], ratio, -1],
    rawHas: ['all', ['has', lvl.num], ['has', lvl.den], ['>', den, dmin]],
    rawRead: (p) => {
      const d = Number(p?.[lvl.den] ?? 0)
      if (!(d > dmin)) return null
      return (Number(p?.[lvl.num] ?? 0) * (lvl.mul ?? 1)) / d
    },
  }
}


// Self-contained paint for level variables: fixed stops from colorMax, no
// dependence on the data-derived color range (whose p99 is poisoned by the
// extreme-outlier tails every ratio metric has).
import { INTERPOLATORS } from './colormap.js'

export function levelColorExpr(variable, isDark) {
  const interp = INTERPOLATORS[isDark && variable.darkColormap ? variable.darkColormap : variable.colormap]
    ?? INTERPOLATORS.SpectralHot
  const max = variable.colorMax ?? 1
  const expr = ['interpolate', ['linear'], variable.rawExpr]
  const steps = 20
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t < 0.03 ? 0 : Math.min(1, 0.15 + 0.9 * Math.pow(t, 0.55))
    const c = interp(t)
    const rgba = c.startsWith('rgb(')
      ? c.replace('rgb(', 'rgba(').replace(')', `,${a.toFixed(3)})`)
      : c
    expr.push(t === 0 ? 0 : t * max, rgba)
  }
  return ['case', variable.rawHas, expr, 'rgba(0,0,0,0)']
}
