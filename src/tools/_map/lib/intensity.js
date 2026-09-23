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
 * Cells now carry their own too. `km2` is each cell's spherical area at
 * its OWN tier's resolution — 95.9 km² at 82.9° N up to 773 at the equator,
 * and already ×4 on the 0.5° tier — so it is the entire denominator. It
 * replaced a nominal area taken at `refLat` (671 km², the emissions-weighted
 * mean latitude), under which a boreal cell read about three quarters of its
 * true intensity and an equatorial cell about 15 % over.
 *
 * `refLat` / `cellDeg` survive for two jobs only: the fallback denominator
 * for tiles built before the export wrote `km2`, and the conversion of
 * thresholds AUTHORED PER CELL in the project config (domain, colorMax,
 * histogramMin), which have no cell of their own to be attributed to.
 *
 * ── Where the division happens ───────────────────────────────────────────
 *
 * Two kinds of number reach this file, and they are NOT divided in the same
 * place:
 *
 *   per-cell totals authored in the config      → `declaredFactor`, which
 *     (domain, colorMax/Min, histogramMin)        divides by the nominal area
 *
 *   per-cell samples built alongside the tiles  → `sampleFactor`, which does
 *     (distributions.json, distributions-by-       NOT: the build already
 *      country.json)                               divided each value by its
 *                                                  own cell's km²
 *
 * scripts/build-food-emissions-tiles.mjs writes both sample files in the
 * property's stored unit per km² (kt/km² for the emission sums, t/km² for
 * soil carbon and the forest pilots), so all that is left to do at runtime
 * is the stored-unit → tonnes multiplier. Dividing by an area here as well
 * would be the double-count this split exists to prevent, and would put the
 * histogram and the colour range back on a different quantity from the map.
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

/**
 * Factor for a threshold AUTHORED PER CELL in the project config. It belongs
 * to no cell, so the nominal area at `refLat` is the only denominator
 * available — the one place that approximation still lives.
 */
function declaredFactor(intensity, variable) {
  return tonnesPerValue(variable) / cellAreaKm2(intensity.refLat, intensity.cellDeg)
}

/**
 * Factor for a value out of the build's per-cell samples. They arrive
 * already divided by their own cell's km² (see the header), so the stored
 * unit → tonnes multiplier is all that is left.
 */
function sampleFactor(variable) {
  return tonnesPerValue(variable)
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
  // Fallback for tiles built before the export wrote `km2`, so the tool
  // keeps working against whatever is currently deployed: the nominal area
  // at `refLat`, times `_scale`² because coarser tiers are whole doublings
  // of the cell pitch and their ground area goes as the square. Without
  // that the 0.5° tier that carries the low zooms painted four times the
  // fine tier's value on the same ramp, and the map cooled visibly as you
  // zoomed past the handoff.
  const scale = ['case', ['has', '_scale'],
                 ['max', 1, ['to-number', ['get', '_scale']]], ref]
  const nominal = ['*', base / (ref * ref), ['^', scale, 2]]
  // `km2` is the cell's own area computed at its own tier's resolution, so
  // a 0.5° cell's value already carries ~4x a 0.25° one's. It is therefore
  // the WHOLE denominator: the `_scale`² correction above compensates for a
  // nominal area pinned to the fine tier and is redundant here, not
  // additive — applying both would divide the coarse tier by four twice.
  //
  // `has` rather than `coalesce` on both props: MapLibre's to-number of a
  // missing prop is 0, not null, which would divide by zero.
  const area = ['case', ['has', 'km2'],
                ['max', 1, ['to-number', ['get', 'km2']]], nominal]
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
 *
 * These are the config's own per-cell numbers, so they take the nominal
 * denominator — see `declaredFactor`.
 */
export function toIntensityVariable(config, variable) {
  const it = specFor(config, variable)
  if (!it) return variable
  const f = declaredFactor(it, variable)
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

/**
 * A { maxPosDev, maxNegDev } colour range restated in intensity terms.
 *
 * The range has two provenances and fixed-color-range.js decides which: a
 * variable that declares colorMax/colorMin gets its range straight off those
 * authored per-cell caps, and everything else gets a percentile of the
 * per-country ladders, which the build already divided by each cell's own
 * km². Hence two factors, matching where each number came from.
 */
export function toIntensityRange(config, variable, range) {
  const it = specFor(config, variable)
  if (!it || !range) return range
  const declared = variable.colorMax != null || variable.colorMin != null
  const f = declared ? declaredFactor(it, variable) : sampleFactor(variable)
  return { maxPosDev: range.maxPosDev * f, maxNegDev: range.maxNegDev * f }
}

/**
 * A per-cell value sample (distributions.json) restated in intensity terms.
 * The build divided each value by its own cell's km², so only the stored
 * unit → tonnes multiplier remains.
 */
export function toIntensityValues(config, variable, values) {
  const it = specFor(config, variable)
  if (!it || !values?.length) return values
  const f = sampleFactor(variable)
  return values.map((v) => v * f)
}
