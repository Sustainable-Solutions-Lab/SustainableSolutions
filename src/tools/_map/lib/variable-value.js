/**
 * lib/variable-value.js
 *
 * Uniform access to a variable's per-feature value, covering computed
 * difference variables (variable.diffOf = [minuendProp, subtrahendProp],
 * resolved from diffOfDims by get-active-variable). Every consumer — paint
 * expressions, filters, statistics — reads through these so a computed
 * variable behaves exactly like a stored one.
 */

/** JS-side read from a properties object. */
export function readVarValue(props, variable) {
  if (!props || !variable) return undefined
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
  if (variable.diffOf) {
    return ['all', ['has', variable.diffOf[0]], ['has', variable.diffOf[1]]]
  }
  return ['has', variable.id]
}
