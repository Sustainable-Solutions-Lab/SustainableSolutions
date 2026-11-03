/**
 * engine/profiles.js
 *
 * Time profiles: how a component is distributed over the years of the
 * horizon. One function, `profileValue(profile, t)`, returns the multiplier
 * for year t (t = 0 is the first year of deployment). Mitigation components
 * multiply their per-hectare rate by it; cost components use it as the
 * number of times the cost occurs in that year (0 or 1 for most timings).
 *
 * Profile types
 *   constant        1 every year (optionally within [from, to])
 *   once            1 in `year`, else 0 (one-off costs; pulse mitigation)
 *   every           1 in `from`, `from + interval`, ... (re-application)
 *   window          1 for from <= t <= to
 *   saturating      first-year value 1, declining with time constant 1/k so
 *                   the sum over all years is 1 / (1 - e^-k). This is the
 *                   first-order approach to a new equilibrium that soil carbon
 *                   follows: `rate` is the initial annual gain.
 *   linear_decline  1 - t / years, floored at 0
 *   ramp            linear ramp 0 -> 1 over `years`, then 1 (establishment,
 *                   adoption, tree growth)
 *   delayed         0 for t < lag, then the nested `then` profile at t - lag
 *   series          explicit values per year (last value repeats if `extend`)
 */

export const PROFILE_TYPES = [
  { id: 'constant', label: 'Constant each year' },
  { id: 'saturating', label: 'Declining toward saturation' },
  { id: 'linear_decline', label: 'Declining linearly to zero' },
  { id: 'ramp', label: 'Ramping up, then constant' },
  { id: 'once', label: 'Once, in one year' },
  { id: 'every', label: 'Every n years' },
  { id: 'window', label: 'Constant within a window of years' },
  { id: 'delayed', label: 'Delayed, then another profile' },
  { id: 'series', label: 'Explicit values by year' },
]

export function profileValue(profile, t) {
  if (!profile) return 1
  switch (profile.type) {
    case 'constant': {
      const from = profile.from ?? 0
      const to = profile.to ?? Infinity
      return t >= from && t <= to ? 1 : 0
    }
    case 'once':
      return t === (profile.year ?? 0) ? 1 : 0
    case 'every': {
      const from = profile.from ?? 0
      const n = Math.max(1, Math.round(profile.interval ?? 1))
      return t >= from && (t - from) % n === 0 ? 1 : 0
    }
    case 'window': {
      const from = profile.from ?? 0
      const to = profile.to ?? Infinity
      return t >= from && t <= to ? 1 : 0
    }
    case 'saturating': {
      const k = Math.max(1e-6, profile.k ?? 0.02)
      // Integral of e^{-ks} over [t, t+1], scaled so year 0 is exactly 1.
      return (Math.exp(-k * t) - Math.exp(-k * (t + 1))) / (1 - Math.exp(-k))
    }
    case 'linear_decline': {
      const years = Math.max(1, profile.years ?? 20)
      return Math.max(0, 1 - t / years)
    }
    case 'ramp': {
      const years = Math.max(1, profile.years ?? 5)
      return Math.min(1, (t + 1) / years)
    }
    case 'delayed': {
      const lag = Math.max(0, Math.round(profile.lag ?? 0))
      return t < lag ? 0 : profileValue(profile.then ?? { type: 'constant' }, t - lag)
    }
    case 'series': {
      const v = profile.values ?? []
      if (t < v.length) return Number(v[t]) || 0
      return profile.extend ? Number(v[v.length - 1]) || 0 : 0
    }
    default:
      return 1
  }
}

/** The profile evaluated for every year of a horizon. */
export function profileSeries(profile, years) {
  const out = new Float64Array(years)
  for (let t = 0; t < years; t++) out[t] = profileValue(profile, t)
  return out
}

/**
 * Stock remaining after reversal: an annual loss `risk` (fraction per year)
 * of everything accumulated so far. Returns the net annual series: the
 * additions in year t minus the losses from the stock carried into it.
 * With risk 0 this is the input unchanged.
 */
export function applyReversal(series, risk) {
  if (!risk) return series
  const out = new Float64Array(series.length)
  let stock = 0
  for (let t = 0; t < series.length; t++) {
    const loss = stock * risk
    out[t] = series[t] - loss
    stock = stock + series[t] - loss
  }
  return out
}
