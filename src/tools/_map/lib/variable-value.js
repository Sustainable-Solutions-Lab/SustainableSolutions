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

/** JS-side read from a properties object. */
export function readVarValue(props, variable) {
  if (!props || !variable) return undefined
  if (variable.scaled?.factors) {
    const { terms, year, yearB, factors } = variable.scaled
    const m49 = props.m49
    const at = (y) =>
      terms.reduce((sum, t) => {
        const v = props[t.prop]
        if (v == null || isNaN(v)) return sum
        return sum + v * factorFor(factors, t.src, m49, y)
      }, 0)
    if (yearB != null) {
      if (props[variable.id] == null) return undefined
      return at(year) - at(yearB)
    }
    return props[variable.id] == null ? undefined : at(year)
  }
  if (variable.diffOf) {
    const a = props[variable.diffOf[0]]
    const b = props[variable.diffOf[1]]
    if (a == null || b == null) return undefined
    return a - b
  }
  return props[variable.id]
}

/** MapLibre expression producing the variable's value. */
export function varValueExpr(variable) {
  if (variable.scaled?.factors) {
    const { terms, year, yearB, factors } = variable.scaled
    const at = (y) => {
      const parts = terms.map((t) => {
        const get = ['coalesce', ['to-number', ['get', t.prop]], 0]
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
  return ['get', variable.id]
}

/** MapLibre expression: does the feature carry the variable at all? */
export function varHasExpr(variable) {
  // Scaled variables gate on the base (reference-year) prop: a cell with no
  // reference-year value for this source × crop has nothing to scale.
  if (variable.scaled) return ['has', variable.id]
  if (variable.diffOf) {
    return ['all', ['has', variable.diffOf[0]], ['has', variable.diffOf[1]]]
  }
  return ['has', variable.id]
}
