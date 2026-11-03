/** Number formatting for labels: compact, with real units. */
export function fmt(v, unit = '', digits) {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  const money = unit.startsWith('$')
  const rest = money ? unit.slice(1) : unit
  let s
  if (abs >= 1e12) s = `${(abs / 1e12).toFixed(digits ?? 1)} tn`
  else if (abs >= 1e9) s = `${(abs / 1e9).toFixed(digits ?? 1)} bn`
  else if (abs >= 1e6) s = `${(abs / 1e6).toFixed(digits ?? 1)} M`
  else if (abs >= 1e4) s = `${(abs / 1e3).toFixed(digits ?? 0)} k`
  else if (abs >= 100) s = abs.toFixed(digits ?? 0)
  else if (abs >= 10) s = abs.toFixed(digits ?? 1)
  else if (abs >= 1) s = abs.toFixed(digits ?? 2)
  else if (abs >= 0.01) s = abs.toFixed(digits ?? 2)
  else if (abs > 0) s = abs.toExponential(1)
  else s = '0'
  if (money) return `${sign}$${s}${rest ? ` ${rest}`.replace(' /', '/') : ''}`
  return `${sign}${s}${rest ? ` ${rest}` : ''}`
}

/** Large totals in Mha / Gt / $bn. */
export const fmtMha = (ha) => `${(ha / 1e6).toFixed(ha >= 1e8 ? 0 : 1)} Mha`
export const fmtGt = (t) => (Math.abs(t) >= 1e9 ? `${(t / 1e9).toFixed(2)} Gt` : `${(t / 1e6).toFixed(Math.abs(t) >= 1e8 ? 0 : 1)} Mt`)
export const fmtBn = (usd) => { const a = Math.abs(usd), s = usd < 0 ? '−' : ''; return a >= 1e12 ? `${s}$${(a / 1e12).toFixed(2)} tn` : a >= 1e9 ? `${s}$${(a / 1e9).toFixed(1)} bn` : `${s}$${(a / 1e6).toFixed(0)} M` }
export const fmtPct = (f) => `${Math.round(f * 100)}%`
export const fmtCoord = (lon, lat) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
