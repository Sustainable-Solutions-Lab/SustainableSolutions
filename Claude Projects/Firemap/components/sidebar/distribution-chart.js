/**
 * components/sidebar/distribution-chart.js
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
const CHART_H = 72

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

export function DistributionChart({ variable, allValues, percentileRange, dispatch }) {
  const [filterActive, setFilterActive] = useState(false)
  const svgRef = useRef(null)
  const isDragging = useRef(false)

  const isCategorical = variable?.type === 'categorical'

  // Build a color scale using the actual data range so colors are vivid,
  // not washed out by a domain that is wider than the real data.
  const scale = useMemo(() => {
    if (!variable || isCategorical) return null
    // Compute dynamic domain from the actual values
    const sorted_ = allValues?.length ? [...allValues].sort((a, b) => a - b) : []
    if (sorted_.length < 2) return buildColorScale(variable)
    let dynDomain
    if (variable.diverging) {
      const maxAbs = Math.max(...sorted_.map(v => Math.abs(v)))
      dynDomain = { min: -maxAbs, max: maxAbs, zero: variable.domain?.zero ?? 0 }
    } else {
      dynDomain = { min: sorted_[0], max: sorted_[sorted_.length - 1] }
    }
    return buildColorScale({ ...variable, domain: dynDomain })
  }, [variable, allValues, isCategorical])

  // Sort all values descending (highest value = leftmost bar)
  const sorted = useMemo(
    () => (allValues?.length ? [...allValues].sort((a, b) => b - a) : []),
    [allValues]
  )

  // Actual data range — used for bar height scaling so bars fill the chart
  const dataMax = sorted.length ? sorted[0] : 1
  const dataMin = sorted.length ? sorted[sorted.length - 1] : 0
  const dataRange = Math.max(dataMax - dataMin, 1)

  // Domain range for zero-line placement (diverging only)
  const { zero } = variable?.domain ?? {}

  // Sample CHART_W values evenly from sorted array (one per visual column)
  const bars = useMemo(() => {
    if (!sorted.length || !scale) return []
    return Array.from({ length: CHART_W }, (_, i) => {
      const idx = Math.floor((i / CHART_W) * sorted.length)
      return sorted[idx] ?? dataMin
    })
  }, [sorted, scale, dataMin])

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
    } else {
      dispatch({ type: Actions.SET_PERCENTILE, low: 90, high: 100 })
    }
    setFilterActive((f) => !f)
  }

  if (!variable || isCategorical || !sorted.length) return null

  return (
    <Box sx={{ mb: 3 }}>
      {/* Chart with filter icon overlay */}
      <Box sx={{ position: 'relative' }}>
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
          <SlidersIcon active={filterActive} size={16} />
        </Box>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio='none'
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
            return (
              <rect
                key={i}
                x={i} y={y}
                width={1} height={Math.max(0.5, h)}
                fill={scale(value)}
                opacity={0.9}
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
                stroke='rgba(30,30,30,0.85)'
                strokeWidth={1.5}
              />
              <circle
                cx={filterLineX} cy={8}
                r={5}
                fill='rgba(240,240,240,0.95)'
                stroke='rgba(30,30,30,0.6)'
                strokeWidth={1}
              />
            </g>
          )}
        </svg>
      </Box>

      {/* Value axis labels — show actual data range */}
      <Flex sx={{ justifyContent: 'space-between', mt: '3px' }}>
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          {formatValue(dataMax, variable.unit ?? '')}
        </Text>
        {showZeroLine && (
          <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
            {formatValue(zero, variable.unit ?? '')}
          </Text>
        )}
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          {formatValue(dataMin, variable.unit ?? '')}
        </Text>
      </Flex>

      {/* Filter status */}
      {filterActive && low > 0 && (
        <Text sx={{ fontFamily: 'body', fontSize: 0, color: 'muted', mt: 1 }}>
          Showing top {100 - low}%
        </Text>
      )}
    </Box>
  )
}
