/**
 * lib/year-factors.js
 *
 * Client-side year scaling for projects that declare config.yearControl.
 *
 * The exporter bakes reference-year (e.g. 2020) per-source props into the
 * tiles; any other year is that prop times the country's national
 * trajectory factor for the source — the same construction the exporter
 * used for the baked y2000..y2024 all-source props, done in the paint
 * expression instead so it works for every source × crop combination
 * without exploding the tile schema.
 *
 * Factors come from the project's national-trends JSON
 * ({ years: [...], countries: { m49: { src: [values...] } } }), already
 * shipped for the area-tool trend chart. factor = value[y] / value[ref],
 * clipped to [0.1, 10] (matching the exporter), 1 wherever the series is
 * missing or zero.
 */

import { useEffect, useState } from 'react'

const cache = new Map() // url -> { promise, data }

export function loadYearFactors(url, referenceYear) {
  let entry = cache.get(url)
  if (!entry) {
    entry = { data: null }
    entry.promise = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json?.years || !json?.countries) return null
        const refIdx = json.years.indexOf(referenceYear)
        if (refIdx < 0) return null
        entry.data = { years: json.years, refIdx, countries: json.countries, pairsCache: new Map() }
        return entry.data
      })
      .catch(() => null)
    cache.set(url, entry)
  }
  return entry.promise
}

/** React hook: null until the factor table is loaded. */
export function useYearFactors(config) {
  const url = config.yearControl?.trendsUrl
  const refYear = config.yearControl?.referenceYear
  const [data, setData] = useState(() => (url ? cache.get(url)?.data ?? null : null))
  useEffect(() => {
    if (!url) return undefined
    let alive = true
    loadYearFactors(url, refYear).then((d) => { if (alive && d) setData(d) })
    return () => { alive = false }
  }, [url, refYear])
  return data
}

function clip(f) {
  return Math.min(10, Math.max(0.1, f))
}

/** Scalar factor for (source, m49, year). 1 when unknown. */
export function factorFor(factors, src, m49, year) {
  const series = factors?.countries?.[m49]?.[src]
  if (!series) return 1
  const yi = factors.years.indexOf(year)
  if (yi < 0) return 1
  const ref = series[factors.refIdx]
  const v = series[yi]
  if (!ref || !v) return 1
  return clip(v / ref)
}

/**
 * Flat [m49, factor, m49, factor, ...] pairs for a MapLibre `match` on
 * m49, omitting factor-1 entries (the match default covers them). Cached
 * per (src, year).
 */
export function factorPairs(factors, src, year) {
  const key = `${src}|${year}`
  const cached = factors.pairsCache.get(key)
  if (cached) return cached
  const yi = factors.years.indexOf(year)
  const pairs = []
  if (yi >= 0 && yi !== factors.refIdx) {
    for (const [m49, series] of Object.entries(factors.countries)) {
      const s = series[src]
      if (!s) continue
      const ref = s[factors.refIdx]
      const v = s[yi]
      if (!ref || !v) continue
      const f = clip(v / ref)
      if (Math.abs(f - 1) < 1e-6) continue
      pairs.push(Number(m49), Math.round(f * 1e4) / 1e4)
    }
  }
  factors.pairsCache.set(key, pairs)
  return pairs
}
