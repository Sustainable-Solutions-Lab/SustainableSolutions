import { useReducer, useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'

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

// Read site-level theme (set by BaseLayout's bootstrap script) so firefuels
// starts in the same mode as the rest of the site. Falls back to dark on SSR.
function readSiteScheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function Firefuels({ companion = null }) {
  const initialScheme = readSiteScheme()
  const [state, dispatch] = useReducer(reducer, { ...initialState, colorScheme: initialScheme })

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
      .then((r) => r.json())
      .then((data) => {
        const vals = data.features
          .map((f) => f.properties?.[varId])
          .filter((v) => v != null && isFinite(v))
        setStatewideValues(vals)
        if (vals.length > 0) {
          const absDev = vals.map((v) => Math.abs(v - zero)).sort((a, b) => a - b)
          const idx = Math.floor(0.95 * (absDev.length - 1))
          setOpacityP95(absDev[idx])
        }
      })
      .catch(() => {})
  }, [activeVariable?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleScheme() {
    const next = state.colorScheme === 'dark' ? 'light' : 'dark'
    dispatch({ type: Actions.TOGGLE_SCHEME })
    // Mirror to the site-level theme so the body bg, BaseLayout, and any
    // future site chrome stay in lockstep with firefuels.
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    try { localStorage.setItem('ssl-theme', next) } catch {}
  }

  // Mobile panel: show only treatment + climate dimensions for the active layer
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const mobileDimensions = config.dimensions.filter(
    (d) =>
      (d.id === 'treatment' || d.id === 'climate') &&
      activeLayerConfig?.dimensionIds?.includes(d.id),
  )

  const wordmarkSrc = isDark ? '/SDSS_brand_white.png' : '/SDSS_brand.png'

  return (
    <div className="flex flex-col w-full h-screen overflow-hidden bg-paper">
      {/* ── Mobile header bar ──────────────────────────────────────────── */}
      <header
        className="flex md:hidden fixed top-0 left-0 right-0 items-center px-3 bg-paper border-b border-rule z-30"
        style={{ height: 68 }}
      >
        <div className="flex flex-col" style={{ gap: '3px' }}>
          <a
            href="/"
            className="bare"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              lineHeight: 1,
              marginBottom: '2px',
              display: 'inline-block',
            }}
          >
            ← Lab
          </a>
          <a
            href="/"
            className="bare"
            style={{ lineHeight: 0, display: 'inline-block' }}
          >
            <img
              src={wordmarkSrc}
              alt="Stanford Doerr School of Sustainability"
              style={{ height: 26, width: 'auto', objectFit: 'contain' }}
            />
          </a>
          <span
            className="font-serif text-ink"
            style={{ fontSize: '19px', fontWeight: 600, lineHeight: 1 }}
          >
            {config.title}
          </span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setMobilePanelOpen((o) => !o)}
          aria-label={mobilePanelOpen ? 'Close controls' : 'Open controls'}
          aria-expanded={mobilePanelOpen}
          className={[
            'flex items-center gap-1 cursor-pointer bg-transparent border-0 px-2 py-1',
            'font-sans text-[13px] font-bold uppercase tracking-[0.12em]',
            mobilePanelOpen ? 'text-ink' : 'text-ink-3',
          ].join(' ')}
        >
          {mobilePanelOpen ? <X size={16} strokeWidth={1.5} /> : <Menu size={16} strokeWidth={1.5} />}
          {mobilePanelOpen ? 'Close' : 'Controls'}
        </button>
      </header>

      {/* Spacer for mobile fixed header */}
      <div className="block md:hidden shrink-0" style={{ height: 68 }} />

      {/* ── Content row: sidebar | map ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex shrink-0">
          <Sidebar
            config={config}
            state={state}
            dispatch={dispatch}
            allValues={statewideValues}
            companion={companion}
          />
        </div>

        {/* Map — fills remaining space */}
        <div className="flex-1 relative min-w-0">
          <Map
            config={config}
            state={state}
            dispatch={dispatch}
            height="100%"
            onMapReady={(m) => setMapInstance(m)}
            onFilterStats={setFilterStats}
            onToggleScheme={handleToggleScheme}
            isDark={isDark}
            opacityP95={opacityP95}
          />

          {/* Mobile color bar */}
          <div
            className="block md:hidden absolute z-10"
            style={{
              bottom: 44,
              right: 10,
              width: 160,
              background: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)',
              borderRadius: 4,
              padding: '6px 8px',
            }}
          >
            <MobileLegend variable={activeVariable} allValues={statewideValues} isDark={isDark} />
          </div>

          {/* Lab symbol — clicks back to lab home */}
          <div className="absolute z-10" style={{ bottom: 40, left: 16 }}>
            <a href="/" className="bare" style={{ lineHeight: 0, display: 'block' }}>
              <img
                src={isDark ? '/LabLogo_light.png' : '/LabLogo_border.png'}
                alt="Back to Sustainable Solutions Lab"
                style={{ width: 36, height: 36, objectFit: 'contain' }}
              />
            </a>
          </div>

          {/* Regional data stats panel — desktop only */}
          <div className="hidden md:block">
            <StatsPanel
              drawnCircle={state.drawnCircle}
              aggregateStats={state.aggregateStats}
              areaToolActive={state.areaToolActive}
              activeVariable={activeVariable}
              isDark={isDark}
              dispatch={dispatch}
            />
          </div>

          {/* Area tool — desktop only */}
          <div className="hidden md:block">
            <AreaTool
              map={mapInstance}
              config={config}
              state={state}
              dispatch={dispatch}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile controls panel ─────────────────────────────────────── */}
      <div
        className="block md:hidden fixed left-0 right-0 z-[21] bg-paper border-b border-rule overflow-y-auto px-4 pt-3 pb-4"
        style={{
          top: 68,
          maxHeight: 'calc(100vh - 68px)',
          transform: mobilePanelOpen ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform 0.18s ease',
        }}
      >
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setMobileAboutOpen((o) => !o)}
            className={[
              'block w-full text-left bg-transparent border-0 cursor-pointer p-0',
              'font-sans text-[13px] font-bold uppercase tracking-[0.12em]',
              mobileAboutOpen ? 'text-ink mb-2' : 'text-ink-3 mb-0',
            ].join(' ')}
          >
            About
          </button>
          {mobileAboutOpen && (
            <div
              dangerouslySetInnerHTML={{ __html: config.description }}
              className="font-sans text-[11px] text-ink"
              style={{ lineHeight: 1.5 }}
            />
          )}
        </div>

        <div className="mb-3">
          <p className="font-sans text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2 m-0">
            Map
          </p>
          <LayerTabs config={config} state={state} dispatch={dispatch} />
        </div>

        {mobileDimensions.map((dim) => {
          const filteredDim = {
            ...dim,
            options: dim.options?.filter(
              (opt) => !opt.visibleForLayers || opt.visibleForLayers.includes(state.activeLayer),
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
          <div className="mt-3">
            <div className="flex gap-3">
              {[
                { label: 'Top 10%', value: 90 },
                { label: 'Top 1%', value: 99 },
              ].map(({ label, value }) => {
                const isActive = state.percentileRange.low === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: Actions.SET_PERCENTILE,
                        low: isActive ? 0 : value,
                        high: 100,
                      })
                    }
                    className={[
                      'cursor-pointer bg-transparent border-0 px-0',
                      'font-sans text-[11px] uppercase tracking-[0.12em] underline-offset-[3px]',
                      isActive ? 'font-bold text-ink underline' : 'font-normal text-ink-3 no-underline',
                    ].join(' ')}
                    style={{ paddingTop: '2px', paddingBottom: '2px' }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Scrim — grays out map while mobile panel is open */}
      <div
        className="block md:hidden fixed left-0 right-0 bottom-0"
        style={{
          top: 68,
          background: 'rgba(0,0,0,0.52)',
          zIndex: 20,
          opacity: mobilePanelOpen ? 1 : 0,
          pointerEvents: mobilePanelOpen ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
        onClick={() => setMobilePanelOpen(false)}
      />
    </div>
  )
}
