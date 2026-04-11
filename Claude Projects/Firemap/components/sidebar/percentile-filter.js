/**
 * components/sidebar/percentile-filter.js
 *
 * Dual-handle range slider for percentile filtering.
 * Shows filtered count, mean, and median below the slider.
 */

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
  const { low, high } = percentileRange

  // Z-index logic: when both handles are at max, lower thumb needs to be on top
  const lowerZ = low > 50 ? 5 : 4
  const upperZ = high < 50 ? 5 : 4

  // Track gradient: grey outside selection, primary inside
  const trackGradient = `linear-gradient(
    to right,
    var(--theme-ui-colors-border) 0%,
    var(--theme-ui-colors-border) ${low}%,
    var(--theme-ui-colors-primary) ${low}%,
    var(--theme-ui-colors-primary) ${high}%,
    var(--theme-ui-colors-border) ${high}%,
    var(--theme-ui-colors-border) 100%
  )`

  const unit = variable?.unit || ''
  const pctFiltered =
    featureCount > 0 && filteredCount != null
      ? ((filteredCount / featureCount) * 100).toFixed(0)
      : null

  const meanDisplay =
    filteredMean != null ? formatValue(filteredMean, unit) : '—'
  const medianDisplay =
    filteredMedian != null ? formatValue(filteredMedian, unit) : '—'

  const rangeInputStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 20,
    WebkitAppearance: 'none',
    appearance: 'none',
    background: 'transparent',
    pointerEvents: 'none',
    margin: 0,
    padding: 0,
  }

  return (
    <Box sx={{ mb: 3 }}>
      {/* Section header */}
      <Flex sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 2 }}>
        <Text
          sx={{
            fontFamily: 'body',
            fontSize: 0,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            color: 'muted',
          }}
        >
          Filter
        </Text>
        {variable && (
          <Text sx={{ fontFamily: 'body', fontSize: 0, color: 'muted' }}>
            {variable.label}
          </Text>
        )}
      </Flex>

      {/* Percentile labels */}
      <Flex sx={{ justifyContent: 'space-between', mb: 1 }}>
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          Bottom {low}%
        </Text>
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          Top {100 - high}%
        </Text>
      </Flex>

      {/* Dual-handle range slider */}
      <Box
        sx={{
          position: 'relative',
          height: 20,
          mb: 2,
          // Style the track via a pseudo-background on the wrapper
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 4,
            transform: 'translateY(-50%)',
            borderRadius: 'pill',
            background: trackGradient,
            pointerEvents: 'none',
          },
          // Range input thumb styling via global injection isn't possible in sx,
          // so we rely on the browser default thumb + accentColor
          'input[type="range"]': {
            ...rangeInputStyles,
            accentColor: 'var(--theme-ui-colors-primary)',
          },
          'input[type="range"]::-webkit-slider-thumb': {
            pointerEvents: 'all',
            cursor: 'pointer',
          },
          'input[type="range"]::-moz-range-thumb': {
            pointerEvents: 'all',
            cursor: 'pointer',
          },
        }}
      >
        {/* Lower thumb */}
        <input
          type='range'
          min={0}
          max={100}
          value={low}
          style={{
            ...rangeInputStyles,
            zIndex: lowerZ,
            // Only allow pointer events on the lower handle when high == 100,
            // otherwise upper handle takes priority in overlapping zone
            pointerEvents: high < 100 ? 'none' : 'auto',
          }}
          onChange={(e) =>
            dispatch({
              type: Actions.SET_PERCENTILE,
              low: Math.min(+e.target.value, high),
              high,
            })
          }
        />

        {/* Upper thumb */}
        <input
          type='range'
          min={0}
          max={100}
          value={high}
          style={{
            ...rangeInputStyles,
            zIndex: upperZ,
            pointerEvents: 'auto',
          }}
          onChange={(e) =>
            dispatch({
              type: Actions.SET_PERCENTILE,
              low,
              high: Math.max(+e.target.value, low),
            })
          }
        />
      </Box>

      {/* Stats */}
      <Box>
        {filteredCount != null && featureCount > 0 ? (
          <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted', mb: 1, display: 'block' }}>
            {filteredCount.toLocaleString()} cells
            {pctFiltered != null ? ` (${pctFiltered}%)` : ''}
          </Text>
        ) : (
          <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted', mb: 1, display: 'block' }}>
            — cells
          </Text>
        )}
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          Mean: {meanDisplay} · Median: {medianDisplay}
        </Text>
      </Box>
    </Box>
  )
}
