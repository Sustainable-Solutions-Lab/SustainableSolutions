/**
 * pages/index.js
 *
 * Main page — wires all components together with shared state, header (logos + scheme
 * toggle), mobile hamburger, methods overlay, and map → AreaTool instance handoff.
 */

/** @jsxImportSource theme-ui */
import { useReducer, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { Box, Flex, Button, useColorMode } from 'theme-ui'
import { Actions, initialState } from '../contracts/events.js'
import { projects } from '../projects/index.js'
import { Map } from '../components/map/index.js'
import { Sidebar } from '../components/sidebar/index.js'
import { DetailPanel } from '../components/detail-panel/index.js'
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

  const config = projects[state.projectId]
  const isDark = state.colorScheme === 'dark'

  // Toggle both Theme UI color mode and app state together
  function handleToggleScheme() {
    const next = state.colorScheme === 'dark' ? 'light' : 'dark'
    setColorMode(next)
    dispatch({ type: Actions.TOGGLE_SCHEME })
  }

  // Lazy-load the methods MDX only when the overlay is open
  const MethodsMDX = state.methodsOpen
    ? dynamic(() => import(`../projects/${config.id}/methods.mdx`), { ssr: false })
    : null

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
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Flex
          as='header'
          sx={{
            height: 56,
            flexShrink: 0,
            alignItems: 'center',
            px: 3,
            bg: 'surface',
            borderBottom: '1px solid',
            borderColor: 'border',
            zIndex: 20,
          }}
        >
          {/* Hamburger — mobile only */}
          <Button
            variant='icon'
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            sx={{
              display: ['flex', 'none'],
              mr: 2,
              fontSize: '18px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ☰
          </Button>

          {/* Lab symbol logo */}
          <img
            src={isDark ? '/LabLogo_light.png' : '/LabLogo_border.png'}
            alt='Sustainable Solutions Lab'
            style={{ height: 36, marginRight: 12, objectFit: 'contain' }}
          />

          {/* SDSS wordmark — links to lab site */}
          <a
            href='https://sustainablesolutions.stanford.edu'
            target='_blank'
            rel='noopener noreferrer'
            style={{ lineHeight: 0 }}
          >
            <img
              src={isDark ? '/SDSS_brand.png' : '/SDSS_brand_white.png'}
              alt='Stanford Doerr School of Sustainability'
              style={{ height: 28, objectFit: 'contain' }}
            />
          </a>

          {/* Spacer */}
          <Box sx={{ flex: 1 }} />

          {/* Color scheme toggle */}
          <Button
            variant='icon'
            onClick={handleToggleScheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            sx={{ fontSize: '18px' }}
          >
            {isDark ? '☀' : '🌙'}
          </Button>
        </Flex>

        {/* ── Content row (sidebar + map) ──────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Sidebar:
              - Desktop (≥ 768px): always visible, 280px, in normal flow
              - Mobile (< 768px):  shown/hidden as full-width overlay above the map */}
          <Box
            sx={{
              // mobile: absolute overlay when open, hidden when closed
              // desktop: always in normal flow at 280px
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
            <Sidebar config={config} state={state} dispatch={dispatch} />
          </Box>

          {/* Map (fills remaining width) */}
          <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <Map
              config={config}
              state={state}
              dispatch={dispatch}
              height='100%'
              onMapReady={(m) => setMapInstance(m)}
            />

            {/* Detail panel — absolute bottom-right inside the map area */}
            <DetailPanel
              config={config}
              cell={state.selectedCell}
              state={state}
              dispatch={dispatch}
            />

            {/* Area stats panel — absolute bottom-left inside the map area */}
            <StatsPanel
              config={config}
              drawnCircle={state.drawnCircle}
              aggregateStats={state.aggregateStats}
              dispatch={dispatch}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Area tool (logic-only, no DOM output) ───────────────────────────── */}
      <AreaTool
        map={mapInstance}
        config={config}
        state={state}
        dispatch={dispatch}
      />

      {/* ── Methods overlay ──────────────────────────────────────────────────── */}
      {state.methodsOpen && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            bg: 'background',
            overflowY: 'auto',
          }}
          onClick={(e) => {
            // Close when clicking the backdrop (outside the content box)
            if (e.target === e.currentTarget) {
              dispatch({ type: Actions.TOGGLE_METHODS })
            }
          }}
        >
          {/* Close button */}
          <Button
            variant='icon'
            onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
            aria-label='Close methods'
            sx={{
              position: 'fixed',
              top: 16,
              right: 16,
              zIndex: 31,
              fontSize: '20px',
            }}
          >
            ×
          </Button>

          {/* MDX content */}
          <Box
            sx={{
              maxWidth: 720,
              mx: 'auto',
              px: [3, 5],
              py: 5,
              color: 'text',
              fontFamily: 'body',
              fontSize: 1,
              lineHeight: 'body',
              'h1, h2, h3': { fontWeight: 'bold', lineHeight: 'heading', mt: 4, mb: 2 },
              'h1': { fontSize: 4 },
              'h2': { fontSize: 3 },
              'h3': { fontSize: 2 },
              p: { mb: 3 },
              'a': { color: 'primary' },
            }}
          >
            {MethodsMDX && <MethodsMDX />}
          </Box>
        </Box>
      )}
    </>
  )
}
