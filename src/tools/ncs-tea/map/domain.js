/** p02–p98 (or symmetric about zero for diverging views) of the finite values, by sampling. */
export function fieldDomain(field, { diverging = false, clampMax = Infinity, clampMin = -Infinity } = {}) {
  const vals = []
  const step = Math.max(1, Math.floor(field.length / 60000))
  for (let i = 0; i < field.length; i += step) { const v = field[i]; if (v === v) vals.push(v) }
  if (vals.length < 2) return [0, 1]
  vals.sort((a, b) => a - b)
  let lo = Math.max(clampMin, vals[Math.floor(vals.length * 0.02)])
  let hi = Math.min(clampMax, vals[Math.floor(vals.length * 0.98)])
  if (diverging) { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; return [-m, m] }
  if (hi <= lo) hi = lo + 1e-9
  return [lo, hi]
}
