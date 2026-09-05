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


/**
 * PALE drivers — LMDI (log-mean Divisia) decomposition of the drawn
 * region's emissions change, config-gated (config.areaTool.pale). The
 * PALE identity (Hong et al. 2021):
 *
 *   E = P x (Prod/P) x (Land/Prod) x (E/Land)
 *
 * Regional series are composed exactly like the trend chart: each
 * country's national population / production / agricultural-land series
 * is scaled by the share of that country's reference-year emissions that
 * fall inside the region. Exact for whole countries, a proportional
 * approximation otherwise. Contributions are log-mean weighted so the
 * four bars sum exactly to the net change.
 */
export function PaleChart({ trendConfig, trendWeights, isDark }) {
  const trends = useNationalTrends(trendConfig?.url)

  const result = useMemo(() => {
    if (!trends || !trendWeights) return null
    const { years, countries } = trends
    const refIdx = years.indexOf(trendConfig.referenceYear ?? years[years.length - 1])
    const y0 = 0
    // Livestock + land actuals end 2023; use the last year all series carry data.
    const yT = years.indexOf(2023) >= 0 ? years.indexOf(2023) : years.length - 1

    const n = years.length
    const E = new Array(n).fill(0)
    const P = new Array(n).fill(0)
    const PROD = new Array(n).fill(0)
    const LAND = new Array(n).fill(0)
    for (const [cid, sums] of Object.entries(trendWeights)) {
      const nat = countries[cid]
      if (!nat) continue
      // Region's share of this country's reference-year emissions.
      let inRegion = 0
      let natRef = 0
      for (const src of trendConfig.sources) {
        inRegion += sums[src.prop] ?? 0
        natRef += nat[src.prop]?.[refIdx] ?? 0
      }
      if (!(natRef > 0) || !(inRegion > 0)) continue
      const share = Math.min(1, inRegion / natRef)
      for (let i = 0; i < n; i++) {
        for (const src of trendConfig.sources) {
          const series = nat[src.prop]
          const ref = series?.[refIdx]
          if (series && ref > 0) E[i] += (sums[src.prop] ?? 0) * (series[i] / ref)
        }
        P[i] += share * (nat.pop?.[i] ?? 0)
        PROD[i] += share * (nat.prod?.[i] ?? 0)
        LAND[i] += share * (nat.land?.[i] ?? 0)
      }
    }
    const ok = (i) => E[i] > 0 && P[i] > 0 && PROD[i] > 0 && LAND[i] > 0
    if (!ok(y0) || !ok(yT)) return null
    const f = (i) => [P[i], PROD[i] / P[i], LAND[i] / PROD[i], E[i] / LAND[i]]
    const f0 = f(y0)
    const fT = f(yT)
    const dE = E[yT] - E[y0]
    const lm = Math.abs(Math.log(E[yT] / E[y0])) < 1e-9 ? E[y0] : dE / Math.log(E[yT] / E[y0])
    const bars = [
      { label: 'Population', v: lm * Math.log(fT[0] / f0[0]) },
      { label: 'Prod / capita', v: lm * Math.log(fT[1] / f0[1]) },
      { label: 'Land / kcal', v: lm * Math.log(fT[2] / f0[2]) },
      { label: 'Emissions / land', v: lm * Math.log(fT[3] / f0[3]) },
    ]
    return { bars, dE, span: `${years[y0]}\u2013${years[yT]}` }
  }, [trends, trendWeights, trendConfig])

  if (!result) return null
  const text = isDark ? 'rgba(248,248,232,0.85)' : 'rgba(24,24,56,0.85)'
  const muted = isDark ? 'rgba(248,248,232,0.5)' : 'rgba(24,24,56,0.5)'
  const up = '#D53E4F'
  const down = '#3288BD'
  const maxAbs = Math.max(...result.bars.map((b) => Math.abs(b.v)), Math.abs(result.dE), 1e-9)
  const HALF = 64  // px each side of the zero axis
  const AXIS = 86  // label column width

  const fmt = (v) => {
    const a = Math.abs(v)
    const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)} Mt` : `${a.toFixed(0)} kt`
    return `${v >= 0 ? '+' : '\u2212'}${s}`
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>
        PALE DRIVERS {result.span} · {fmt(result.dE)} CO₂e
      </div>
      {result.bars.map((b) => {
        const w = (Math.abs(b.v) / maxAbs) * HALF
        return (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: text, width: AXIS, flexShrink: 0, textAlign: 'right' }}>
              {b.label}
            </span>
            <div style={{ position: 'relative', width: 2 * HALF, height: 10, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: HALF, top: 0, bottom: 0, width: 1, background: muted, opacity: 0.5 }} />
              <div style={{
                position: 'absolute',
                left: b.v >= 0 ? HALF : HALF - w,
                width: Math.max(1, w),
                top: 1, bottom: 1,
                background: b.v >= 0 ? up : down,
                opacity: 0.85,
              }} />
            </div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: muted, whiteSpace: 'nowrap' }}>
              {fmt(b.v)}
            </span>
          </div>
        )
      })}
      <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: muted, marginTop: 3, lineHeight: 1.4 }}>
        log-mean decomposition; production in kcal (provisional factors)
      </div>
    </div>
  )
}
