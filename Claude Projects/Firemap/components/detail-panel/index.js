/**
 * components/detail-panel/index.js
 * Overlay panel showing all variable values for a clicked grid cell.
 *
 * Props:
 *   config:   ProjectConfig
 *   cell:     CellData | null
 *   state:    AppState
 *   dispatch: Dispatch
 */

/** @jsxImportSource theme-ui */
import { Box, Text, Button } from 'theme-ui'
import { Actions } from '../../contracts/events.js'
import { formatValue, formatCoord } from '../../lib/format.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { BenefitCostChart } from './bar-chart.js'

export function DetailPanel({ config, cell, state, dispatch }) {
  if (!cell) return null

  const activeVariable = getActiveVariable(
    config,
    state.activeLayer,
    state.activeDimensions
  )

  const displayVariables = config.variables.filter(
    (v) => v.type !== 'categorical'
  )

  return (
    <Box
      sx={{
        variant: 'cards.panel',
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: '100%',
        maxWidth: 300,
        zIndex: 10,
        // Mobile: full-width bottom sheet
        '@media (max-width: 768px)': {
          bottom: 0,
          right: 0,
          left: 0,
          maxWidth: '100%',
          borderRadius: '8px 8px 0 0',
        },
      }}
    >
      {/* Header row: coordinates + close button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 3,
        }}
      >
        <Text
          sx={{
            variant: 'text.mono',
            color: 'muted',
            fontSize: 0,
            lineHeight: 'mono',
          }}
        >
          {formatCoord(cell.lat, cell.lng)}
        </Text>
        <Button
          variant='icon'
          onClick={() => dispatch({ type: Actions.DESELECT_CELL })}
          aria-label='Close detail panel'
          sx={{ ml: 2, flexShrink: 0 }}
        >
          ×
        </Button>
      </Box>

      {/* Variable rows */}
      <Box sx={{ mb: 3 }}>
        {displayVariables.map((variable) => {
          const isActive = activeVariable && activeVariable.id === variable.id
          const rawValue = cell.values[variable.id]

          return (
            <Box
              key={variable.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                py: 1,
                px: 1,
                borderRadius: 'sm',
                bg: isActive ? 'rgba(91, 138, 78, 0.12)' : 'transparent',
                borderLeft: isActive ? '2px solid #5B8A4E' : '2px solid transparent',
              }}
            >
              <Text
                sx={{
                  variant: 'text.label',
                  color: isActive ? 'text' : 'muted',
                  fontSize: 0,
                  mr: 2,
                  flexShrink: 0,
                }}
              >
                {variable.label}
              </Text>
              <Text
                sx={{
                  variant: 'text.mono',
                  color: isActive ? 'text' : 'muted',
                  fontSize: 0,
                  textAlign: 'right',
                }}
              >
                {formatValue(rawValue, variable.unit)}
              </Text>
            </Box>
          )
        })}
      </Box>

      {/* Benefit vs cost chart */}
      <BenefitCostChart cell={cell} config={config} />
    </Box>
  )
}
