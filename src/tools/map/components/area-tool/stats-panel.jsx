/**
 * components/area-tool/stats-panel.jsx
 *
 * Regional data panel — shown when the area tool is active and a circle
 * has been drawn. Displays cell count, mean, median, and a mini histogram
 * of the currently active map variable within the circle.
 *
 * Props:
 *   drawnCircle:    DrawnCircle | null
 *   aggregateStats: AggregateStats | null   (includes activeVarValues: number[])
 *   areaToolActive: boolean
 *   activeVariable: Variable | null
 *   isDark:         boolean
 *   dispatch:       Dispatch
 */

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { Actions } from '../../contracts/events.js'
import { buildColorScale } from '../../lib/colormap.js'
import { formatValue } from '../../lib/format.js'

const POS_COLOR = '#4393c3'
const NEG_COLOR = '#d6604d'

const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"
const FONT_SANS = "'Inter', sans-serif"

// ── Mini histogram ────────────────────────────────────────────────────────────

const HIST_W = 220
const HIST_H = 60
const N_BINS = 24

function MiniHistogram({ values, variable, isDark }) {
  // Compute p1/p99 clip range once — shared by scale and bins
  const { p01, p99: p99val } = useMemo(() => {
    if (!values?.length) return { p01: 0, p99: 1 }
    const s = [...values].sort((a, b) => a - b)
    return {
      p01: s[Math.floor(s.length * 0.01)] ?? s[0],
      p99: s[Math.floor(s.length * 0.99)] ?? s[s.length - 1],
    }
  }, [values])

  // Diverging variables with no pinned `solidColor` anchors get a full
  // colormap-gradient scale just like sequential variables, so the mini
  // histogram matches the map's continuous BuRd / MagmaR ramp instead of
  // falling back to the binary blue/red POS/NEG anchors. Use the same
  // asymmetric data-derived domain the map uses (per-side p99 around
  // `zero`), so a region that's all on one side of the diverging point
  // saturates to dark instead of stuck in mid-tones.
  const hasAnchors = variable?.solidColor != null || variable?.solidColorNegative != null
  const scale = useMemo(() => {
    if (!variable || !values?.length) return null
    if (variable.diverging) {
      const zero = variable.domain?.zero ?? 0
      const posDevs = values.filter((v) => v > zero).map((v) => v - zero).sort((a, b) => a - b)
      const negDevs = values.filter((v) => v < zero).map((v) => zero - v).sort((a, b) => a - b)
      const p99fn = (arr) => arr.length > 0 ? (arr[Math.floor(0.99 * (arr.length - 1))] ?? arr[arr.length - 1]) : 0
      const maxPos = p99fn(posDevs)
      const maxNeg = p99fn(negDevs)
      if (maxPos > 0 || maxNeg > 0) {
        return buildColorScale({
          ...variable,
          domain: { min: zero - Math.max(maxNeg, 1e-9), max: zero + Math.max(maxPos, 1e-9), zero },
        })
      }
      return buildColorScale(variable)
    }
    return buildColorScale({ ...variable, domain: { min: p01, max: p99val } })
  }, [variable, values, p01, p99val])

  const { bins, binWidth, min, max, mean, median, maxPosDev, maxNegDev } = useMemo(() => {
    if (!values?.length || !variable) return { bins: [], binWidth: 0, min: 0, max: 1, mean: null, median: null, maxPosDev: 1, maxNegDev: 1 }

    // Use p1–p99 as the bin range so outliers don't squash the distribution.
    // Values outside the range are clamped into the edge bins.
    const domMin = p01
    const domMax = p99val
    const range = domMax - domMin || 1
    const bw = range / N_BINS

    const counts = Array(N_BINS).fill(0)
    for (const v of values) {
      const i = Math.max(0, Math.min(N_BINS - 1, Math.floor((v - domMin) / bw)))
      counts[i]++
    }

    const mean_ = values.reduce((s, v) => s + v, 0) / values.length
    const sv = [...values].sort((a, b) => a - b)
    const n = sv.length
    const median_ = n % 2 === 0
      ? (sv[n / 2 - 1] + sv[n / 2]) / 2
      : sv[Math.floor(n / 2)]

    const zero = variable.domain?.zero ?? 0
    // Per-side p99 so both extremes reach full opacity (matching map + statewide chart)
    const posDevs = values.filter(v => v > zero).map(v => v - zero).sort((a, b) => a - b)
    const negDevs = values.filter(v => v < zero).map(v => zero - v).sort((a, b) => a - b)
    const maxPosDev = posDevs.length > 0
      ? Math.max(posDevs[Math.floor(posDevs.length * 0.99)] ?? posDevs[posDevs.length - 1], 0.001)
      : Math.max(domMax - zero, 0.001)
    const maxNegDev = negDevs.length > 0
      ? Math.max(negDevs[Math.floor(negDevs.length * 0.99)] ?? negDevs[negDevs.length - 1], 0.001)
      : Math.max(zero - domMin, 0.001)
    return {
      bins: counts,
      binWidth: bw,
      min: domMin,
      max: domMax,
      mean: mean_,
      median: median_,
      maxPosDev,
      maxNegDev,
    }
  }, [values, variable, p01, p99val])

  if (!bins.length || !scale) return null

  const maxCount = Math.max(...bins, 1)
  const barW = HIST_W / N_BINS
  const zero = variable?.domain?.zero ?? 0

  const valueToX = (v) => ((v - min) / (max - min)) * HIST_W
  const axisColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)'

  return (
    <svg
      viewBox={`0 0 ${HIST_W} ${HIST_H + 14}`}
      preserveAspectRatio='none'
      style={{ width: '100%', height: HIST_H + 14, display: 'block' }}
    >
      {/* Bars */}
      {bins.map((count, i) => {
        const binMid = min + (i + 0.5) * binWidth
        const barH = (count / maxCount) * HIST_H

        // Pinned-anchor diverging (e.g. older diff layers with solidColor /
        // solidColorNegative): binary POS/NEG fill + asymmetric opacity.
        // Everything else (continuous gradient): just `scale(binMid)` at
        // flat opacity, matching the map's per-stop color.
        const useAnchors = variable.diverging && hasAnchors
        const fill = useAnchors
          ? (binMid >= zero ? POS_COLOR : NEG_COLOR)
          : scale(binMid)
        const tRaw = useAnchors
          ? (binMid >= zero
              ? Math.min(1, (binMid - zero) / maxPosDev)
              : Math.min(1, (zero - binMid) / maxNegDev))
          : 1
        const opacity = useAnchors ? (0.15 + 0.85 * Math.pow(tRaw, 0.4)) : 0.85

        return (
          <rect
            key={i}
            x={i * barW}
            y={HIST_H - barH}
            width={Math.max(barW - 0.5, 0.5)}
            height={barH}
            fill={fill}
            opacity={opacity}
          />
        )
      })}

      {/* Baseline */}
      <line x1={0} y1={HIST_H} x2={HIST_W} y2={HIST_H} stroke={axisColor} strokeWidth={0.8} />

      {/* Mean — solid vertical line */}
      {mean !== null && (
        <line
          x1={valueToX(mean)} y1={0}
          x2={valueToX(mean)} y2={HIST_H}
          stroke={isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'}
          strokeWidth={1.2}
        />
      )}

      {/* Median — dashed vertical line */}
      {median !== null && (
        <line
          x1={valueToX(median)} y1={0}
          x2={valueToX(median)} y2={HIST_H}
          stroke={isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'}
          strokeWidth={1.2}
          strokeDasharray='3 2'
        />
      )}

      {/* Axis labels — value only (the unit is shown in the surrounding
          stats panel; repeating it on every axis label in a narrow
          chart caused the two ends to overlap visually). */}
      <text x={0} y={HIST_H + 11} fontSize={9} fill={labelColor} fontFamily={FONT_MONO}>
        {formatValue(min, '')}
      </text>
      <text x={HIST_W} y={HIST_H + 11} fontSize={9} fill={labelColor} fontFamily={FONT_MONO} textAnchor='end'>
        {formatValue(max, '')}
      </text>
    </svg>
  )
}

// ── Stacked bar (for categorical variables) ───────────────────────────────────

function StackedBar({ values, variable, isDark }) {
  const categories = variable.categories ?? []
  const total = values.length
  if (total === 0) return null

  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)'

  // Count and compute fractions — preserve config order, skip zeros
  const segments = categories
    .map((cat) => {
      const count = values.filter((v) => v === cat.id).length
      return { cat, count, frac: count / total }
    })
    .filter((s) => s.count > 0)

  // Build SVG segments: each rect starts where the previous ended
  let cursor = 0
  const BAR_W = 220
  const BAR_H = 18

  return (
    <div style={{ width: '100%' }}>
      {/* Stacked bar */}
      <svg
        viewBox={`0 0 ${BAR_W} ${BAR_H}`}
        preserveAspectRatio='none'
        style={{ width: '100%', height: BAR_H, display: 'block', borderRadius: 2, overflow: 'hidden' }}
      >
        {segments.map((seg, i) => {
          const x = cursor * BAR_W
          const w = seg.frac * BAR_W
          cursor += seg.frac
          return (
            <rect
              key={i}
              x={x} y={0}
              width={Math.max(w, 0.5)} height={BAR_H}
              fill={seg.cat.color}
              opacity={0.85}
            />
          )
        })}
      </svg>

      {/* Legend rows — one per present category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 5 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 1,
              background: seg.cat.color, opacity: 0.85, flexShrink: 0,
            }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: textColor, whiteSpace: 'nowrap' }}>
              {seg.cat.label}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: textColor, marginLeft: 'auto', paddingLeft: 8 }}>
              {Math.round(seg.frac * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Equity chart ──────────────────────────────────────────────────────────
//
// Bins the per-cell records by income tertile (left) and by % non-Hispanic
// white into the paper's 3 categorical bins (<30 / 30–60 / >60) on the
// right. Within each bin we compute the population-weighted mean of the
// active metric (PM₂.₅ or mortality, low/high CDR follows the user's
// scenario toggle) and express it as percent deviation from the region's
// overall pop-weighted mean. Bars matched to the figure: a wider light
// rectangle for an approximate 95 % bootstrap CI, with a saturated
// inner band for the point estimate.

const EQUITY_W = 260
const EQUITY_H = 96
const EQUITY_PAD_TOP = 16
const EQUITY_PAD_BOT = 14
const EQUITY_AXIS = 14 // single row of bin labels under the bars
const EQUITY_BAR_W = 20
const EQUITY_BAR_GAP = 12
const EQUITY_GROUP_GAP = 28

function popWeightedMean(records, valueKey) {
  let num = 0, den = 0
  for (const r of records) {
    const v = r[valueKey]
    if (v == null || !isFinite(v)) continue
    num += v * r.population
    den += r.population
  }
  return den > 0 ? num / den : null
}

function quantile(arr, q) {
  if (!arr.length) return null
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(q * arr.length)))
  return arr[idx]
}

function bootstrapDeviationCI(records, valueKey, overallMean, draws = 200) {
  if (!records.length || overallMean == null || overallMean === 0) return null
  const n = records.length
  const devs = new Array(draws)
  for (let d = 0; d < draws; d++) {
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      const r = records[(Math.random() * n) | 0]
      num += r[valueKey] * r.population
      den += r.population
    }
    devs[d] = (num / den - overallMean) / overallMean
  }
  devs.sort((a, b) => a - b)
  return {
    lo: devs[Math.floor(0.025 * draws)],
    hi: devs[Math.floor(0.975 * draws)],
  }
}

function EquityChart({ records, valueKey, isDark, unit, metricLabel }) {
  const computed = useMemo(() => {
    if (records.length < 30) return null
    const overall = popWeightedMean(records, valueKey)
    if (overall == null || overall === 0) return null

    // Income tertiles by INCOME value (each pixel weighted equally for
    // breakpoint selection — same as the paper's >33 / 33–66 / >66 split).
    // Pull just the income numbers for the breakpoints — `quantile()` of
    // an array of records would return a record object, and the
    // subsequent `r.income <= [object]` comparisons silently coerce to
    // NaN and drop every record.
    const incomeValues = records.map((r) => r.income).sort((a, b) => a - b)
    const t1 = quantile(incomeValues, 1 / 3)
    const t2 = quantile(incomeValues, 2 / 3)
    const incomeBins = [
      { label: '<33ʳᵈ',    records: records.filter((r) => r.income <= t1) },
      { label: '33–66ᵗʰ',  records: records.filter((r) => r.income >  t1 && r.income <= t2) },
      { label: '>66ᵗʰ',    records: records.filter((r) => r.income >  t2) },
    ]

    // Race bins — same thresholds as the paper.
    const raceBins = [
      { label: '<30%',   records: records.filter((r) => r.percent_white <= 30) },
      { label: '30–60%', records: records.filter((r) => r.percent_white >  30 && r.percent_white <= 60) },
      { label: '>60%',   records: records.filter((r) => r.percent_white >  60) },
    ]

    function summarize(bins) {
      return bins.map((b) => {
        if (b.records.length < 5) return { ...b, dev: null, ci: null }
        const m = popWeightedMean(b.records, valueKey)
        const dev = (m - overall) / overall
        const ci = bootstrapDeviationCI(b.records, valueKey, overall)
        return { ...b, dev, ci, n: b.records.length }
      })
    }
    return {
      overall,
      income: summarize(incomeBins),
      race:   summarize(raceBins),
    }
  }, [records, valueKey])

  if (!computed) return null

  // Domain — pull in to ±25 % unless data exceeds it.
  const allDevs = [...computed.income, ...computed.race].flatMap((b) => b.ci ? [b.ci.lo, b.ci.hi, b.dev] : (b.dev != null ? [b.dev] : []))
  const dataMax = Math.max(0.20, ...allDevs.map(Math.abs))
  const yMax = Math.min(0.40, Math.ceil(dataMax * 20) / 20)  // round up to nearest 5 %

  const innerH = EQUITY_H - EQUITY_PAD_TOP - EQUITY_PAD_BOT
  const yMid = EQUITY_PAD_TOP + innerH / 2
  const yScale = innerH / 2 / yMax  // px per unit deviation

  const labelMuted = isDark ? 'rgba(248, 248, 232, 0.55)' : 'rgba(24, 24, 56, 0.55)'
  const labelFaint = isDark ? 'rgba(248, 248, 232, 0.35)' : 'rgba(24, 24, 56, 0.35)'
  const axisColor  = isDark ? 'rgba(248, 248, 232, 0.18)' : 'rgba(24, 24, 56, 0.18)'

  // Income bars: blue (paper's left panel). Race bars: red (right panel).
  const palette = {
    income: { bandFill: isDark ? 'rgba(67, 147, 195, 0.22)' : 'rgba(67, 147, 195, 0.28)',
              barFill:  isDark ? 'rgba(67, 147, 195, 0.95)' : '#2166ac' },
    race:   { bandFill: isDark ? 'rgba(214, 96, 77, 0.22)'  : 'rgba(214, 96, 77, 0.28)',
              barFill:  isDark ? 'rgba(214, 96, 77, 0.95)'  : '#b2182b' },
  }

  // Layout: 3 income bars on the left, 3 race bars on the right, divider
  // in the middle. Compute x-positions for each.
  const incomeStart = 30
  const groupW = 3 * EQUITY_BAR_W + 2 * EQUITY_BAR_GAP
  const incomeXs = [0, 1, 2].map((i) => incomeStart + i * (EQUITY_BAR_W + EQUITY_BAR_GAP))
  const raceStart = incomeStart + groupW + EQUITY_GROUP_GAP
  const raceXs = [0, 1, 2].map((i) => raceStart + i * (EQUITY_BAR_W + EQUITY_BAR_GAP))
  const dividerX = incomeStart + groupW + EQUITY_GROUP_GAP / 2

  function devY(d) { return yMid - d * yScale }

  function renderBar(b, x, fillBand, fillBar) {
    if (b.dev == null) return null
    const POINT_H = 3
    const elements = []
    // CI band (lighter rectangle)
    if (b.ci) {
      const top = devY(b.ci.hi)
      const bottom = devY(b.ci.lo)
      elements.push(
        <rect key='ci' x={x} y={top} width={EQUITY_BAR_W} height={Math.max(2, bottom - top)} fill={fillBand} />,
      )
    }
    // Point estimate — narrow saturated band centered on b.dev
    elements.push(
      <rect key='pt' x={x} y={devY(b.dev) - POINT_H / 2} width={EQUITY_BAR_W} height={POINT_H} fill={fillBar} />,
    )
    // % label above (or below if negative)
    const sign = b.dev >= 0 ? '+' : ''
    const labelY = b.dev >= 0 ? Math.max(8, devY(b.ci?.hi ?? b.dev) - 4) : Math.min(EQUITY_H - EQUITY_AXIS - 2, devY(b.ci?.lo ?? b.dev) + 11)
    elements.push(
      <text key='lbl'
        x={x + EQUITY_BAR_W / 2}
        y={labelY}
        fontSize={9}
        fontFamily={FONT_MONO}
        fill={labelMuted}
        textAnchor='middle'>
        {sign}{(b.dev * 100).toFixed(1)}%
      </text>,
    )
    return <g key={x}>{elements}</g>
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Single header row — full taxonomy of the metric is conveyed by the
          active-layer state in the rest of the UI; here we just title the
          chart by what it shows. */}
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: labelMuted, marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Excess relative to region mean
      </div>
      {/* Direction labels — "higher income →" and "more white →" sit
          directly above their bar groups. */}
      <div style={{ display: 'flex', fontFamily: FONT_MONO, fontSize: 9, color: labelFaint, marginBottom: 2 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>higher income →</span>
        <span style={{ flex: 1, textAlign: 'center' }}>more white →</span>
      </div>
      <svg
        viewBox={`0 0 ${EQUITY_W} ${EQUITY_H}`}
        preserveAspectRatio='none'
        style={{ width: '100%', height: EQUITY_H, display: 'block' }}
      >
        {/* y axis: zero line + ±yMax ticks */}
        <line x1={0} y1={yMid} x2={EQUITY_W} y2={yMid} stroke={axisColor} strokeWidth={0.8} />
        <text x={0} y={EQUITY_PAD_TOP + 3} fontSize={8} fontFamily={FONT_MONO} fill={labelFaint}>+{(yMax * 100).toFixed(0)}%</text>
        <text x={0} y={yMid + 3} fontSize={8} fontFamily={FONT_MONO} fill={labelFaint}>0</text>
        <text x={0} y={EQUITY_H - EQUITY_AXIS - 2} fontSize={8} fontFamily={FONT_MONO} fill={labelFaint}>−{(yMax * 100).toFixed(0)}%</text>

        {/* divider between income and race groups */}
        <line x1={dividerX} y1={EQUITY_PAD_TOP - 4} x2={dividerX} y2={EQUITY_H - EQUITY_AXIS + 6}
              stroke={axisColor} strokeWidth={0.6} strokeDasharray='3 3' />

        {/* Bars */}
        {computed.income.map((b, i) => renderBar(b, incomeXs[i], palette.income.bandFill, palette.income.barFill))}
        {computed.race.map((b, i) => renderBar(b, raceXs[i], palette.race.bandFill, palette.race.barFill))}

        {/* x labels — bin names only (the direction is in the headers
            above so the under-axis row stays uncluttered). */}
        {['<33ʳᵈ', '33–66ᵗʰ', '>66ᵗʰ'].map((lbl, i) => (
          <text key={`il${i}`}
            x={incomeXs[i] + EQUITY_BAR_W / 2}
            y={EQUITY_H - EQUITY_AXIS + 11}
            fontSize={9} fontFamily={FONT_MONO}
            fill={labelMuted} textAnchor='middle'>{lbl}</text>
        ))}
        {['<30%', '30–60%', '>60%'].map((lbl, i) => (
          <text key={`rl${i}`}
            x={raceXs[i] + EQUITY_BAR_W / 2}
            y={EQUITY_H - EQUITY_AXIS + 11}
            fontSize={9} fontFamily={FONT_MONO}
            fill={labelMuted} textAnchor='middle'>{lbl}</text>
        ))}
      </svg>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function StatsPanel({ drawnCircle, drawnPolygon, aggregateStats, areaToolActive, activeVariable, isDark, dispatch }) {
  // Show whenever either a circle or a ZIP polygon is active.
  if (!drawnCircle && !drawnPolygon) return null

  function handleClose() {
    if (areaToolActive) dispatch({ type: Actions.TOGGLE_AREA_TOOL })
    dispatch({ type: Actions.SET_DRAWN_CIRCLE, circle: null })
    dispatch({ type: Actions.SET_DRAWN_POLYGON, polygon: null })
    dispatch({ type: Actions.SET_AGGREGATE_STATS, stats: null })
  }

  const count = aggregateStats?.count ?? 0
  const activeVarValues = aggregateStats?.activeVarValues ?? []
  const equityRecords = aggregateStats?.equityRecords ?? []

  // Pick the value key used by the equity chart. Income & race-bins drive
  // the x-axis; the y-axis ("excess relative to mean") is computed against
  // PM₂.₅ or mortality of the current scenario. The four other layers
  // (population, income, race, etc.) don't make sense as the y-axis, so
  // we just hide the equity chart for those.
  const layerId = activeVariable?.layer
  const scenario = activeVariable?.dimensionValues?.scenario
  let equityValueKey = null
  let equityMetricLabel = null
  if (layerId === 'pm25' && (scenario === 'low' || scenario === 'high')) {
    equityValueKey = scenario === 'low' ? 'pm25_low' : 'pm25_high'
    equityMetricLabel = scenario === 'low' ? 'PM₂.₅ exposure · Low-CDR' : 'PM₂.₅ exposure · High-CDR'
  } else if (layerId === 'mortality' && (scenario === 'low' || scenario === 'high')) {
    equityValueKey = scenario === 'low' ? 'mort_low' : 'mort_high'
    equityMetricLabel = scenario === 'low' ? 'Mortality · Low-CDR' : 'Mortality · High-CDR'
  }

  // Compute mean and median — only for numeric (non-categorical) variables
  const { mean, median } = useMemo(() => {
    if (!activeVarValues.length || activeVariable?.type === 'categorical') return { mean: null, median: null }
    const mean_ = activeVarValues.reduce((s, v) => s + v, 0) / activeVarValues.length
    const sorted = [...activeVarValues].sort((a, b) => a - b)
    const n = sorted.length
    const median_ = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)]
    return { mean: mean_, median: median_ }
  }, [activeVarValues])

  const unit = activeVariable?.unit ?? ''

  // Aligned with the design system: paper-2 with translucency so map context
  // shows through; rule-strength border; ink-3 muted text; ink line color.
  const panelBg = isDark ? 'rgba(20, 20, 42, 0.92)' : 'rgba(241, 241, 223, 0.95)'
  const borderColor = isDark ? 'rgba(248, 248, 232, 0.14)' : 'rgba(24, 24, 56, 0.14)'
  const textMuted = isDark ? 'rgba(248, 248, 232, 0.55)' : 'rgba(24, 24, 56, 0.55)'
  const lineColor = isDark ? 'rgba(248, 248, 232, 0.75)' : 'rgba(24, 24, 56, 0.7)'
  const btnColor = isDark ? 'rgba(248, 248, 232, 0.45)' : 'rgba(24, 24, 56, 0.45)'

  const isCategorical = activeVariable?.type === 'categorical'
  const hasData = activeVariable && activeVarValues.length > 0

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 24,
        background: panelBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px 8px',
        minWidth: 240,
        maxWidth: 320,
        zIndex: 10,
        // Design system shadow (--shadow-pop): soft, neutral, not blue-tinted.
        boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Close button — absolute top-right */}
      <button
        onClick={handleClose}
        aria-label='Close area stats'
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          lineHeight: 0,
          color: btnColor,
        }}
      >
        <X size={14} strokeWidth={1.5} />
      </button>

      {/* Histogram (numeric) or pie chart (categorical) */}
      {hasData && isCategorical && (
        <StackedBar values={activeVarValues} variable={activeVariable} isDark={isDark} />
      )}
      {hasData && !isCategorical && (
        <MiniHistogram values={activeVarValues} variable={activeVariable} isDark={isDark} />
      )}

      {/* Stats row — mean / median legend + area, sits right under the
          histogram so the line marks above it have an immediate key. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: hasData ? 5 : 0, flexWrap: 'wrap' }}>
        {hasData && !isCategorical && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width={14} height={8} style={{ flexShrink: 0 }}>
                <line x1={0} y1={4} x2={14} y2={4} stroke={lineColor} strokeWidth={1.5} />
              </svg>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: textMuted }}>
                mean {mean !== null ? formatValue(mean, unit) : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width={14} height={8} style={{ flexShrink: 0 }}>
                <line x1={0} y1={4} x2={14} y2={4} stroke={lineColor} strokeWidth={1.5} strokeDasharray='3 2' />
              </svg>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: textMuted }}>
                median {median !== null ? formatValue(median, unit) : '—'}
              </span>
            </div>
            <span style={{ color: borderColor, fontSize: 10, userSelect: 'none' }}>·</span>
          </>
        )}
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: textMuted }}>
          {count.toLocaleString()} km²
        </span>
      </div>

      {/* Equity chart — pop-weighted exposure by income tertile + race
          bin. Only renders for PM / mortality + low|high-CDR scenarios
          when the region overlaps city pixels (which carry the income
          + race fields) with enough records to bin meaningfully. */}
      {equityValueKey && equityRecords.length >= 30 && (
        <EquityChart
          records={equityRecords}
          valueKey={equityValueKey}
          metricLabel={equityMetricLabel}
          unit={activeVariable?.unit ?? ''}
          isDark={isDark}
        />
      )}

      {/* Empty state */}
      {!hasData && count === 0 && (
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: textMuted }}>
          Move circle to data area
        </span>
      )}
    </div>
  )
}
