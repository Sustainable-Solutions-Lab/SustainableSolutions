/**
 * lib/get-active-variable.js
 *
 * Resolves which variable to display given the current layer and dimensions.
 * Used by the map, sidebar legend, and detail panel to stay in sync.
 *
 * Logic: find the variable where:
 *   variable.layer === activeLayer
 *   AND every key in variable.dimensionValues matches activeDimensions
 */

/**
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {string} activeLayer
 * @param {Object} activeDimensions   - { [dimensionId]: string|number }
 * @returns {import('../contracts/project-config').Variable | null}
 */
export function getActiveVariable(config, activeLayer, activeDimensions) {
  const v =
    config.variables.find((vv) => {
      if (vv.layer !== activeLayer) return false
      if (!vv.dimensionValues) return true

      return Object.entries(vv.dimensionValues).every(
        ([dimId, expected]) => activeDimensions[dimId] === expected
      )
    }) ?? null
  // Computed difference variables: diffOfDims: [minuendDim, subtrahendDim]
  // resolves to diffOf: [propA, propB] (props named `y<value>`), so the map
  // renders propA − propB. Resolved here so every consumer (paint, stats,
  // filters) sees a concrete variable.
  if (v?.diffOfDims) {
    const dimValue = (dimId) =>
      activeDimensions[dimId] ??
      config.dimensions.find((d) => d.id === dimId)?.defaultValue
    const a = dimValue(v.diffOfDims[0])
    const b = dimValue(v.diffOfDims[1])
    return {
      ...v,
      diffOf: [`y${a}`, `y${b}`],
      label: `${v.label} — ${b} to ${a}`,
    }
  }
  // Segment variables (variable.segments): per-cell piecewise rates.
  // Single year -> that year's segment rate (annual, like every other
  // source). Compare -> the piecewise CUMULATIVE change over the span,
  // integrated client-side from the segment rates, labeled as such.
  const ycSeg = config.yearControl
  if (v?.segments && ycSeg) {
    const { knots, props } = v.segments
    const dimValue = (dimId, fallback) =>
      activeDimensions[dimId] ?? config.dimensions.find((d) => d.id === dimId)?.defaultValue ?? fallback
    const year = Number(dimValue(ycSeg.dimensionId, ycSeg.referenceYear))
    const clampY = (y) => Math.min(Math.max(y, knots[0] + 1), knots[knots.length - 1])
    const segFor = (y) => {
      for (let i = 0; i < props.length; i++) if (y <= knots[i + 1]) return i
      return props.length - 1
    }
    const compareOn = ycSeg.compareDimensionId && dimValue(ycSeg.compareDimensionId) === 'on'
    const hasAny = ['any', ...props.map((pp) => ['has', pp])]
    if (compareOn) {
      const yearB = Number(dimValue(ycSeg.yearBDimensionId, ycSeg.referenceYear))
      const a = clampY(Math.min(year, yearB))
      const b = clampY(Math.max(year, yearB))
      const sign = year >= yearB ? 1 : -1
      const coefs = props.map((_, i) =>
        Math.max(0, Math.min(b, knots[i + 1]) - Math.max(a, knots[i])))
      const parts = props
        .map((pp, i) => ['*', sign * coefs[i], ['coalesce', ['to-number', ['get', pp]], 0]])
        .filter((_, i) => coefs[i] > 0)
      const span = Math.max(1, b - a)
      const cap = (v.colorMax ?? v.domain?.max ?? 1500) * Math.min(span, 12) * 0.6
      return {
        ...v,
        diverging: true,
        unit: 't CO₂e',
        rawExpr: parts.length === 0 ? 0 : parts.length === 1 ? parts[0] : ['+', ...parts],
        rawRead: (pr) => props.reduce((sum, pp, i) => sum + sign * coefs[i] * (pr[pp] ?? 0), 0),
        rawHas: hasAny,
        isCumulative: true,
        scaled: undefined,
        yearTerms: undefined,
        domain: { min: -cap, max: cap, zero: 0 },
        colorMax: cap,
        colorMin: -cap,
        label: `${v.label} — cumulative ${a}–${b}`,
        note: `Cumulative soil-carbon change ${a}–${b}, t CO₂e per cell (piecewise from three period rates). Red = net loss (counted in emissions); blue = net gain (context only, not credited).`,
      }
    }
    const pp = props[segFor(clampY(year))]
    return {
      ...v,
      rawExpr: ['coalesce', ['to-number', ['get', pp]], 0],
      rawRead: (pr) => pr[pp],
      rawHas: ['has', pp],
      scaled: undefined,
      yearTerms: undefined,
      label: `${v.label} — ${year}`,
    }
  }
  // Year-scaled variables (config.yearControl + variable.yearTerms): the
  // stored props are the reference year; other years multiply each source
  // term by its national trajectory factor (lib/year-factors.js). Compare
  // mode turns the variable into a diverging difference between two years.
  // The factor table itself is attached later (use-just-air-layers) — id
  // stays the base prop so distributions, lat profiles, filters, and area
  // stats keep their reference-year semantics untouched.
  const yc = config.yearControl
  if (v?.yearTerms && yc) {
    const dimValue = (dimId, fallback) =>
      activeDimensions[dimId] ?? config.dimensions.find((d) => d.id === dimId)?.defaultValue ?? fallback
    const year = Number(dimValue(yc.dimensionId, yc.referenceYear))
    const compareOn = yc.compareDimensionId && dimValue(yc.compareDimensionId) === 'on'
    if (compareOn) {
      const yearB = Number(dimValue(yc.yearBDimensionId, yc.referenceYear))
      return {
        ...v,
        diverging: true,
        colormap: yc.compareColormap ?? 'SpectralR',
        domain: { min: -(v.domain?.max ?? 1) / 4, max: (v.domain?.max ?? 1) / 4, zero: 0 },
        alphaFloor: 0.05,
        alphaPower: 0.5,
        colorAnchorId: undefined,
        scaled: { terms: v.yearTerms, year, yearB, isDiff: true },
        label: `${v.label} — change ${yearB} to ${year}`,
      }
    }
    if (year !== yc.referenceYear) {
      return {
        ...v,
        // Anchor the color scale to the reference-year base prop so the
        // animation shows change as color change, not a re-normalizing scale.
        colorAnchorId: v.id,
        scaled: { terms: v.yearTerms, year },
      }
    }
  }
  return v
}

/**
 * Returns the default activeDimensions for a given layer.
 * Pulls defaultValue from each relevant dimension.
 *
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {string} layerId
 * @returns {Object}
 */
export function getDefaultDimensionsForLayer(config, layerId) {
  const layer = config.layers.find((l) => l.id === layerId)
  if (!layer) return {}

  const result = {}
  for (const dimId of layer.dimensionIds) {
    const dim = config.dimensions.find((d) => d.id === dimId)
    if (dim) result[dimId] = dim.defaultValue
  }
  return result
}
