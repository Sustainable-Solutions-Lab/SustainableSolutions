/**
 * lib/variable-value.js
 *
 * Uniform access to a variable's per-feature value, covering two kinds of
 * computed variable:
 *   - diffOf: [minuendProp, subtrahendProp] (resolved from diffOfDims by
 *     get-active-variable) — a stored-prop difference.
 *   - scaled: { terms, year, yearB?, factors? } (resolved from yearTerms by
 *     get-active-variable when config.yearControl is set) — the sum of
 *     reference-year source props times national year factors, optionally
 *     minus the same sum at a second year (compare mode). Until `factors`
 *     is attached (use-just-air-layers, once the trends JSON loads) the
 *     value gracefully falls back to the base prop (variable.id), which is
 *     also the deliberate behavior for filters and stats: they operate on
 *     the reference-year pattern.
 *
 * Every consumer — paint expressions, filters, statistics — reads through
 * these so a computed variable behaves exactly like a stored one.
 */

import { factorFor, factorPairs } from './year-factors.js'

/**
 * Enhanced-mask support: tiles carry sparse `<prop><suffix>` overrides
 * (e.g. `fer_oilp__dsc` for the Descals palm reallocation). When the
 * variable carries maskSuffixes (attached by MapTool from the active
 * toggles), every prop read prefers the override and falls back to the
 * base SPAM value.
 */
export function readProp(props, name, suffixes) {
  if (suffixes) {
    for (const sfx of suffixes) {
      const v = props[name + sfx]
      if (v != null) return v
    }
  }
  return props[name]
}

/** The suffixes of currently-toggled enhanced masks (config.enhancedMasks). */
export function activeMaskSuffixes(config, state) {
  const v = state?.activeDimensions?.masks
  return typeof v === 'string' && v.length ? v.split(',').filter(Boolean) : []
}

export function propExpr(name, suffixes) {
  if (!suffixes || suffixes.length === 0) return ['get', name]
  return ['coalesce', ...suffixes.map((sfx) => ['get', name + sfx]), ['get', name]]
}

/** JS-side read from a properties object. */
export function readVarValue(props, variable) {
  if (!props || !variable) return undefined
  if (variable.rawRead) return variable.rawRead(props)
  const sfx = variable.maskSuffixes
  if (variable.scaled?.factors) {
    const { terms, year, yearB, factors } = variable.scaled
    const m49 = props.m49
    const at = (y) =>
      terms.reduce((sum, t) => {
        const v = readProp(props, t.prop, sfx)
        if (v == null || isNaN(v)) return sum
        return sum + v * factorFor(factors, t.src, m49, y)
      }, 0)
    const present = variable.hasAny
      ? variable.hasAny.some((k) => readProp(props, k, sfx) != null)
      : readProp(props, variable.id, sfx) != null
    if (yearB != null) {
      if (!present) return undefined
      return at(year) - at(yearB)
    }
    return present ? at(year) : undefined
  }
  if (variable.diffOf) {
    const a = props[variable.diffOf[0]]
    const b = props[variable.diffOf[1]]
    if (a == null || b == null) return undefined
    return a - b
  }
  return readProp(props, variable.id, sfx)
}

/** MapLibre expression producing the variable's value. */
export function varValueExpr(variable) {
  if (variable.rawExpr) return variable.rawExpr
  const sfx = variable.maskSuffixes
  if (variable.scaled?.factors) {
    const { terms, year, yearB, factors } = variable.scaled
    const at = (y) => {
      const parts = terms.map((t) => {
        const get = ['coalesce', ['to-number', propExpr(t.prop, sfx)], 0]
        const pairs = factorPairs(factors, t.src, y)
        if (pairs.length === 0) return get
        return ['*', get, ['match', ['get', 'm49'], ...pairs, 1]]
      })
      return parts.length === 1 ? parts[0] : ['+', ...parts]
    }
    return yearB != null ? ['-', at(year), at(yearB)] : at(year)
  }
  if (variable.diffOf) {
    return ['-',
      ['to-number', ['get', variable.diffOf[0]]],
      ['to-number', ['get', variable.diffOf[1]]],
    ]
  }
  return sfx?.length ? ['to-number', propExpr(variable.id, sfx)] : ['get', variable.id]
}

/** MapLibre expression: does the feature carry the variable at all? */
export function varHasExpr(variable) {
  if (variable.rawHas) return variable.rawHas
  // Scaled variables gate on the base (reference-year) prop: a cell with no
  // reference-year value for this source × crop has nothing to scale.
  if (variable.hasAny) return ['any', ...variable.hasAny.map((k) => ['has', k])]
  if (variable.scaled) return ['has', variable.id]
  if (variable.diffOf) {
    return ['all', ['has', variable.diffOf[0]], ['has', variable.diffOf[1]]]
  }
  return ['has', variable.id]
}
