/**
 * pages/index.js
 *
 * Main page — wires all components together with shared state.
 *
 * Desktop layout:
 *   [Sidebar 280px] | [Map fills rest] | [Methods panel 300px, optional]
 *
 * Mobile layout:
 *   [Mobile header 48px — wordmark + Controls button]
 *   [Map fills full height below header]
 *   [Controls panel slides down from header on demand — layer + dimensions]
 *   [Scrim grays out map while panel is open]
 *   Regional data tool (area tool + stats panel) is desktop-only.
 */

/** @jsxImportSource theme-ui */
import { useReducer, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { Box, Button, Flex, useColorMode } from 'theme-ui'
import { Actions, initialState } from '../contracts/events.js'
import { projects } from '../projects/index.js'
import { getActiveVariable } from '../lib/get-active-variable.js'
import { Map } from '../components/map/index.js'
import { Sidebar } from '../components/sidebar/index.js'
import { MobileLegend } from '../components/sidebar/legend.js'
import { LayerTabs } from '../components/sidebar/layer-tabs.js'
import { DimensionControl } from '../components/sidebar/dimension-control.js'
import { AreaTool } from '../components/area-tool/index.js'
import { StatsPanel } from '../components/area-tool/stats-panel.js'

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
      return { ...state, methodsOpen: !state.methodsOpen }
    default:
      return state
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [, setColorMode] = useColorMode()
  // Mobile: controls panel open/closed
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false)
  // Map instance handed off from <Map onMapReady> to <AreaTool>
  const [mapInstance, setMapInstance] = useState(null)
  // Stats computed by the map's percentile filter
  const [filterStats, setFilterStats] = useState({ count: null, mean: null, median: null, totalCount: null, allValues: [] })
  // Statewide values for the distribution chart — fetched once per variable, never viewport-filtered
  const [statewideValues, setStatewideValues] = useState([])
  // 95th percentile of |value - zero| — used for opacity scaling (CarbonPlan style)
  const [opacityP95, setOpacityP95] = useState(null)

  const config = projects[state.projectId]
  const isDark = state.colorScheme === 'dark'
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  // Fetch full statewide dataset once per variable for the distribution chart.
  // Also compute opacityP95 = 95th percentile of |value - zero| for opacity scaling.
  // Uses the lightweight GeoJSON (always available in public/) so the histogram
  // stays fixed regardless of map viewport or zoom level.
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
        // Compute 95th percentile of |value - zero| for opacity curve
        if (vals.length > 0) {
          const absDev = vals.map(v => Math.abs(v - zero)).sort((a, b) => a - b)
          const idx = Math.floor(0.95 * (absDev.length - 1))
          setOpacityP95(absDev[idx])
        }
      })
      .catch(() => {}) // GeoJSON not available (e.g., PMTiles-only production)
  }, [activeVariable?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle both Theme UI color mode and app state together
  function handleToggleScheme() {
    const next = state.colorScheme === 'dark' ? 'light' : 'dark'
    setColorMode(next)
    dispatch({ type: Actions.TOGGLE_SCHEME })
  }

  // Lazy-load the methods MDX once it's first opened
  const MethodsMDX = dynamic(
    () => import(`../projects/${config.id}/methods.mdx`),
    { ssr: false }
  )

  // Mobile panel: show only treatment + climate dimensions for the active layer
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const mobileDimensions = config.dimensions.filter((d) =>
    (d.id === 'treatment' || d.id === 'climate') &&
    activeLayerConfig?.dimensionIds?.includes(d.id)
  )

  // Logo sources (dark/light mode)
  const wordmarkSrc = isDark ? '/SDSS_brand_white.png' : '/SDSS_brand.png'

  return (
    <>
      <Head>
        <title>{config.title} — Firemap</title>
        <meta name='description' content={config.description} />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
      </Head>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          bg: 'background',
        }}
      >

        {/* ── Mobile header bar — fixed so it's always visible ───────────── */}
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
            bg: 'surface',
            borderBottom: '1px solid',
            borderColor: 'border',
            zIndex: 30,
          }}
        >
          <Flex sx={{ flexDirection: 'column', gap: '3px' }}>
            <a
              href='https://sustainablesolutions.stanford.edu'
              target='_blank'
              rel='noopener noreferrer'
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

          {/* Controls button */}
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

        {/* Spacer — reserves 68px for the fixed mobile header */}
        <Box sx={{ display: ['block', 'none'], height: 68, flexShrink: 0 }} />

        {/* ── Content row: sidebar | map | methods panel ───────────────────── */}
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

            {/* Mobile color bar — bottom-right of map */}
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

            {/* Lab symbol — lower-left corner of map */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 40,
                left: 16,
                zIndex: 10,
              }}
            >
              <a
                href='https://sustainablesolutions.stanford.edu'
                target='_blank'
                rel='noopener noreferrer'
                style={{ lineHeight: 0, display: 'block' }}
              >
                <img
                  src={isDark ? '/LabLogo_light.png' : '/LabLogo_border.png'}
                  alt='Sustainable Solutions Lab'
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

          {/* Methods panel — overlays the map from the right, doesn't displace it */}
          {state.methodsOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: 300,
                bg: 'surface',
                borderLeft: '1px solid',
                borderColor: 'border',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                zIndex: 20,
                '@keyframes slideInRight': {
                  from: { transform: 'translateX(100%)' },
                  to:   { transform: 'translateX(0)' },
                },
                animation: 'slideInRight 0.22s ease',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  px: 2,
                  pt: 2,
                  pb: 0,
                  flexShrink: 0,
                }}
              >
                <Button
                  variant='icon'
                  onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
                  aria-label='Close methods'
                  sx={{ width: 28, height: 28, fontSize: '20px', lineHeight: 1 }}
                >
                  ×
                </Button>
              </Box>

              <Box
                sx={{
                  flex: 1,
                  px: 3,
                  pb: 4,
                  color: 'text',
                  fontFamily: 'body',
                  fontSize: 0,
                  lineHeight: 'body',
                  'h1': { fontSize: 1, fontWeight: 'bold', letterSpacing: 'caps', textTransform: 'uppercase', color: 'muted', mt: 4, mb: 2 },
                  'h2': { fontSize: 0, fontWeight: 'bold', letterSpacing: 'caps', textTransform: 'uppercase', color: 'muted', mt: 3, mb: 1 },
                  'h3': { fontSize: 0, fontWeight: 'bold', color: 'text', mt: 2, mb: 1 },
                  p: { mb: 2, color: 'text' },
                  'em': { color: 'muted', fontStyle: 'italic' },
                  'a': { color: 'primary' },
                  'table': { width: '100%', borderCollapse: 'collapse', mb: 3, fontSize: 0 },
                  'th, td': { textAlign: 'left', py: 1, borderBottom: '1px solid', borderColor: 'border' },
                  'th': { color: 'muted', fontWeight: 'bold' },
                }}
              >
                <MethodsMDX />
              </Box>
            </Box>
          )}

        </Box>

        {/* ── Mobile controls panel — slides down from below header ─────────── */}
        <Box
          sx={{
            display: ['block', 'none'],
            position: 'fixed',
            top: 68,
            left: 0,
            right: 0,
            zIndex: 21,
            bg: 'surface',
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
          {/* About — expandable description */}
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

          {/* Section: Which map */}
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

          {/* Treatment + climate dimensions */}
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

          {/* Top 10% / Top 1% filter presets */}
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

          {/* Methods button */}
          <Box
            as='button'
            onClick={() => {
              setMobilePanelOpen(false)
              dispatch({ type: Actions.TOGGLE_METHODS })
            }}
            sx={{
              display: 'block',
              width: '100%',
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
              color: 'muted',
              transition: 'color 0.1s',
              '&:hover': { color: 'text' },
            }}
          >
            Methods
          </Box>
        </Box>

        {/* ── Scrim — grays out map while mobile panel is open ──────────────── */}
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
    </>
  )
}
