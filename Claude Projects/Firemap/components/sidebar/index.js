/**
 * components/sidebar/index.js
 *
 * Left sidebar: project title, layer tabs, dimension controls,
 * legend, percentile filter, area tool toggle, methods link, and lab logo.
 *
 * Props:
 *   config          - ProjectConfig
 *   state           - AppState
 *   dispatch        - Dispatch
 *   filteredCount   - number | null  (computed by pages/index.js)
 *   filteredMean    - number | null
 *   filteredMedian  - number | null
 */

import { Box, Flex, Text, Button } from 'theme-ui'
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
  // Resolve the active variable for legend + percentile filter
  const activeVariable = getActiveVariable(
    config,
    state.activeLayer,
    state.activeDimensions
  )

  // Find the active layer definition to know which dimensions to show
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const activeDimensionIds = activeLayerConfig?.dimensionIds ?? []

  // Get only the dimensions relevant to this layer
  const visibleDimensions = config.dimensions.filter((d) =>
    activeDimensionIds.includes(d.id)
  )

  // Estimate total feature count from the config (placeholder — pages/index.js may pass this)
  const featureCount = config._featureCount ?? 0

  return (
    <Box
      sx={{
        position: 'relative',
        minWidth: 280,
        maxWidth: 280,
        height: '100vh',
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
      {/* Scrollable content area */}
      <Box sx={{ flex: 1, p: 3 }}>
        {/* 1. Project title + description */}
        <Box sx={{ mb: 3 }}>
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
            }}
          >
            {config.description}
          </Text>
        </Box>

        {/* 2. Layer tabs */}
        <LayerTabs config={config} state={state} dispatch={dispatch} />

        {/* Layer description */}
        {activeLayerConfig?.description && (
          <Text
            sx={{
              fontFamily: 'body',
              fontSize: 0,
              color: 'muted',
              mb: 3,
              display: 'block',
            }}
          >
            {activeLayerConfig.description}
          </Text>
        )}

        {/* 3. Dimension controls — only for the active layer */}
        {visibleDimensions.map((dim) => (
          <DimensionControl
            key={dim.id}
            dimension={dim}
            value={state.activeDimensions[dim.id] ?? dim.defaultValue}
            dispatch={dispatch}
          />
        ))}

        {/* Divider */}
        <Box sx={{ borderTop: '1px solid', borderColor: 'border', my: 3 }} />

        {/* 4. Legend */}
        <Legend variable={activeVariable} />

        {/* 5. Percentile filter */}
        {config.percentileFilter?.enabled && (
          <PercentileFilter
            variable={activeVariable}
            percentileRange={state.percentileRange}
            featureCount={featureCount}
            filteredCount={filteredCount}
            filteredMean={filteredMean}
            filteredMedian={filteredMedian}
            dispatch={dispatch}
          />
        )}

        {/* Divider */}
        <Box sx={{ borderTop: '1px solid', borderColor: 'border', my: 3 }} />

        {/* 6. Area tool toggle */}
        {config.areaTool?.enabled && (
          <Button
            onClick={() => dispatch({ type: Actions.TOGGLE_AREA_TOOL })}
            sx={{
              width: '100%',
              mb: 2,
              fontFamily: 'body',
              fontSize: 0,
              fontWeight: 'bold',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              cursor: 'pointer',
              py: 2,
              px: 3,
              borderRadius: 'sm',
              border: '1px solid',
              bg: state.areaToolActive ? 'primary' : 'transparent',
              borderColor: state.areaToolActive ? 'primary' : 'border',
              color: state.areaToolActive ? '#fff' : 'muted',
              transition: 'all 0.15s ease',
              '&:hover': {
                borderColor: 'primary',
                color: state.areaToolActive ? '#fff' : 'primary',
              },
            }}
          >
            {state.areaToolActive ? 'Exit Area Tool' : 'Area Tool'}
          </Button>
        )}

        {/* 7. Methods link */}
        <Button
          onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
          sx={{
            width: '100%',
            fontFamily: 'body',
            fontSize: 0,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            cursor: 'pointer',
            py: 2,
            px: 3,
            borderRadius: 'sm',
            border: '1px solid',
            bg: 'transparent',
            borderColor: 'border',
            color: 'muted',
            transition: 'all 0.15s ease',
            '&:hover': {
              borderColor: 'muted',
              color: 'text',
            },
          }}
        >
          Methods
        </Button>
      </Box>

      {/* Lab logo — pinned to the bottom */}
      <Flex
        sx={{
          justifyContent: 'center',
          alignItems: 'center',
          py: 3,
          borderTop: '1px solid',
          borderColor: 'border',
        }}
      >
        <a
          href='https://sustainablesolutions.stanford.edu'
          target='_blank'
          rel='noopener noreferrer'
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <img
            src={
              state.colorScheme === 'dark'
                ? '/LabLogo_light.png'
                : '/LabLogo_border.png'
            }
            alt='Sustainable Solutions Lab'
            style={{ width: 40, height: 40, marginBottom: 8 }}
          />
        </a>
      </Flex>
    </Box>
  )
}
