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
 *     the reference-year pattern. A term may carry `cellScale` ({ expr, fn }),
 *     a per-cell multiplier applied to that term only.
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

/**
 * Mask time dimension (variable.maskEpochs, from config.enhancedMasks[].epochs):
 * a mask built from an annual product carries, per cell and crop, the
 * crop's within-country share at each epoch relative to its share in the
 * mask's reference year, as `w_<crop>_<year><suffix>` (absent = 1). The
 * ratio for any year is interpolated between the bracketing epochs and
 * held flat outside them. A source × crop term is multiplied by it; an
 * all-crop term (fer, tot, ...) gains each covered crop's part times
 * (ratio − 1), so the mask moves the crop's pattern through time while
 * the national year factor still sets the level.
 */
function bracket(years, y) {
  const n = years.length
  if (y <= years[0]) return [years[0], years[0], 0]
  if (y >= years[n - 1]) return [years[n - 1], years[n - 1], 0]
  for (let i = 0; i < n - 1; i += 1) {
    if (years[i] <= y && y <= years[i + 1]) {
      return [years[i], years[i + 1], (y - years[i]) / (years[i + 1] - years[i])]
    }
  }
  return [years[n - 1], years[n - 1], 0]
}

const wName = (mask, crop, e) => `w_${crop}_${e}${mask.suffix}`

function ratioRead(props, mask, crop, y) {
  const [e0, e1, t] = bracket(mask.years, y)
  const a = props[wName(mask, crop, e0)] ?? 1
  if (t === 0) return a
  const b = props[wName(mask, crop, e1)] ?? 1
  return a * (1 - t) + b * t
}

function ratioExpr(mask, crop, y) {
  const [e0, e1, t] = bracket(mask.years, y)
  const g = (e) => ['coalesce', ['to-number', ['get', wName(mask, crop, e)]], 1]
  if (t === 0) return g(e0)
  if (t === 1) return g(e1)
  return ['+', ['*', 1 - t, g(e0)], ['*', t, g(e1)]]
}

/** The mask crop a prop is specific to (prop ends in `_<crop>`), or null. */
function cropOf(prop, crops) {
  for (const c of crops) if (prop.endsWith(`_${c}`)) return c
  return null
}

function termRead(props, prop, sfx, masks, y) {
  const v = readProp(props, prop, sfx)
  if (v == null || isNaN(v)) return null
  if (!masks) return v
  let val = v
  for (const m of masks) {
    const c = cropOf(prop, m.crops)
    if (c) {
      val *= ratioRead(props, m, c, y)
    } else {
      for (const cc of m.crops) {
        const pv = readProp(props, `${prop}_${cc}`, sfx)
        if (pv != null && !isNaN(pv)) val += pv * (ratioRead(props, m, cc, y) - 1)
      }
    }
  }
  return val
}

function termExpr(prop, sfx, masks, y) {
  let e = ['coalesce', ['to-number', propExpr(prop, sfx)], 0]
  if (!masks) return e
  for (const m of masks) {
    const c = cropOf(prop, m.crops)
    if (c) {
      e = ['*', e, ratioExpr(m, c, y)]
    } else {
      const parts = m.crops.map((cc) => ['*',
        ['coalesce', ['to-number', propExpr(`${prop}_${cc}`, sfx)], 0],
        ['-', ratioExpr(m, cc, y), 1]])
      e = ['+', e, ...parts]
    }
  }
  return e
}

/** JS-side read from a properties object. */
export function readVarValue(props, variable) {
  if (!props || !variable) return undefined
  if (variable.rawRead) return variable.rawRead(props)
  const sfx = variable.maskSuffixes
  const masks = variable.maskEpochs
  if (variable.scaled?.factors) {
    const { terms, year, yearB, factors } = variable.scaled
    const m49 = props.m49
    const at = (y) =>
      terms.reduce((sum, t) => {
        const v = termRead(props, t.prop, sfx, masks, y)
        if (v == null) return sum
        const k = t.cellScale ? t.cellScale.fn(props) : 1
        return sum + v * k * factorFor(factors, t.src, m49, y)
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
  const masks = variable.maskEpochs
  if (variable.scaled?.factors) {
    const { terms, year, yearB, factors } = variable.scaled
    const at = (y) => {
      const parts = terms.map((t) => {
        const raw = termExpr(t.prop, sfx, masks, y)
        // Per-term cell multiplier (e.g. the rangeland LSRS scope share,
        // lib/rangeland-scope.js) applied before the national year factor.
        const get = t.cellScale ? ['*', raw, t.cellScale.expr] : raw
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
