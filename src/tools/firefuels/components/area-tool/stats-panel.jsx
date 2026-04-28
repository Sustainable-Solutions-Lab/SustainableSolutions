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

  const scale = useMemo(() => {
    if (!variable || variable.diverging || !values?.length) return null
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

  if (!bins.length || (!scale && !variable?.diverging)) return null

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

        // Diverging: binary color + asymmetric opacity (matching statewide chart)
        // Sequential: continuous colormap, flat opacity
        const fill = variable.diverging
          ? (binMid >= zero ? POS_COLOR : NEG_COLOR)
          : scale(binMid)
        const tRaw = variable.diverging
          ? (binMid >= zero
              ? Math.min(1, (binMid - zero) / maxPosDev)
              : Math.min(1, (zero - binMid) / maxNegDev))
          : 1
        const opacity = variable.diverging ? (0.15 + 0.85 * Math.pow(tRaw, 0.4)) : 0.85

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

      {/* Axis labels */}
      <text x={0} y={HIST_H + 11} fontSize={9} fill={labelColor} fontFamily={FONT_MONO}>
        {formatValue(min, variable?.unit ?? '')}
      </text>
      <text x={HIST_W} y={HIST_H + 11} fontSize={9} fill={labelColor} fontFamily={FONT_MONO} textAnchor='end'>
        {formatValue(max, variable?.unit ?? '')}
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

// ── Panel ─────────────────────────────────────────────────────────────────────

export function StatsPanel({ drawnCircle, aggregateStats, areaToolActive, activeVariable, isDark, dispatch }) {
  if (!drawnCircle) return null

  function handleClose() {
    if (areaToolActive) dispatch({ type: Actions.TOGGLE_AREA_TOOL })
    dispatch({ type: Actions.SET_DRAWN_CIRCLE, circle: null })
    dispatch({ type: Actions.SET_AGGREGATE_STATS, stats: null })
  }

  const count = aggregateStats?.count ?? 0
  const activeVarValues = aggregateStats?.activeVarValues ?? []

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

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: hasData ? 5 : 0, flexWrap: 'wrap' }}>
        {/* Mean and median — numeric variables only */}
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

      {/* Empty state */}
      {!hasData && count === 0 && (
        <span style={{ fontFamily: FONT_SANS, fontSize: 11, color: textMuted }}>
          Move circle to data area
        </span>
      )}
    </div>
  )
}
