/**
 * engine/rates.js
 *
 * Spatial rate functions: how a per-hectare quantity (a mitigation rate, a
 * cost multiplier, an application rate) varies over the grid as a function
 * of the biophysical layers. `rateValue(spec, layers, i)` returns the value
 * for cell i, or NaN when a layer it needs is missing there.
 *
 * Rate types
 *   constant        { value }
 *   layer           { layer, scale, offset, min, max }  value = offset + scale * L
 *   layer_classes   { layer, breaks: [b1..bn], values: [v0..vn] }
 *                   piecewise constant: L < b1 -> v0, b1 <= L < b2 -> v1, ...
 *   layer_linear    { layer, x0, y0, x1, y1, min, max }
 *                   straight line through (x0, y0) and (x1, y1), clamped
 *   table           { layer, table: { code: value }, default }
 *                   lookup by integer code (country, soil class, ...)
 *   product         { factors: [spec...] }  multiply
 *   sum             { terms: [spec...] }    add
 *
 * The natural pattern for a mitigation rate is a product: a base rate
 * (constant) times dimensionless factors in [0, ~1.5] for climate, soil
 * and so on, each expressed as classes or a clamped line.
 */

export const RATE_TYPES = [
  { id: 'constant', label: 'Constant' },
  { id: 'layer', label: 'Proportional to a layer' },
  { id: 'layer_linear', label: 'Line through two points of a layer' },
  { id: 'layer_classes', label: 'Classes of a layer' },
  { id: 'table', label: 'Lookup table by code (e.g. country)' },
  { id: 'product', label: 'Product of factors' },
]

export function rateValue(spec, layers, i) {
  if (spec == null) return 1
  if (typeof spec === 'number') return spec
  switch (spec.type) {
    case 'constant':
      return Number(spec.value ?? 0)
    case 'layer': {
      const L = layers[spec.layer]
      if (!L) return NaN
      const v = L[i]
      if (!Number.isFinite(v)) return Number.isFinite(spec.missing) ? spec.missing : NaN
      return clamp((spec.offset ?? 0) + (spec.scale ?? 1) * v, spec.min, spec.max)
    }
    case 'layer_linear': {
      const L = layers[spec.layer]
      if (!L) return NaN
      const v = L[i]
      if (!Number.isFinite(v)) return Number.isFinite(spec.missing) ? spec.missing : NaN
      const { x0 = 0, y0 = 0, x1 = 1, y1 = 1 } = spec
      const y = x1 === x0 ? y0 : y0 + ((v - x0) * (y1 - y0)) / (x1 - x0)
      return clamp(y, spec.min, spec.max)
    }
    case 'layer_classes': {
      const L = layers[spec.layer]
      if (!L) return NaN
      const v = L[i]
      if (!Number.isFinite(v)) return Number.isFinite(spec.missing) ? spec.missing : NaN
      const breaks = spec.breaks ?? []
      const values = spec.values ?? []
      let k = 0
      while (k < breaks.length && v >= breaks[k]) k++
      return Number(values[k] ?? values[values.length - 1] ?? 0)
    }
    case 'table': {
      const L = layers[spec.layer]
      if (!L) return NaN
      const v = L[i]
      if (!Number.isFinite(v)) return Number.isFinite(spec.default) ? spec.default : NaN
      const hit = spec.table?.[Math.round(v)]
      return hit != null ? Number(hit) : Number.isFinite(spec.default) ? spec.default : NaN
    }
    case 'product': {
      let p = 1
      for (const f of spec.factors ?? []) p *= rateValue(f, layers, i)
      return p
    }
    case 'sum': {
      let s = 0
      for (const f of spec.terms ?? []) s += rateValue(f, layers, i)
      return s
    }
    default:
      return NaN
  }
}

/** The layers a rate spec reads, for validation and for "missing data" notes. */
export function rateLayers(spec, out = new Set()) {
  if (!spec || typeof spec === 'number') return out
  if (spec.layer) out.add(spec.layer)
  for (const f of spec.factors ?? []) rateLayers(f, out)
  for (const f of spec.terms ?? []) rateLayers(f, out)
  return out
}

function clamp(v, lo, hi) {
  if (Number.isFinite(lo) && v < lo) v = lo
  if (Number.isFinite(hi) && v > hi) v = hi
  return v
}
