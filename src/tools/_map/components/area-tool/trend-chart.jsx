/**
 * components/area-tool/trend-chart.jsx
 *
 * Config-gated time-trend section for the regional-data panel. Composes the
 * drawn area's 2000-present trajectory from *national* per-source series:
 * each country's national trend is scaled by the share of that country's
 * emissions inside the circle (trendWeights from area-stats.js), then the
 * scaled series are stacked by source.
 *
 *   area(source, year) ≈ Σ_countries inCircle(country, source)
 *                         × nat(country, source, year) / nat(country, source, refYear)
 *
 * This is exact when a country is entirely inside the circle and a
 * proportional approximation otherwise — honest for the panel's purpose and
 * cheap enough to run on every drag. Data: config.areaTool.trend.url, a JSON
 * of { years: number[], countries: { [id]: { [prop]: number[] } } } produced
 * by the analysis repo (values in kt CO2e).
 *
 * Used by the food-emissions project; any project can opt in via config.
 */

import { useEffect, useMemo, useState } from 'react'

const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"

// Module-level cache: one fetch per URL per session.
const trendCache = new Map()
function useNationalTrends(url) {
  const [data, setData] = useState(() => trendCache.get(url) ?? null)
  useEffect(() => {
    if (!url || trendCache.has(url)) return
    let alive = true
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) trendCache.set(url, json)
        if (alive) setData(json)
      })
      .catch(() => alive && setData(null))
    return () => { alive = false }
  }, [url])
  return data
}

const W = 220
const H = 92
const PAD_L = 30
const PAD_B = 14

export function TrendChart({ trendConfig, trendWeights, isDark }) {
  const trends = useNationalTrends(trendConfig?.url)

  const composed = useMemo(() => {
    if (!trends || !trendWeights) return null
    const { years, countries } = trends
    const refIdx = years.indexOf(trendConfig.referenceYear ?? years[years.length - 1])
    const bySource = trendConfig.sources.map(() => years.map(() => 0))
    let any = false
    for (const [cid, sums] of Object.entries(trendWeights)) {
      const nat = countries[cid]
      if (!nat) continue
      trendConfig.sources.forEach((src, k) => {
        const inside = sums[src.prop]
        const series = nat[src.prop]
        if (!inside || !series) return
        const ref = series[refIdx]
        if (!ref) return
        any = true
        years.forEach((_, yi) => { bySource[k][yi] += inside * (series[yi] / ref) })
      })
    }
    return any ? { years, bySource } : null
  }, [trends, trendWeights, trendConfig])

  if (!trendConfig) return null
  // Quietly absent while loading or when the series file isn't deployed —
  // the panel's snapshot stats stand on their own.
  if (!trends) return null
  if (!composed) return null

  const { years, bySource } = composed
  const totals = years.map((_, yi) => bySource.reduce((a, s) => a + s[yi], 0))
  const ymax = Math.max(...totals) * 1.06 || 1
  const x = (yi) => PAD_L + ((W - PAD_L - 2) * yi) / (years.length - 1)
  const y = (v) => 2 + (H - PAD_B - 2) * (1 - v / ymax)

  const paths = []
  let base = years.map(() => 0)
  bySource.forEach((s, k) => {
    const top = base.map((b, yi) => b + s[yi])
    let d = `M ${x(0)} ${y(base[0])}`
    top.forEach((v, yi) => { d += ` L ${x(yi)} ${y(v)}` })
    for (let yi = years.length - 1; yi >= 0; yi--) d += ` L ${x(yi)} ${y(base[yi])}`
    paths.push(
      <path key={k} d={`${d} Z`} fill={trendConfig.sources[k].color ?? '#888'}
        stroke={isDark ? '#14142A' : '#F8F8E8'} strokeWidth={0.75} />
    )
    base = top
  })

  const fmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} Mt` : `${Math.round(v)} kt`)
  const axisColor = isDark ? 'rgba(248,248,232,0.4)' : 'rgba(24,24,56,0.4)'

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', opacity: 0.65, marginBottom: 4,
      }}>
        Trend in area, {years[0]}–{years[years.length - 1]}
      </div>
      <svg width={W} height={H} style={{ display: 'block' }} role="img"
        aria-label={`Stacked emissions trend for the selected area, ${years[0]} to ${years[years.length - 1]}`}>
        {paths}
        <line x1={PAD_L} x2={W - 2} y1={y(0)} y2={y(0)} stroke={axisColor} strokeWidth={1} />
        <text x={PAD_L - 3} y={y(ymax / 1.06) + 3} textAnchor="end"
          style={{ fontFamily: FONT_MONO, fontSize: 8, fill: axisColor }}>{fmt(ymax / 1.06)}</text>
        <text x={x(0)} y={H - 3} textAnchor="start"
          style={{ fontFamily: FONT_MONO, fontSize: 8, fill: axisColor }}>{years[0]}</text>
        <text x={x(years.length - 1)} y={H - 3} textAnchor="end"
          style={{ fontFamily: FONT_MONO, fontSize: 8, fill: axisColor }}>{years[years.length - 1]}</text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 4 }}>
        {trendConfig.sources.map((s, k) => (
          <span key={s.id} style={{
            fontFamily: FONT_MONO, fontSize: 9, opacity: 0.8,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, display: 'inline-block',
              background: s.color ?? '#888',
            }} />
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, opacity: 0.5, marginTop: 4 }}>
        composed from national series, weighted by emissions inside the area
      </div>
    </div>
  )
}
