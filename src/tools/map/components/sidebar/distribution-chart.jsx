/**
 * components/sidebar/distribution-chart.jsx
 *
 * Sorted distribution bar chart for the active variable.
 *
 * - Each visual column represents a cell sorted by value (highest left)
 * - Bars are scaled to the actual data range so they fill the chart height
 * - Bars colored with the variable's colormap (using full domain for color consistency)
 * - Filter icon in upper-right of chart area toggles a draggable cutoff line
 * - Dispatches SET_PERCENTILE { low, high: 100 } when filter line is dragged
 * - Dispatches { low: 0, high: 100 } when filter is deactivated
 * - Returns null for categorical variables (no meaningful distribution)
 */

import { useMemo, useRef, useState, useCallback } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { buildColorScale } from '../../lib/colormap.js'
import { formatValue } from '../../lib/format.js'
import { Actions } from '../../contracts/events.js'

const CHART_W = 220
const CHART_H = 90

// Lucide SlidersHorizontal — 1.5px stroke, 24px grid, matches the design system.
function SlidersIcon({ size = 16 }) {
  return <SlidersHorizontal size={size} strokeWidth={1.5} aria-hidden='true' />
}

export function DistributionChart({ variable, allValues, percentileRange, dispatch, isDark = false }) {
  const [filterActive, setFilterActive] = useState(false)
  const svgRef = useRef(null)
  const isDragging = useRef(false)

  const isCategorical = variable?.type === 'categorical'

  // Build a color scale using the actual data range so colors are vivid,
  // not washed out by a domain that is wider than the real data.
  // Diverging variables now go through the same colormap path so the
  // chart matches the map's continuous gradient (the older "binary
  // anchor by sign" mode was correct for diff layers with explicit
  // solidColor pins, but PM₂.₅ low/high are now BuRd-diverging at the
  // WHO threshold with no pinned anchors, and the chart should show
  // the full gradient there too).
  const isDiverging = variable?.diverging
  const hasAnchors  = variable?.solidColor != null || variable?.solidColorNegative != null
  const useGradient = !isDiverging || !hasAnchors
  const zeroRef = variable?.domain?.zero ?? 0

  const scale = useMemo(() => {
    if (!variable || isCategorical) return null
    // Diverging: rescale to data-derived p99 on each side of `zero`
    // (asymmetric — matches the map's color expression). Sequential:
    // p1/p99 of the full data so colors saturate at the actual data
    // extremes instead of the configured-but-too-wide domain.
    if (isDiverging) {
      if (allValues?.length >= 10) {
        const zero = variable.domain?.zero ?? 0
        const posDevs = allValues.filter((v) => v > zero).map((v) => v - zero).sort((a, b) => a - b)
        const negDevs = allValues.filter((v) => v < zero).map((v) => zero - v).sort((a, b) => a - b)
        const p99 = (arr) => arr.length > 0 ? (arr[Math.floor(0.99 * (arr.length - 1))] ?? arr[arr.length - 1]) : null
        const maxPos = p99(posDevs)
        const maxNeg = p99(negDevs)
        if (maxPos != null && maxNeg != null && (maxPos > 0 || maxNeg > 0)) {
          return buildColorScale({
            ...variable,
            domain: { min: zero - maxNeg, max: zero + maxPos, zero },
          })
        }
      }
      return buildColorScale(variable)
    }
    const sorted_ = allValues?.length ? [...allValues].sort((a, b) => a - b) : []
    if (sorted_.length < 2) return buildColorScale(variable)
    const p01 = sorted_[Math.floor(sorted_.length * 0.01)] ?? sorted_[0]
    const p99 = sorted_[Math.floor(sorted_.length * 0.99)] ?? sorted_[sorted_.length - 1]
    return buildColorScale({ ...variable, domain: { min: p01, max: p99 } })
  }, [variable, allValues, isCategorical, isDiverging])

  // Sort all values descending (highest value = leftmost bar)
  const sorted = useMemo(
    () => (allValues?.length ? [...allValues].sort((a, b) => b - a) : []),
    [allValues]
  )

  // Cap display range at p1–p99 so extreme outliers don't squish the distribution.
  // Bars for values outside this range are clipped to the chart edge (still visible
  // as full-height or zero-height bars) but don't distort the scale.
  // A project variable may also pin the low-end at `histogramMin` (e.g. 8 µg/m³
  // for PM₂.₅) to cut the long tail of background-noise low values out of the
  // visual; values below that threshold are dropped from the histogram entirely.
  const p99idx = Math.floor(sorted.length * 0.01)
  const p01idxRaw = Math.floor(sorted.length * 0.99)
  const histMin = variable?.histogramMin
  // `histogramMin` clips the low tail of the distribution (e.g. PM₂.₅ < 8
  // µg/m³). If the visible data doesn't reach that floor (zoomed deep into
  // a moderate-PM city, for instance), clipping would leave only a sliver
  // of values near the top — collapsing the axis labels to a single number
  // and emptying the bars. Fall back to the natural p1 in that case.
  const p01idx = (() => {
    if (histMin == null || sorted.length === 0) return p01idxRaw
    const cutoffIdx = sorted.findIndex((v) => v < histMin)
    if (cutoffIdx === -1) return p01idxRaw                  // all values >= histMin
    if (cutoffIdx < sorted.length * 0.05) return p01idxRaw  // <5% above histMin: ignore the floor
    return Math.max(p99idx + 1, cutoffIdx - 1)
  })()
  const dataMax = sorted.length ? (sorted[p99idx] ?? sorted[0]) : 1
  const dataMin = sorted.length ? (sorted[p01idx] ?? sorted[sorted.length - 1]) : 0
  const dataRange = Math.max(dataMax - dataMin, 1)

  // Domain range for zero-line placement + asymmetric opacity denominators (diverging only)
  const { zero } = variable?.domain ?? {}
  // Use per-side p99 of actual values so both extremes reach full opacity symmetrically
  const posDevs = useMemo(() => {
    if (!isDiverging || !allValues?.length) return []
    return allValues.filter(v => v > (zero ?? 0)).map(v => v - (zero ?? 0)).sort((a, b) => a - b)
  }, [allValues, isDiverging, zero])
  const negDevs = useMemo(() => {
    if (!isDiverging || !allValues?.length) return []
    return allValues.filter(v => v < (zero ?? 0)).map(v => (zero ?? 0) - v).sort((a, b) => a - b)
  }, [allValues, isDiverging, zero])
  const maxPosDev = posDevs.length > 0
    ? Math.max(posDevs[Math.floor(posDevs.length * 0.99)] ?? posDevs[posDevs.length - 1], 0.001)
    : Math.max(dataMax - (zero ?? 0), 0.001)
  const maxNegDev = negDevs.length > 0
    ? Math.max(negDevs[Math.floor(negDevs.length * 0.99)] ?? negDevs[negDevs.length - 1], 0.001)
    : Math.max((zero ?? 0) - dataMin, 0.001)

  // Build a histogram of counts across `CHART_W` value bins spanning the
  // clipped data range. Left = highest value, right = lowest (matches the
  // diverging-chart convention: red on the left, blue on the right). Each
  // bar carries its bin's count and its center value for coloring.
  const bars = useMemo(() => {
    if (!sorted.length) return []
    if (!allValues?.length) return []
    const N = CHART_W
    const width = Math.max(dataMax - dataMin, 1e-9) / N
    const counts = new Array(N).fill(0)
    for (const v of allValues) {
      if (v < dataMin || v > dataMax) continue
      // Lowest bin index for the lowest value; we'll flip the array
      // when emitting so the screen-left bar is the highest-value bin.
      const idx = Math.min(N - 1, Math.max(0, Math.floor((v - dataMin) / width)))
      counts[idx]++
    }
    return Array.from({ length: N }, (_, i) => {
      const lowIdx = N - 1 - i  // screen-left = highest bin
      const binStart = dataMin + lowIdx * width
      return {
        count: counts[lowIdx],
        binCenter: binStart + width / 2,
      }
    })
  }, [allValues, dataMin, dataMax])

  const maxCount = useMemo(() => {
    let m = 1
    for (const b of bars) if (b.count > m) m = b.count
    return m
  }, [bars])

  // Map a data value to SVG y coordinate (0 = top, CHART_H = bottom)
  // Uses actual data range so bars fill the full chart height
  const valueToY = useCallback(
    (v) => CHART_H * (1 - Math.max(0, Math.min(1, (v - dataMin) / dataRange))),
    [dataMin, dataRange]
  )

  // Zero line: only show if it falls within the actual data range
  const showZeroLine = variable?.diverging && zero !== undefined && zero >= dataMin && zero <= dataMax
  const zeroY = showZeroLine ? valueToY(zero) : CHART_H

  // Current filter line x position in SVG coords
  const low = percentileRange?.low ?? 0
  const filterLineX = ((100 - low) / 100) * CHART_W

  const updateFilterFromMouse = useCallback((clientX) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const newLow = Math.round(100 - pct * 100)
    dispatch({ type: Actions.SET_PERCENTILE, low: newLow, high: 100 })
  }, [dispatch])

  const handleSvgMouseDown = useCallback((e) => {
    if (!filterActive) return
    e.preventDefault()
    isDragging.current = true
    updateFilterFromMouse(e.clientX)

    const onMove = (evt) => { if (isDragging.current) updateFilterFromMouse(evt.clientX) }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [filterActive, updateFilterFromMouse])

  function handleToggleFilter() {
    if (filterActive) {
      dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
      setFilterActive(false)
    } else {
      dispatch({ type: Actions.SET_PERCENTILE, low: 90, high: 100 })
      setFilterActive(true)
    }
  }

  // Axis label values + whether the displayed range clips the true extremes
  const unit = variable?.unit ?? ''
  const showHighGT = sorted.length > 1 && sorted[0] > dataMax          // top 1% trimmed
  const showLowLT  = sorted.length > 1 && sorted[sorted.length - 1] < dataMin  // bottom 1% trimmed

  // Zero crossover x-position for diverging variables: bins are linearly
  // spaced from dataMax (left) to dataMin (right), so the zero crossing
  // sits at the position where binCenter passes through `zero`.
  const zeroCrossoverPct = (isDiverging && zero != null && zero > dataMin && zero < dataMax)
    ? ((dataMax - zero) / Math.max(dataMax - dataMin, 1e-9)) * 100
    : null

  if (!variable || isCategorical || !sorted.length) return null

  return (
    <div className="mb-6">
      {/* Chart with filter icon overlay */}
      <div className="relative">
        {/* Unit label — top right, just left of the filter icon */}
        {unit && (
          <span
            className="absolute font-mono text-[13px] text-ink-3 leading-none z-10 select-none"
            style={{ top: '5px', right: '32px' }}
          >
            {unit}
          </span>
        )}

        {/* Filter toggle button — upper right of chart */}
        <button
          type="button"
          onClick={handleToggleFilter}
          title={filterActive ? 'Clear filter' : 'Filter by percentile'}
          className={[
            'absolute z-10 bg-transparent border-0 cursor-pointer p-0 leading-none transition-colors',
            filterActive ? 'text-ink' : 'text-ink-3',
            'hover:text-ink',
          ].join(' ')}
          style={{ top: '5px', right: '5px' }}
        >
          <SlidersIcon size={18} />
        </button>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio='none'
          shapeRendering='crispEdges'
          style={{
            width: '100%',
            height: CHART_H,
            display: 'block',
            cursor: filterActive ? 'ew-resize' : 'default',
          }}
          onMouseDown={handleSvgMouseDown}
        >
          {/* Histogram bars — one per pixel-wide bin, height ∝ √(count) so
              the long tail of low-frequency bins stays visible alongside
              the peak. Bars are colored by the bin's center value via the
              same colormap used on the map. Full opacity throughout so
              the chart reads as a clear distribution; the map's
              alpha-driven fade is conveyed by color choice alone. */}
          {bars.map((bar, i) => {
            if (bar.count === 0) return null
            const heightFraction = Math.sqrt(bar.count / maxCount)
            const h = Math.max(1, heightFraction * CHART_H)
            const y = CHART_H - h
            const fill = (isDiverging && hasAnchors)
              ? (bar.binCenter >= zeroRef
                  ? variable.solidColor
                  : (variable.solidColorNegative ?? variable.solidColor))
              : (variable.solidColor ?? scale(bar.binCenter))
            return (
              <rect
                key={i}
                x={i} y={y}
                width={1} height={h}
                fill={fill}
                opacity={1}
              />
            )
          })}

          {/* Vertical zero line for diverging variables — sits at the
              x-position of the bin whose center is the diverging zero. */}
          {showZeroLine && zeroCrossoverPct != null && (
            <line
              x1={(zeroCrossoverPct / 100) * CHART_W}
              y1={0}
              x2={(zeroCrossoverPct / 100) * CHART_W}
              y2={CHART_H}
              stroke='rgba(128,128,128,0.55)'
              strokeWidth={0.8}
            />
          )}

          {/* Filter line + drag handle */}
          {filterActive && (
            <g>
              <line
                x1={filterLineX} y1={0}
                x2={filterLineX} y2={CHART_H}
                stroke={isDark ? 'rgba(255,255,255,0.9)' : 'rgba(30,30,30,0.85)'}
                strokeWidth={1.5}
              />
              <circle
                cx={filterLineX} cy={8}
                r={5}
                fill={isDark ? 'rgba(255,255,255,0.92)' : 'rgba(240,240,240,0.95)'}
                stroke={isDark ? 'rgba(120,120,120,0.7)' : 'rgba(30,30,30,0.6)'}
                strokeWidth={1}
              />
            </g>
          )}
        </svg>
      </div>

      {/* Axis labels — left=max, right=min, zero label at crossover for diverging */}
      <div className="relative" style={{ height: '14px', marginTop: '3px', marginBottom: '2px' }}>
        {/* High-end label (left) */}
        <span className="absolute left-0 font-mono text-[13px] text-ink-3 leading-none">
          {showHighGT ? '>' : ''}{formatValue(dataMax, '')}
        </span>

        {/* Zero crossover label — only when diverging and zero falls well inside range */}
        {zeroCrossoverPct !== null && zeroCrossoverPct > 8 && zeroCrossoverPct < 92 && (
          <span
            className="absolute font-mono text-[13px] text-ink-3 leading-none whitespace-nowrap"
            style={{ left: `${zeroCrossoverPct}%`, transform: 'translateX(-50%)' }}
          >
            {formatValue(zero ?? 0, '')}
          </span>
        )}

        {/* Low-end label (right) */}
        <span className="absolute right-0 font-mono text-[13px] text-ink-3 leading-none">
          {showLowLT ? '<' : ''}{formatValue(dataMin, '')}
        </span>
      </div>

      {/* Filter status */}
      {filterActive && low > 0 && (
        <p className="font-sans text-[13px] text-ink-3 mt-1 m-0">
          Showing top {100 - low}%
        </p>
      )}
    </div>
  )
}
