/**
 * components/sidebar/index.jsx
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

import { useState } from 'react'
import { Box, Text } from 'theme-ui'
import { Actions } from '../../contracts/events.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { LayerTabs } from './layer-tabs.jsx'
import { DimensionControl } from './dimension-control.jsx'
import { Legend } from './legend.jsx'
import { DistributionChart } from './distribution-chart.jsx'

export function Sidebar({
  config,
  state,
  dispatch,
  allValues = [],
}) {
  const [aboutOpen, setAboutOpen] = useState(false)
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
        bg: 'background',
        borderRight: '1px solid',
        borderColor: 'border',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header — back link only (wordmark moved to footer) */}
      <Box sx={{ px: 3, pt: 3, pb: 3, flexShrink: 0 }}>
        <a
          href='/'
          className='bare'
          style={{
            display: 'inline-block',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          ← Sustainable Solutions Lab
        </a>
      </Box>

      {/* Scrollable content */}
      <Box sx={{ flex: 1, px: 3, pt: 1, pb: 2, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Project title */}
        <Text
          sx={{
            fontFamily: 'serif',
            fontSize: '22px',
            fontWeight: '600',
            color: 'text',
            lineHeight: 'heading',
            display: 'block',
            mb: 1,
          }}
        >
          {config.title}
        </Text>
        {/* About toggle */}
        <Box
          as='button'
          onClick={() => setAboutOpen((o) => !o)}
          sx={{
            display: 'block',
            width: '100%',
            mb: aboutOpen ? 2 : 3,
            fontFamily: 'body',
            fontSize: 1,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            cursor: 'pointer',
            py: 0,
            px: 0,
            border: 'none',
            bg: 'transparent',
            textAlign: 'left',
            color: aboutOpen ? 'text' : 'muted',
            transition: 'color 0.1s',
            '&:hover': { color: 'text' },
          }}
        >
          About
        </Box>
        {aboutOpen && (
          <Box
            dangerouslySetInnerHTML={{ __html: config.description }}
            sx={{
              fontFamily: 'body',
              fontSize: 0,
              color: 'text',
              lineHeight: 'body',
              mb: 3,
              'a': { color: 'text', textDecoration: 'underline', '&:hover': { opacity: 0.75 } },
            }}
          />
        )}

        {/* MAP section header */}
        <Text
          sx={{
            fontFamily: 'body',
            fontSize: 1,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            color: 'text',
            display: 'block',
            mb: 2,
          }}
        >
          Map
        </Text>

        {/* Layer tabs */}
        <LayerTabs config={config} state={state} dispatch={dispatch} />

        {/* Dimension controls */}
        {visibleDimensions.map((dim) => {
          const filteredDim = {
            ...dim,
            options: dim.options?.filter(
              (opt) => !opt.visibleForLayers || opt.visibleForLayers.includes(state.activeLayer)
            ),
          }
          return (
            <DimensionControl
              key={dim.id}
              dimension={filteredDim}
              value={state.activeDimensions[dim.id] ?? dim.defaultValue}
              dispatch={dispatch}
            />
          )
        })}

        {/* Distribution chart — above colorbar */}
        {config.percentileFilter?.enabled && (
          <DistributionChart
            variable={activeVariable}
            allValues={allValues}
            percentileRange={state.percentileRange}
            dispatch={dispatch}
            isDark={state.colorScheme === 'dark'}
          />
        )}

        {/* Legend / colorbar */}
        <Legend variable={activeVariable} allValues={allValues} isDark={state.colorScheme === 'dark'} />

        {/* Regional Data toggle */}
        {config.areaTool?.enabled && (
          <Box
            as='button'
            onClick={() => {
              if (state.methodsOpen) dispatch({ type: Actions.TOGGLE_METHODS })
              dispatch({ type: Actions.TOGGLE_AREA_TOOL })
            }}
            sx={{
              display: 'block',
              width: '100%',
              mb: 1,
              mt: 2,
              fontFamily: 'body',
              fontSize: 1,
              fontWeight: 'bold',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              cursor: 'pointer',
              py: 1,
              px: 0,
              border: 'none',
              bg: 'transparent',
              textAlign: 'left',
              color: state.areaToolActive ? 'text' : 'muted',
              transition: 'color 0.1s',
              '&:hover': { color: 'text' },
            }}
          >
            Regional Data
          </Box>
        )}

        {/* Read Methods */}
        <Box
          as='button'
          onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
          sx={{
            display: 'block',
            width: '100%',
            mt: 1,
            fontFamily: 'body',
            fontSize: 1,
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
          Read Methods
        </Box>
      </Box>

      {/* Footer — SDSS wordmark, pinned to the bottom of the sidebar */}
      <Box
        sx={{
          flexShrink: 0,
          px: 3,
          py: 3,
          borderTop: '1px solid',
          borderColor: 'border',
        }}
      >
        <a
          href='/'
          className='bare'
          style={{ lineHeight: 0, display: 'inline-block' }}
        >
          <img
            src={state.colorScheme === 'dark' ? '/SDSS_brand_white.png' : '/SDSS_brand.png'}
            alt='Stanford Doerr School of Sustainability'
            style={{ width: '100%', maxWidth: 200, height: 'auto', objectFit: 'contain' }}
          />
        </a>
      </Box>

    </Box>
  )
}
