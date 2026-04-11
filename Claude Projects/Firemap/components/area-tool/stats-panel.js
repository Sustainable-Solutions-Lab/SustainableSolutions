/**
 * components/area-tool/stats-panel.js
 *
 * Stats display card shown after the user draws a circle on the map.
 * Shows circle info (center, radius, cell count) and aggregate stats
 * (mean + median) for each variable listed in config.areaTool.aggregateVariableIds.
 *
 * Props:
 *   config:          ProjectConfig
 *   drawnCircle:     DrawnCircle | null
 *   aggregateStats:  AggregateStats | null
 *   dispatch:        Dispatch
 */

import { Box, Text, Button } from 'theme-ui'
import { Actions } from '../../contracts/events.js'
import { formatValue, formatCoord } from '../../lib/format.js'

export function StatsPanel({ config, drawnCircle, aggregateStats, areaToolActive, dispatch }) {
  if (!drawnCircle) return null

  function handleClose() {
    // Deactivate the tool first (removes circle from map), then clear stats
    if (areaToolActive) dispatch({ type: Actions.TOGGLE_AREA_TOOL })
    dispatch({ type: Actions.SET_DRAWN_CIRCLE, circle: null })
    dispatch({ type: Actions.SET_AGGREGATE_STATS, stats: null })
  }

  const stats = aggregateStats?.stats ?? {}
  const count = aggregateStats?.count ?? 0

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 24,
        left: 24,
        bg: 'surface',
        border: '1px solid',
        borderColor: 'border',
        borderRadius: 'md',
        p: 3,
        minWidth: 220,
        maxWidth: 280,
        zIndex: 10,
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Text
          variant='label'
          sx={{ fontSize: 0, fontWeight: 'bold', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'muted' }}
        >
          Regional Data
        </Text>
        <Button
          variant='icon'
          onClick={handleClose}
          aria-label='Close area stats'
          sx={{ width: 24, height: 24, p: 0, fontSize: 1, lineHeight: 1 }}
        >
          ×
        </Button>
      </Box>

      {/* Circle info */}
      <Box sx={{ mb: 3 }}>
        <Text sx={{ fontSize: 1, color: 'text', display: 'block' }}>
          {formatCoord(drawnCircle.lat, drawnCircle.lng)}
        </Text>
        <Text sx={{ fontSize: 1, color: 'muted', display: 'block' }}>
          {drawnCircle.radiusKm.toFixed(1)} km radius &middot; {count} cells
        </Text>
      </Box>

      {/* Per-variable stats rows */}
      {config.areaTool.aggregateVariableIds.map((varId) => {
        const variable = config.variables.find((v) => v.id === varId)
        if (!variable) return null

        const varStats = stats[varId]
        const unit = variable.unit ?? ''

        return (
          <Box
            key={varId}
            sx={{
              mb: 2,
              pb: 2,
              borderBottom: '1px solid',
              borderColor: 'border',
              '&:last-child': { mb: 0, pb: 0, borderBottom: 'none' },
            }}
          >
            <Text
              sx={{
                fontSize: 0,
                fontWeight: 'bold',
                color: 'muted',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
                mb: 1,
              }}
            >
              {variable.label}
            </Text>
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Box>
                <Text sx={{ fontSize: 0, color: 'muted', display: 'block' }}>Mean</Text>
                <Text variant='mono' sx={{ color: 'text' }}>
                  {varStats ? formatValue(varStats.mean, unit) : '—'}
                </Text>
              </Box>
              <Box>
                <Text sx={{ fontSize: 0, color: 'muted', display: 'block' }}>Median</Text>
                <Text variant='mono' sx={{ color: 'text' }}>
                  {varStats ? formatValue(varStats.median, unit) : '—'}
                </Text>
              </Box>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
