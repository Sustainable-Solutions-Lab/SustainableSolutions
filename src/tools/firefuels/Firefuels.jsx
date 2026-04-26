/** @jsxImportSource theme-ui */
import { useReducer, useState, useEffect } from 'react'
import { ThemeProvider, Box, Button, Flex, useColorMode } from 'theme-ui'
import 'maplibre-gl/dist/maplibre-gl.css'

import theme from './theme/index.js'
import { Actions, initialState } from './contracts/events.js'
import { projects } from './projects/index.js'
import { getActiveVariable } from './lib/get-active-variable.js'
import { Map } from './components/map/index.jsx'
import { Sidebar } from './components/sidebar/index.jsx'
import { MobileLegend } from './components/sidebar/legend.jsx'
import { LayerTabs } from './components/sidebar/layer-tabs.jsx'
import { DimensionControl } from './components/sidebar/dimension-control.jsx'
import { AreaTool } from './components/area-tool/index.jsx'
import { StatsPanel } from './components/area-tool/stats-panel.jsx'

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case Actions.SET_PROJECT:
      return { ...state, projectId: action.projectId }
    case Actions.SET_LAYER:
      return {
        ...state,
        activeLayer: action.layerId,
        ...(action.dimensionResets
          ? { activeDimensions: { ...state.activeDimensions, ...action.dimensionResets } }
          : {}),
      }
    case Actions.SET_DIMENSION:
      return {
        ...state,
        activeDimensions: {
          ...state.activeDimensions,
          [action.dimensionId]: action.value,
        },
      }
    case Actions.SELECT_CELL:
      return { ...state, selectedCell: action.cell }
    case Actions.DESELECT_CELL:
      return { ...state, selectedCell: null }
    case Actions.SET_DRAWN_CIRCLE:
      return { ...state, drawnCircle: action.circle }
    case Actions.SET_AGGREGATE_STATS:
      return { ...state, aggregateStats: action.stats }
    case Actions.SET_PERCENTILE:
      return { ...state, percentileRange: { low: action.low, high: action.high } }
    case Actions.TOGGLE_AREA_TOOL:
      return { ...state, areaToolActive: !state.areaToolActive }
    case Actions.TOGGLE_SCHEME:
      return {
        ...state,
        colorScheme: state.colorScheme === 'dark' ? 'light' : 'dark',
      }
    case Actions.TOGGLE_METHODS:
      // Methods MDX panel is stubbed in Phase 1 — wired in Phase 2.
      return { ...state, methodsOpen: false }
    default:
      return state
  }
}

// ── App body (inside ThemeProvider) ─────────────────────────────────────────

function FirefuelsApp() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [, setColorMode] = useColorMode()
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false)
  const [mapInstance, setMapInstance] = useState(null)
  const [filterStats, setFilterStats] = useState({ count: null, mean: null, median: null, totalCount: null, allValues: [] })
  const [statewideValues, setStatewideValues] = useState([])
  const [opacityP95, setOpacityP95] = useState(null)

  const config = projects[state.projectId]
  const isDark = state.colorScheme === 'dark'
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  // Fetch full statewide dataset once per variable for the distribution chart.
  useEffect(() => {
    if (!activeVariable || activeVariable.type === 'categorical') {
      setStatewideValues([])
      setOpacityP95(null)
      return
    }
    const varId = activeVariable.id
    const zero = activeVariable.domain?.zero ?? activeVariable.domain?.min ?? 0
    fetch('/fuel-treatment.geojson')
      .then(r => r.json())
      .then(data => {
        const vals = data.features
          .map(f => f.properties?.[varId])
          .filter(v => v != null && isFinite(v))
        setStatewideValues(vals)
        if (vals.length > 0) {
          const absDev = vals.map(v => Math.abs(v - zero)).sort((a, b) => a - b)
          const idx = Math.floor(0.95 * (absDev.length - 1))
          setOpacityP95(absDev[idx])
        }
      })
      .catch(() => {})
  }, [activeVariable?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleScheme() {
    const next = state.colorScheme === 'dark' ? 'light' : 'dark'
    setColorMode(next)
    dispatch({ type: Actions.TOGGLE_SCHEME })
  }

  // Mobile panel: show only treatment + climate dimensions for the active layer
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const mobileDimensions = config.dimensions.filter((d) =>
    (d.id === 'treatment' || d.id === 'climate') &&
    activeLayerConfig?.dimensionIds?.includes(d.id)
  )

  const wordmarkSrc = isDark ? '/SDSS_brand_white.png' : '/SDSS_brand.png'

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        bg: 'background',
      }}
    >
      {/* ── Mobile header bar ──────────────────────────────────────────── */}
      <Box
        sx={{
          display: ['flex', 'none'],
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 68,
          alignItems: 'center',
          px: 3,
          bg: 'background',
          borderBottom: '1px solid',
          borderColor: 'border',
          zIndex: 30,
        }}
      >
        <Flex sx={{ flexDirection: 'column', gap: '3px' }}>
          <Box
            as='a'
            href='/'
            sx={{
              fontFamily: 'mono',
              fontSize: '10px',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              color: 'muted',
              textDecoration: 'none',
              lineHeight: 1,
              mb: '2px',
              '&:hover': { color: 'text' },
            }}
          >
            ← Lab
          </Box>
          <a
            href='/'
            style={{ lineHeight: 0, display: 'inline-block' }}
          >
            <img
              src={wordmarkSrc}
              alt='Stanford Doerr School of Sustainability'
              style={{ height: 26, width: 'auto', objectFit: 'contain' }}
            />
          </a>
          <Box
            sx={{
              fontFamily: 'serif',
              fontSize: '19px',
              fontWeight: '600',
              color: 'text',
              lineHeight: 1,
            }}
          >
            {config.title}
          </Box>
        </Flex>

        <Box sx={{ flex: 1 }} />

        <Box
          as='button'
          onClick={() => setMobilePanelOpen((o) => !o)}
          aria-label={mobilePanelOpen ? 'Close controls' : 'Open controls'}
          aria-expanded={mobilePanelOpen}
          sx={{
            fontFamily: 'body',
            fontSize: 1,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            color: mobilePanelOpen ? 'text' : 'muted',
            bg: 'transparent',
            border: 'none',
            cursor: 'pointer',
            px: 2,
            py: 1,
          }}
        >
          {mobilePanelOpen ? '✕ Close' : '☰ Controls'}
        </Box>
      </Box>

      {/* Spacer for mobile fixed header */}
      <Box sx={{ display: ['block', 'none'], height: 68, flexShrink: 0 }} />

      {/* ── Content row: sidebar | map ──────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Sidebar — desktop only */}
        <Box sx={{ display: ['none', 'flex'], flexShrink: 0 }}>
          <Sidebar
            config={config}
            state={state}
            dispatch={dispatch}
            allValues={statewideValues}
          />
        </Box>

        {/* Map — fills remaining space */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <Map
            config={config}
            state={state}
            dispatch={dispatch}
            height='100%'
            onMapReady={(m) => setMapInstance(m)}
            onFilterStats={setFilterStats}
            onToggleScheme={handleToggleScheme}
            isDark={isDark}
            opacityP95={opacityP95}
          />

          {/* Mobile color bar */}
          <Box
            sx={{
              display: ['block', 'none'],
              position: 'absolute',
              bottom: 44,
              right: 10,
              zIndex: 10,
              width: 160,
              bg: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)',
              borderRadius: 4,
              px: '8px',
              py: '6px',
            }}
          >
            <MobileLegend
              variable={activeVariable}
              allValues={statewideValues}
              isDark={isDark}
            />
          </Box>

          {/* Lab symbol — clicks back to lab home */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 40,
              left: 16,
              zIndex: 10,
            }}
          >
            <a href='/' style={{ lineHeight: 0, display: 'block' }}>
              <img
                src={isDark ? '/LabLogo_light.png' : '/LabLogo_border.png'}
                alt='Back to Sustainable Solutions Lab'
                style={{ width: 36, height: 36, objectFit: 'contain' }}
              />
            </a>
          </Box>

          {/* Regional data stats panel — desktop only */}
          <Box sx={{ display: ['none', 'block'] }}>
            <StatsPanel
              drawnCircle={state.drawnCircle}
              aggregateStats={state.aggregateStats}
              areaToolActive={state.areaToolActive}
              activeVariable={activeVariable}
              isDark={isDark}
              dispatch={dispatch}
            />
          </Box>

          {/* Area tool — desktop only */}
          <Box sx={{ display: ['none', 'block'] }}>
            <AreaTool
              map={mapInstance}
              config={config}
              state={state}
              dispatch={dispatch}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Mobile controls panel ─────────────────────────────────────── */}
      <Box
        sx={{
          display: ['block', 'none'],
          position: 'fixed',
          top: 68,
          left: 0,
          right: 0,
          zIndex: 21,
          bg: 'background',
          borderBottom: '1px solid',
          borderColor: 'border',
          transform: mobilePanelOpen ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform 0.18s ease',
          maxHeight: 'calc(100vh - 68px)',
          overflowY: 'auto',
          px: 4,
          pt: 3,
          pb: 4,
        }}
      >
        <Box sx={{ mb: 3 }}>
          <Box
            as='button'
            onClick={() => setMobileAboutOpen((o) => !o)}
            sx={{
              display: 'block',
              width: '100%',
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
              color: mobileAboutOpen ? 'text' : 'muted',
              mb: mobileAboutOpen ? 2 : 0,
            }}
          >
            About
          </Box>
          {mobileAboutOpen && (
            <Box
              dangerouslySetInnerHTML={{ __html: config.description }}
              sx={{
                fontFamily: 'body',
                fontSize: 0,
                color: 'text',
                lineHeight: 'body',
                'a': { color: 'text', textDecoration: 'underline' },
                'strong': { fontWeight: 'bold' },
              }}
            />
          )}
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box
            sx={{
              fontFamily: 'body',
              fontSize: 1,
              fontWeight: 'bold',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              color: 'muted',
              mb: 2,
            }}
          >
            Map
          </Box>
          <LayerTabs
            config={config}
            state={state}
            dispatch={dispatch}
          />
        </Box>

        {mobileDimensions.map((dim) => {
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

        {config.percentileFilter?.enabled && activeVariable && activeVariable.type !== 'categorical' && (
          <Box sx={{ mt: 3 }}>
            <Flex sx={{ gap: 3 }}>
              {[{ label: 'Top 10%', value: 90 }, { label: 'Top 1%', value: 99 }].map(({ label, value }) => {
                const isActive = state.percentileRange.low === value
                return (
                  <Box
                    key={value}
                    as='button'
                    onClick={() => dispatch({
                      type: Actions.SET_PERCENTILE,
                      low: isActive ? 0 : value,
                      high: 100,
                    })}
                    sx={{
                      fontFamily: 'body',
                      fontSize: 0,
                      fontWeight: isActive ? 'bold' : 'normal',
                      letterSpacing: 'caps',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      py: '2px',
                      px: 0,
                      border: 'none',
                      bg: 'transparent',
                      color: isActive ? 'text' : 'muted',
                      textDecoration: isActive ? 'underline' : 'none',
                      textUnderlineOffset: '3px',
                    }}
                  >
                    {label}
                  </Box>
                )
              })}
            </Flex>
          </Box>
        )}
      </Box>

      {/* Scrim — grays out map while mobile panel is open */}
      <Box
        sx={{
          display: ['block', 'none'],
          position: 'fixed',
          top: 68,
          left: 0,
          right: 0,
          bottom: 0,
          bg: 'rgba(0,0,0,0.52)',
          zIndex: 20,
          opacity: mobilePanelOpen ? 1 : 0,
          pointerEvents: mobilePanelOpen ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
        onClick={() => setMobilePanelOpen(false)}
      />
    </Box>
  )
}

// ── Default export: ThemeProvider + app ─────────────────────────────────────

export default function Firefuels() {
  return (
    <ThemeProvider theme={theme}>
      <FirefuelsApp />
    </ThemeProvider>
  )
}
