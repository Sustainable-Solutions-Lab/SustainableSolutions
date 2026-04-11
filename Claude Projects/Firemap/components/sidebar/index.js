/**
 * components/sidebar/index.js
 *
 * Left sidebar: project title, layer tabs, dimension controls,
 * legend, percentile filter, area tool toggle, methods link, lab logo.
 *
 * Props:
 *   config          - ProjectConfig
 *   state           - AppState
 *   dispatch        - Dispatch
 *   filteredCount   - number | null
 *   filteredMean    - number | null
 *   filteredMedian  - number | null
 */

import { Box, Flex, Text } from 'theme-ui'
import { Actions } from '../../contracts/events.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { LayerTabs } from './layer-tabs.js'
import { DimensionControl } from './dimension-control.js'
import { Legend } from './legend.js'
import { PercentileFilter } from './percentile-filter.js'

export function Sidebar({
  config,
  state,
  dispatch,
  filteredCount = null,
  filteredMean = null,
  filteredMedian = null,
}) {
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const activeDimensionIds = activeLayerConfig?.dimensionIds ?? []
  const visibleDimensions = config.dimensions.filter((d) =>
    activeDimensionIds.includes(d.id)
  )

  return (
    <Box
      sx={{
        position: 'relative',
        width: 280,
        minWidth: 280,
        height: '100%',
        bg: 'surface',
        borderRight: '1px solid',
        borderColor: 'border',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Scrollable content */}
      <Box sx={{ flex: 1, px: 3, pt: 3, pb: 2 }}>
        {/* Project title */}
        <Text
          sx={{
            fontFamily: 'body',
            fontSize: 2,
            fontWeight: 'bold',
            color: 'text',
            lineHeight: 'heading',
            display: 'block',
            mb: 1,
          }}
        >
          {config.title}
        </Text>
        <Text
          sx={{
            fontFamily: 'body',
            fontSize: 0,
            color: 'muted',
            lineHeight: 'body',
            display: 'block',
            mb: 3,
          }}
        >
          {config.description}
        </Text>

        {/* Layer tabs */}
        <LayerTabs config={config} state={state} dispatch={dispatch} />

        {/* Dimension controls */}
        {visibleDimensions.map((dim) => (
          <DimensionControl
            key={dim.id}
            dimension={dim}
            value={state.activeDimensions[dim.id] ?? dim.defaultValue}
            dispatch={dispatch}
          />
        ))}

        {/* Legend */}
        <Legend variable={activeVariable} />

        {/* Percentile filter */}
        {config.percentileFilter?.enabled && (
          <PercentileFilter
            variable={activeVariable}
            percentileRange={state.percentileRange}
            featureCount={config._featureCount ?? 0}
            filteredCount={filteredCount}
            filteredMean={filteredMean}
            filteredMedian={filteredMedian}
            dispatch={dispatch}
          />
        )}

        {/* Area tool toggle */}
        {config.areaTool?.enabled && (
          <Box
            as='button'
            onClick={() => dispatch({ type: Actions.TOGGLE_AREA_TOOL })}
            sx={{
              display: 'block',
              width: '100%',
              mb: 1,
              mt: 2,
              fontFamily: 'body',
              fontSize: 0,
              fontWeight: 'bold',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              cursor: 'pointer',
              py: 1,
              px: 0,
              border: 'none',
              bg: 'transparent',
              textAlign: 'left',
              color: state.areaToolActive ? 'primary' : 'muted',
              transition: 'color 0.1s',
              '&:hover': { color: state.areaToolActive ? 'primary' : 'text' },
            }}
          >
            {state.areaToolActive ? '× Exit Area Tool' : 'Area Tool'}
          </Box>
        )}

        {/* Methods */}
        <Box
          as='button'
          onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
          sx={{
            display: 'block',
            width: '100%',
            mt: 1,
            fontFamily: 'body',
            fontSize: 0,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            cursor: 'pointer',
            py: 1,
            px: 0,
            border: 'none',
            bg: 'transparent',
            textAlign: 'left',
            color: 'muted',
            transition: 'color 0.1s',
            '&:hover': { color: 'text' },
          }}
        >
          Methods
        </Box>
      </Box>

      {/* Lab symbol — bottom of sidebar */}
      <Flex
        sx={{
          justifyContent: 'center',
          alignItems: 'center',
          py: 3,
        }}
      >
        <a
          href='https://sustainablesolutions.stanford.edu'
          target='_blank'
          rel='noopener noreferrer'
          style={{ lineHeight: 0 }}
        >
          <img
            src={state.colorScheme === 'dark' ? '/LabLogo_light.png' : '/LabLogo_border.png'}
            alt='Sustainable Solutions Lab'
            style={{ width: 36, height: 36, objectFit: 'contain' }}
          />
        </a>
      </Flex>
    </Box>
  )
}
