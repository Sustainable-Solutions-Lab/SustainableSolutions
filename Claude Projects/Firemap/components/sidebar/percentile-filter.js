/**
 * components/sidebar/percentile-filter.js
 *
 * Simple one-sided percentile filter:
 *   - Radio: "Top" | "Bottom"
 *   - Number input: 1–100 (the X in "Top/Bottom X%")
 *   - Dispatches SET_PERCENTILE with the appropriate { low, high }
 *   - Shows filtered cell count, mean, and median
 *
 * "Top 10%" → { low: 90, high: 100 }  (cells with highest values)
 * "Bottom 10%" → { low: 0, high: 10 } (cells with lowest values)
 * "Top/Bottom 100%" → { low: 0, high: 100 } (no filter, show all)
 */

import { useState } from 'react'
import { Box, Flex, Text } from 'theme-ui'
import { Actions } from '../../contracts/events.js'
import { formatValue } from '../../lib/format.js'

export function PercentileFilter({
  variable,
  percentileRange,
  featureCount,
  filteredCount,
  filteredMean,
  filteredMedian,
  dispatch,
}) {
  // Derive current UI state from percentileRange
  // If low === 0 and high === 100 → no filter (show all, display as 100%)
  const isTop = percentileRange.low > 0 || percentileRange.high === 100
  const currentPct = isTop
    ? 100 - percentileRange.low
    : percentileRange.high

  const [direction, setDirection] = useState(
    percentileRange.low > 0 ? 'top' : 'bottom'
  )
  const [pctValue, setPctValue] = useState(
    percentileRange.low === 0 && percentileRange.high === 100
      ? 100
      : currentPct
  )

  const unit = variable?.unit || ''

  function apply(newDirection, newPct) {
    const n = Math.max(1, Math.min(100, newPct))
    let low, high
    if (n >= 100) {
      low = 0; high = 100  // show all
    } else if (newDirection === 'top') {
      low = 100 - n; high = 100
    } else {
      low = 0; high = n
    }
    dispatch({ type: Actions.SET_PERCENTILE, low, high })
  }

  function handleDirectionChange(newDir) {
    setDirection(newDir)
    apply(newDir, pctValue)
  }

  function handlePctChange(e) {
    const val = +e.target.value
    setPctValue(val)
    apply(direction, val)
  }

  const noFilter = percentileRange.low === 0 && percentileRange.high === 100
  const pctFiltered =
    featureCount > 0 && filteredCount != null
      ? ((filteredCount / featureCount) * 100).toFixed(0)
      : null
  const meanDisplay = filteredMean != null ? formatValue(filteredMean, unit) : '—'
  const medianDisplay = filteredMedian != null ? formatValue(filteredMedian, unit) : '—'

  return (
    <Box sx={{ mb: 3 }}>
      {/* Header */}
      <Text
        sx={{
          fontFamily: 'body',
          fontSize: 0,
          fontWeight: 'bold',
          letterSpacing: 'caps',
          textTransform: 'uppercase',
          color: 'muted',
          mb: 2,
          display: 'block',
        }}
      >
        Filter{variable ? ` — ${variable.label}` : ''}
      </Text>

      {/* Controls row: radio + number input */}
      <Flex sx={{ alignItems: 'center', gap: 2, mb: 2 }}>
        {/* Top / Bottom radio */}
        <Flex sx={{ gap: 2, alignItems: 'center' }}>
          {['top', 'bottom'].map((dir) => (
            <label
              key={dir}
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              <input
                type='radio'
                name='pct-direction'
                value={dir}
                checked={direction === dir}
                onChange={() => handleDirectionChange(dir)}
                style={{ accentColor: 'var(--theme-ui-colors-primary)', cursor: 'pointer' }}
              />
              <Text
                sx={{
                  fontFamily: 'body',
                  fontSize: 0,
                  color: direction === dir ? 'text' : 'muted',
                }}
              >
                {dir.charAt(0).toUpperCase() + dir.slice(1)}
              </Text>
            </label>
          ))}
        </Flex>

        {/* Numeric input */}
        <Flex sx={{ alignItems: 'center', gap: 1 }}>
          <Box
            as='input'
            type='number'
            min={1}
            max={100}
            value={pctValue}
            onChange={handlePctChange}
            sx={{
              width: '52px',
              bg: 'transparent',
              border: 'none',
              borderBottom: '1px solid',
              borderColor: 'border',
              borderRadius: 0,
              color: 'text',
              fontFamily: 'mono',
              fontSize: 1,
              textAlign: 'right',
              px: 1,
              py: '2px',
              outline: 'none',
              '&:focus': { borderColor: 'primary' },
              // Hide number input spin arrows
              '&::-webkit-inner-spin-button, &::-webkit-outer-spin-button': {
                WebkitAppearance: 'none',
                margin: 0,
              },
              MozAppearance: 'textfield',
            }}
          />
          <Text sx={{ fontFamily: 'body', fontSize: 0, color: 'muted' }}>%</Text>
        </Flex>
      </Flex>

      {/* Stats */}
      <Box>
        <Text
          sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted', display: 'block', mb: 1 }}
        >
          {noFilter
            ? 'All cells shown'
            : filteredCount != null
            ? `${filteredCount.toLocaleString()} cells${pctFiltered != null ? ` (${pctFiltered}%)` : ''}`
            : '—'}
        </Text>
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          Mean: {meanDisplay} · Median: {medianDisplay}
        </Text>
      </Box>
    </Box>
  )
}
