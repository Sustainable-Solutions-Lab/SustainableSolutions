/**
 * components/sidebar/percentile-filter.jsx
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

  const noFilter = percentileRange.low === 0 && percentileRange.high === 100

  // 'all' | 'top' | 'bottom'
  const [mode, setMode] = useState(noFilter ? 'all' : percentileRange.low > 0 ? 'top' : 'bottom')
  const [pctValue, setPctValue] = useState(noFilter ? 10 : currentPct)

  const unit = variable?.unit || ''

  function apply(newMode, newPct) {
    if (newMode === 'all') {
      dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
      return
    }
    const n = Math.max(1, Math.min(99, newPct))
    const low = newMode === 'top' ? 100 - n : 0
    const high = newMode === 'top' ? 100 : n
    dispatch({ type: Actions.SET_PERCENTILE, low, high })
  }

  function handleModeChange(newMode) {
    setMode(newMode)
    apply(newMode, pctValue)
  }

  function handlePctChange(e) {
    const val = +e.target.value
    setPctValue(val)
    apply(mode, val)
  }
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

      {/* Controls row: All / Top / Bottom radio + number input */}
      <Flex sx={{ alignItems: 'center', gap: 3, mb: 2, flexWrap: 'wrap' }}>
        {/* Mode radios */}
        <Flex sx={{ gap: 3, alignItems: 'center' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'top', label: 'Top' },
            { id: 'bottom', label: 'Bottom' },
          ].map(({ id, label }) => (
            <label
              key={id}
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              <input
                type='radio'
                name='pct-mode'
                value={id}
                checked={mode === id}
                onChange={() => handleModeChange(id)}
                style={{ accentColor: 'var(--theme-ui-colors-primary)', cursor: 'pointer' }}
              />
              <Text sx={{ fontFamily: 'body', fontSize: 0, color: mode === id ? 'text' : 'muted' }}>
                {label}
              </Text>
            </label>
          ))}
        </Flex>

        {/* Numeric input — hidden when mode is 'all' */}
        {mode !== 'all' && (
          <Flex sx={{ alignItems: 'center', gap: 1 }}>
            <Box
              as='input'
              type='number'
              min={1}
              max={99}
              value={pctValue}
              onChange={handlePctChange}
              sx={{
                width: '44px',
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
                '&::-webkit-inner-spin-button, &::-webkit-outer-spin-button': {
                  WebkitAppearance: 'none',
                  margin: 0,
                },
                MozAppearance: 'textfield',
              }}
            />
            <Text sx={{ fontFamily: 'body', fontSize: 0, color: 'muted' }}>%</Text>
          </Flex>
        )}
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
