/**
 * pages/index.js
 *
 * Main page — wires all components together with shared state, header (logos + scheme
 * toggle), mobile hamburger, methods overlay, and map → AreaTool instance handoff.
 */

/** @jsxImportSource theme-ui */
import { useReducer, useState } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { Box, Button, useColorMode } from 'theme-ui'
import { Actions, initialState } from '../contracts/events.js'
import { projects } from '../projects/index.js'
import { getActiveVariable } from '../lib/get-active-variable.js'
import { Map } from '../components/map/index.js'
import { Sidebar } from '../components/sidebar/index.js'
import { AreaTool } from '../components/area-tool/index.js'
import { StatsPanel } from '../components/area-tool/stats-panel.js'

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case Actions.SET_PROJECT:
      return { ...state, projectId: action.projectId }
    case Actions.SET_LAYER:
      return { ...state, activeLayer: action.layerId }
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
  // Theme UI color mode — kept in sync with state.colorScheme
  const [, setColorMode] = useColorMode()
  // Mobile: sidebar open/closed (desktop: always open)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Map instance handed off from <Map onMapReady> to <AreaTool>
  const [mapInstance, setMapInstance] = useState(null)
  // Stats computed by the map's percentile filter
  const [filterStats, setFilterStats] = useState({ count: null, mean: null, median: null, totalCount: null, allValues: [] })

  const config = projects[state.projectId]
  const isDark = state.colorScheme === 'dark'
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  // Toggle both Theme UI color mode and app state together
  function handleToggleScheme() {
    const next = state.colorScheme === 'dark' ? 'light' : 'dark'
    setColorMode(next)
    dispatch({ type: Actions.TOGGLE_SCHEME })
  }

  // Lazy-load the methods MDX once it's first opened; keep it mounted after that
  // so the panel doesn't flash on re-open.
  const MethodsMDX = dynamic(
    () => import(`../projects/${config.id}/methods.mdx`),
    { ssr: false }
  )

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
        {/* ── Content row: sidebar | map | methods panel ───────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* Hamburger — mobile only, floating over map */}
          <Button
            variant='icon'
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            sx={{
              display: ['flex', 'none'],
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 20,
              fontSize: '18px',
              alignItems: 'center',
              justifyContent: 'center',
              bg: isDark ? 'rgba(26,26,26,0.85)' : 'rgba(255,255,255,0.9)',
              width: 38,
              height: 38,
              border: 'none',
              borderRadius: '4px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}
          >
            ☰
          </Button>

          {/* Sidebar — 280px fixed, full-width overlay on mobile */}
          <Box
            sx={{
              display: [sidebarOpen ? 'flex' : 'none', 'flex'],
              position: ['absolute', 'relative'],
              top: [0, 'auto'],
              left: [0, 'auto'],
              bottom: [0, 'auto'],
              right: [0, 'auto'],
              zIndex: [15, 1],
              flexShrink: [0, 0],
            }}
          >
            <Sidebar
              config={config}
              state={state}
              dispatch={dispatch}
              allValues={filterStats.allValues}
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
            />

            {/* Regional data stats panel */}
            <StatsPanel
              drawnCircle={state.drawnCircle}
              aggregateStats={state.aggregateStats}
              areaToolActive={state.areaToolActive}
              activeVariable={activeVariable}
              isDark={isDark}
              dispatch={dispatch}
            />

            {/* Area tool (resize/move handle overlay) */}
            <AreaTool
              map={mapInstance}
              config={config}
              state={state}
              dispatch={dispatch}
            />
          </Box>

          {/* Methods panel — slides in from the right as a 3rd column */}
          {state.methodsOpen && (
            <Box
              sx={{
                width: 300,
                flexShrink: 0,
                bg: 'surface',
                borderLeft: '1px solid',
                borderColor: 'border',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                zIndex: 2,
                // Slide in from the right
                '@keyframes slideInRight': {
                  from: { transform: 'translateX(100%)' },
                  to:   { transform: 'translateX(0)' },
                },
                animation: 'slideInRight 0.22s ease',
              }}
            >
              {/* Close button row */}
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

              {/* MDX content — matches sidebar typography */}
              <Box
                sx={{
                  flex: 1,
                  px: 3,
                  pb: 4,
                  color: 'text',
                  fontFamily: 'body',
                  fontSize: 0,
                  lineHeight: 'body',
                  'h1': {
                    fontSize: 1,
                    fontWeight: 'bold',
                    letterSpacing: 'caps',
                    textTransform: 'uppercase',
                    color: 'muted',
                    mt: 4,
                    mb: 2,
                  },
                  'h2': {
                    fontSize: 0,
                    fontWeight: 'bold',
                    letterSpacing: 'caps',
                    textTransform: 'uppercase',
                    color: 'muted',
                    mt: 3,
                    mb: 1,
                  },
                  'h3': {
                    fontSize: 0,
                    fontWeight: 'bold',
                    color: 'text',
                    mt: 2,
                    mb: 1,
                  },
                  p: { mb: 2, color: 'text' },
                  'em': { color: 'muted', fontStyle: 'italic' },
                  'a': { color: 'primary' },
                  'table': {
                    width: '100%',
                    borderCollapse: 'collapse',
                    mb: 3,
                    fontSize: 0,
                  },
                  'th, td': {
                    textAlign: 'left',
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'border',
                  },
                  'th': { color: 'muted', fontWeight: 'bold' },
                }}
              >
                <MethodsMDX />
              </Box>
            </Box>
          )}

        </Box>
      </Box>
    </>
  )
}
