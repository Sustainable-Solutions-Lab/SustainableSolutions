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

/** @jsxImportSource theme-ui */
import { useMemo, useRef, useState, useCallback } from 'react'
import { Box, Flex, Text } from 'theme-ui'
import { buildColorScale } from '../../lib/colormap.js'
import { formatValue } from '../../lib/format.js'
import { Actions } from '../../contracts/events.js'

const CHART_W = 220
const CHART_H = 90

function SlidersIcon({ active, size = 16 }) {
  return (
    <svg
      width={size} height={size} viewBox='0 0 14 14'
      fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round'
    >
      <line x1='2' y1='4.5' x2='12' y2='4.5'/>
      <line x1='2' y1='9.5' x2='12' y2='9.5'/>
      <circle
        cx='5' cy='4.5' r='1.8'
        fill={active ? 'currentColor' : 'none'}
        strokeWidth='1.4'
      />
      <circle
        cx='9' cy='9.5' r='1.8'
        fill={active ? 'currentColor' : 'none'}
        strokeWidth='1.4'
      />
    </svg>
  )
}

export function DistributionChart({ variable, allValues, percentileRange, dispatch, isDark = false }) {
  const [filterActive, setFilterActive] = useState(false)
  const svgRef = useRef(null)
  const isDragging = useRef(false)

  const isCategorical = variable?.type === 'categorical'

  // Build a color scale using the actual data range so colors are vivid,
  // not washed out by a domain that is wider than the real data.
  // Diverging variables use binary color (sign only) + opacity for magnitude —
  // matching the map. No D3 scale needed; scale is only used for sequential variables.
  const isDiverging = variable?.diverging
  const zeroRef = variable?.domain?.zero ?? 0

  const scale = useMemo(() => {
    if (!variable || isCategorical || isDiverging) return null
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
  const p99idx = Math.floor(sorted.length * 0.01)
  const p01idx = Math.floor(sorted.length * 0.99)
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

  // Sample CHART_W values evenly from the p1–p99 clipped slice of sorted.
  // Using the full array caused outliers (sorted[0]) to dominate bar 0, creating
  // a visible step between the first bar and its neighbours. Clipping to the same
  // range shown on the axis labels makes the sampling uniform end-to-end.
  const bars = useMemo(() => {
    if (!sorted.length) return []
    if (!scale && !isDiverging) return []  // sequential needs a scale; diverging uses binary color
    const clipped = sorted.slice(p99idx, p01idx + 1)
    if (!clipped.length) return []
    return Array.from({ length: CHART_W }, (_, i) => {
      const idx = Math.floor((i / CHART_W) * clipped.length)
      return clipped[idx] ?? dataMin
    })
  }, [sorted, scale, isDiverging, dataMin, p99idx, p01idx])

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

  // Zero crossover x-position for diverging variables:
  // count how many sorted (descending) values are >= zero; that fraction is % from left edge.
  const zeroCrossoverPct = (isDiverging && sorted.length > 0)
    ? (sorted.filter(v => v >= (zero ?? 0)).length / sorted.length) * 100
    : null

  if (!variable || isCategorical || !sorted.length) return null

  return (
    <Box sx={{ mb: 3 }}>
      {/* Chart with filter icon overlay */}
      <Box sx={{ position: 'relative' }}>
        {/* Unit label — top right, just left of the filter icon */}
        {unit && (
          <Text sx={{
            position: 'absolute', top: '5px', right: '32px',
            fontFamily: 'mono', fontSize: 1, color: 'muted', lineHeight: 1,
            zIndex: 1, userSelect: 'none',
          }}>
            {unit}
          </Text>
        )}

        {/* Filter toggle button — upper right of chart */}
        <Box
          as='button'
          onClick={handleToggleFilter}
          title={filterActive ? 'Clear filter' : 'Filter by percentile'}
          sx={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            zIndex: 1,
            bg: 'transparent',
            border: 'none',
            cursor: 'pointer',
            p: 0,
            lineHeight: 0,
            color: filterActive ? 'text' : 'muted',
            '&:hover': { color: 'text' },
          }}
        >
          <SlidersIcon active={filterActive} size={20} />
        </Box>

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
          {/* Value bars — one per pixel column, colored by colormap, height by data range */}
          {bars.map((value, i) => {
            const y = Math.min(valueToY(value), zeroY)
            const h = Math.abs(valueToY(value) - zeroY)
            // Diverging: binary color (direction) + asymmetric opacity encodes magnitude.
            // Positive side normalised to maxPosDev; negative side to maxNegDev,
            // so both the highest and lowest values reach full opacity (1.0).
            // Sequential: continuous colormap, flat opacity.
            const fill = isDiverging
              ? (value >= zeroRef
                  ? (isDark ? '#4393c3' : '#2166ac')
                  : (isDark ? '#d6604d' : '#b2182b'))
              : scale(value)
            const tRaw = isDiverging
              ? (value >= zeroRef
                  ? Math.min(1, (value - zeroRef) / maxPosDev)
                  : Math.min(1, (zeroRef - value) / maxNegDev))
              : 1
            const opacity = isDiverging ? (0.15 + 0.85 * Math.pow(tRaw, 0.4)) : 0.9
            return (
              <rect
                key={i}
                x={i} y={y}
                width={1} height={Math.max(0.5, h)}
                fill={fill}
                opacity={opacity}
              />
            )
          })}

          {/* Zero line for diverging variables (only when zero within data range) */}
          {showZeroLine && (
            <line
              x1={0} y1={zeroY}
              x2={CHART_W} y2={zeroY}
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
      </Box>

      {/* Axis labels — left=max, right=min, zero label at crossover for diverging */}
      <Box sx={{ position: 'relative', height: '14px', mt: '3px', mb: '2px' }}>
        {/* High-end label (left) */}
        <Text sx={{
          position: 'absolute', left: 0,
          fontFamily: 'mono', fontSize: 1, color: 'muted', lineHeight: 1,
        }}>
          {showHighGT ? '>' : ''}{formatValue(dataMax, '')}
        </Text>

        {/* Zero crossover label — only when diverging and zero falls well inside range */}
        {zeroCrossoverPct !== null && zeroCrossoverPct > 8 && zeroCrossoverPct < 92 && (
          <Text sx={{
            position: 'absolute',
            left: `${zeroCrossoverPct}%`,
            transform: 'translateX(-50%)',
            fontFamily: 'mono', fontSize: 1, color: 'muted', lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            {formatValue(zero ?? 0, '')}
          </Text>
        )}

        {/* Low-end label (right) */}
        <Text sx={{
          position: 'absolute', right: 0,
          fontFamily: 'mono', fontSize: 1, color: 'muted', lineHeight: 1,
        }}>
          {showLowLT ? '<' : ''}{formatValue(dataMin, '')}
        </Text>
      </Box>

      {/* Filter status */}
      {filterActive && low > 0 && (
        <Text sx={{ fontFamily: 'body', fontSize: 1, color: 'muted', mt: 1 }}>
          Showing top {100 - low}%
        </Text>
      )}
    </Box>
  )
}
