/**
 * lib/intensity.js
 *
 * One quantity for both map views: t CO₂e per km² of ground.
 *
 * The gridded cells used to paint a cell's TOTAL and the regional units
 * their total divided by area, so the two views were different quantities
 * on different scales and the colorbar quoted a third thing (per-cell
 * totals) over both of them. Everything now goes through here: the same
 * number, the same colour, whichever geometry is on screen.
 *
 * Opt-in per project (config.intensity). Projects that don't declare it —
 * Just Air's PM₂.₅ and mortality rates, the fuel-treatment layers — are
 * intensive already and pass through every function here untouched.
 *
 * ── The denominator ──────────────────────────────────────────────────────
 *
 * TOTAL GEOGRAPHIC AREA of the cell or the unit. Not land area, not
 * cropland area: a region with 5 % of its ground in rice reads as the
 * region's emissions spread over the whole region, which is what makes a
 * cell and a region comparable at all.
 *
 * Units carry their own area (`area_km2`, summed by the analysis repo's
 * export_unit_values.py over the 0.25° cells inside the unit), so the
 * regional side is exact.
 *
 * Cells do not, and this is the one approximation in the file. A cell's
 * area varies with latitude — 773 km² at the equator down to 96 km² at the
 * northernmost cropland — but the cell tiles carry no latitude or area
 * property and a MapLibre expression cannot read a feature's coordinates,
 * so the gridded denominator is nominal: the exact spherical area of a
 * 0.25° cell at `refLat`, chosen as the emissions-weighted mean over all
 * 202,970 exported cells (671 km², i.e. 29.7°). A cell at 50° N therefore
 * reads about three quarters of its true intensity and an equatorial cell
 * about 15 % over. Making it exact is a data change, not a code change:
 * add the cell's own area to export_explorer_cells.py's props and divide
 * by that instead.
 */

import { varValueExpr } from './variable-value.js'

// Authalic (equal-area) radius, matching the analysis repo's grids.
const AUTHALIC_R_KM = 6371.007181

/**
 * Exact spherical area of a `res`-degree cell centred at `lat`, km².
 * Zonal band: R² · Δλ · (sin φ_top − sin φ_bottom).
 */
export function cellAreaKm2(lat, res) {
  const dlon = (res * Math.PI) / 180
  const top = ((lat + res / 2) * Math.PI) / 180
  const bot = ((lat - res / 2) * Math.PI) / 180
  return AUTHALIC_R_KM * AUTHALIC_R_KM * dlon * (Math.sin(top) - Math.sin(bot))
}

/**
 * Multiplier taking a stored value to tonnes. The emission sums are stored
 * in kt; the soil-carbon and forest-pilot props are already in t. The
 * variable's own declared unit is the only thing that distinguishes them.
 */
export function tonnesPerValue(variable) {
  return /^kt\b/.test(variable?.unit ?? '') ? 1000 : 1
}

/** Value → intensity factor on the FINE tier (what every sample rides). */
function factor(intensity, variable) {
  return tonnesPerValue(variable) / cellAreaKm2(intensity.refLat, intensity.cellDeg)
}

/**
 * The active intensity spec, or null when it doesn't apply: a project that
 * declares none, a categorical variable, or one that is a ratio already
 * (`intensive`, e.g. the PALE level analyses).
 */
function specFor(config, variable) {
  const it = config?.intensity
  if (!it || !variable || variable.intensive || variable.type === 'categorical') return null
  return it
}

/**
 * MapLibre expression: the variable as t CO₂e/km² on the CELL tiles.
 * Falls back to the raw value for projects with no intensity spec.
 */
export function cellIntensityExpr(config, variable) {
  const it = specFor(config, variable)
  const value = varValueExpr(variable)
  if (!it) return value
  const base = cellAreaKm2(it.refLat, it.cellDeg)
  const ref = it.cellScaleKm
  // Coarser tiers are whole doublings of the cell pitch, so ground area
  // goes as `_scale`². Without this the 0.5° tier that carries the low
  // zooms painted four times the fine tier's value on the same ramp, and
  // the map cooled visibly as you zoomed past the handoff. `has` rather
  // than `coalesce`: MapLibre's to-number of a missing prop is 0, not
  // null, which would divide by zero.
  const scale = ['case', ['has', '_scale'],
                 ['max', 1, ['to-number', ['get', '_scale']]], ref]
  const area = ['*', base / (ref * ref), ['^', scale, 2]]
  return ['/', ['*', tonnesPerValue(variable), ['to-number', value]], area]
}

/**
 * MapLibre expression: the variable as t CO₂e/km² on the UNIT tiles, using
 * each unit's own area. `max` guards a missing or zero area.
 */
export function unitIntensityExpr(config, variable) {
  const it = specFor(config, variable)
  const value = varValueExpr(variable)
  if (!it) return value
  return ['/', ['*', tonnesPerValue(variable), ['to-number', value]],
          ['max', 1, ['to-number', ['get', it.areaProp]]]]
}

/**
 * The variable restated in intensity terms: same colormap and gating, but
 * every declared threshold (domain, colour caps, histogram floor) and the
 * unit label divided through. Hand this to the legend and the distribution
 * chart and they describe what the map paints, with no changes of their
 * own.
 */
export function toIntensityVariable(config, variable) {
  const it = specFor(config, variable)
  if (!it) return variable
  const f = factor(it, variable)
  const sc = (x) => (x == null ? x : x * f)
  return {
    ...variable,
    unit: it.unit,
    domain: variable.domain
      ? { ...variable.domain,
          min: sc(variable.domain.min),
          max: sc(variable.domain.max),
          zero: sc(variable.domain.zero) }
      : variable.domain,
    colorMax: sc(variable.colorMax),
    colorMin: sc(variable.colorMin),
    histogramMin: sc(variable.histogramMin),
  }
}

/** A { maxPosDev, maxNegDev } colour range restated in intensity terms. */
export function toIntensityRange(config, variable, range) {
  const it = specFor(config, variable)
  if (!it || !range) return range
  const f = factor(it, variable)
  return { maxPosDev: range.maxPosDev * f, maxNegDev: range.maxNegDev * f }
}

/** A per-cell value sample (distributions.json) restated in intensity terms. */
export function toIntensityValues(config, variable, values) {
  const it = specFor(config, variable)
  if (!it || !values?.length) return values
  const f = factor(it, variable)
  return values.map((v) => v * f)
}
