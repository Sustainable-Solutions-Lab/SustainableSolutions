import { useReducer, useState, useEffect, useMemo, useRef } from 'react'
import ToolShell from '../_shell/ToolShell'
import 'maplibre-gl/dist/maplibre-gl.css'

import { Actions, initialState } from './contracts/events.js'
import { projects } from './registry.js'
import { getActiveVariable } from './lib/get-active-variable.js'
import { Map } from './components/map/index.jsx'
import { Sidebar } from './components/sidebar/index.jsx'
import { MobileLegend } from './components/sidebar/legend.jsx'
import { LayerTabs } from './components/sidebar/layer-tabs.jsx'
import { DimensionControl } from './components/sidebar/dimension-control.jsx'
import { LatProfile } from './components/map/lat-profile.jsx'
import { YearBar } from './components/map/year-bar.jsx'
import { PaleLayer } from './components/map/pale-layer.jsx'
import { RegionalLayer } from './components/map/regional-layer.jsx'
import { AnalysisCellLayer } from './components/map/level-layer.jsx'
import { RegionStats } from './components/map/region-stats.jsx'
import { useYearFactors } from './lib/year-factors.js'
import { levelFor, makeLevelVariable, levelColorExpr } from './lib/analysis-levels.js'
import { categoricalFor, categoricalEntries, categoricalColorExpr, categoricalOpacityExpr, categoricalLegend } from './lib/analysis-categorical.js'
import { cellTermFor, cellChangeExpr, cellChangeColorExpr, cellChangeMagnitudeExpr } from './lib/analysis-cell-change.js'
import { CityEquityChart } from './components/sidebar/city-equity-chart.jsx'
import { AreaTool } from './components/area-tool/index.jsx'
import { StatsPanel } from './components/area-tool/stats-panel.jsx'
import { MethodsPanel } from './components/methods-panel.jsx'
import { DevControls, shouldShowDevControls, readStoredTuning } from './components/dev-controls.jsx'
import { DEFAULT_TUNING } from './lib/use-just-air-layers.js'

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case Actions.SET_ANIMATING:
      return { ...state, animatingDimension: action.dimensionId ?? null }
    case Actions.SET_MAP_VIEW:
      return { ...state, mapView: action.view,
               selectedUnit: action.view === 'regional' ? state.selectedUnit : null }
    case Actions.SET_ANALYSIS:
      return { ...state, analysis: action.analysis ?? null }
    case Actions.SET_ANALYSIS_DRIVER:
      return { ...state, analysisDriver: action.driver }
    case Actions.SELECT_UNIT:
      return { ...state, selectedUnit: action.unit ?? null }
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
      // Setting a circle clears any active ZIP polygon — they're alternative
      // ways to define the same regional-stats input, only one at a time.
      return { ...state, drawnCircle: action.circle, drawnPolygon: action.circle ? null : state.drawnPolygon }
    case Actions.SET_DRAWN_POLYGON:
      return { ...state, drawnPolygon: action.polygon, drawnCircle: action.polygon ? null : state.drawnCircle }
    case Actions.SET_AGGREGATE_STATS:
      return { ...state, aggregateStats: action.stats }
    case Actions.SET_PERCENTILE:
      return { ...state, percentileRange: { low: action.low, high: action.high } }
    case Actions.TOGGLE_AREA_TOOL:
      // Toggling the tool off clears whatever region was active.
      return state.areaToolActive
        ? { ...state, areaToolActive: false, drawnCircle: null, drawnPolygon: null, aggregateStats: null }
        : { ...state, areaToolActive: true }
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

// Read site-level theme (set by BaseLayout's bootstrap script) so firefuels
// starts in the same mode as the rest of the site. Falls back to dark on SSR.
function readSiteScheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// ── App ─────────────────────────────────────────────────────────────────────

/**
 * Build an AppState seed for `projectId` by reading the first layer + each
 * dimension's defaultValue from the project config. Keeps MapTool generic so
 * it doesn't have to know about per-project layer/dimension names.
 */
function seedStateForProject(projectId) {
  const project = projects[projectId]
  if (!project) return initialState
  const firstLayer = project.layers.find((l) => !l.hidden) ?? project.layers[0]
  const activeDimensions = {}
  for (const d of project.dimensions ?? []) {
    activeDimensions[d.id] = d.defaultValue
  }
  return {
    ...initialState,
    projectId,
    activeLayer: firstLayer?.id ?? initialState.activeLayer,
    activeDimensions,
  }
}

export default function MapTool({ projectId = 'fuel-treatment', companion = null, display = null, repoLinks = null }) {
  const initialScheme = readSiteScheme()
  const [state, dispatch] = useReducer(
    reducer,
    { ...seedStateForProject(projectId), colorScheme: initialScheme },
  )

  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false)
  // City-inequality mobile picker — list of 15 metros, with one
  // selectable at a time to render the pre-baked equity chart inline.
  const [cityEquityData, setCityEquityData] = useState(null)
  const [equityCity, setEquityCity] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch('/tools/just-air/city-equity.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setCityEquityData(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [mapInstance, setMapInstance] = useState(null)
  // PALE-drivers choropleth mode (config.paleMap): replaces the cell
  // circles with jurisdiction polygons colored by one LMDI term.
  // Analysis overlays (PALE) work over either map view — only analyses
  // that require regional statistics (population, production) are
  // region-bound, and those live inside the PALE decomposition itself.
  const paleActive = state.analysis === 'pale'
  const setPaleActive = (on) => {
    // Analysis is one view now: the net change. Dominance uses the same
    // driver slot, so reset it on the way in.
    if (on) {
      dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
      dispatch({ type: Actions.SET_ANALYSIS_DRIVER, driver: config.paleMap?.drivers?.[0]?.id ?? 'r_net' })
    }
    dispatch({ type: Actions.SET_ANALYSIS, analysis: on ? 'pale' : null })
  }
  const paleDriver = state.analysisDriver
  const setPaleDriver = (d) => dispatch({ type: Actions.SET_ANALYSIS_DRIVER, driver: d })
  const [filterStats, setFilterStats] = useState({ count: null, mean: null, median: null, totalCount: null, allValues: [] })
  const [statewideValues, setStatewideValues] = useState([])
  const [opacityP95, setOpacityP95] = useState(null)
  const [tuning, setTuning] = useState(() => readStoredTuning() ?? { ...DEFAULT_TUNING })
  const [showDevControls, setShowDevControls] = useState(false)
  useEffect(() => { setShowDevControls(shouldShowDevControls()) }, [])

  // Sheet-managed display fields (title, eyebrow, summary) override the
  // hardcoded project config so editing the Tools sheet flows through to
  // the in-tool sidebar header without code changes.
  // Memoized so the spread doesn't produce a fresh object on every render —
  // downstream effects use `config` as a useEffect dep and would otherwise
  // re-run forever (which was causing continuous map flashing).
  const baseConfig = projects[state.projectId] ?? projects['fuel-treatment']
  const displayTitle = display?.title ?? null
  const displayEyebrow = display?.eyebrow ?? null
  const displaySummary = display?.summary ?? null
  const config = useMemo(() => {
    if (!displayTitle && !displayEyebrow && !displaySummary) return baseConfig
    return {
      ...baseConfig,
      title: displayTitle || baseConfig.title,
      eyebrow: displayEyebrow || baseConfig.eyebrow,
      summary: displaySummary || baseConfig.summary,
    }
  }, [baseConfig, displayTitle, displayEyebrow, displaySummary])
  const isDark = state.colorScheme === 'dark'
  const rawActiveVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const toolYearFactors = useYearFactors(config)
  const attachedVariable = rawActiveVariable?.scaled && toolYearFactors
    ? { ...rawActiveVariable, scaled: { ...rawActiveVariable.scaled, factors: toolYearFactors } }
    : rawActiveVariable
  const activeLevel = levelFor(config, state)
  const activeCategorical = categoricalFor(config, state)
  const categoricalEntryList = useMemo(
    () => (activeCategorical ? categoricalEntries(activeCategorical, config, state) : []),
    [activeCategorical, config, state.activeDimensions],
  )
  const activeVariable = activeLevel ? makeLevelVariable(activeLevel) : attachedVariable
  // Change drivers render the LMDI unit polygons; level and dominance
  // drivers repaint the active view (cells or units).
  // A driver shows its LMDI change polygons only when it is NOT being
  // rendered as a gridded level (activeLevel decides that per map view).
  // The change decomposition also runs on the cells, minus population.
  const cellTerm = cellTermFor(config, state)
  const cellChangeTerms = cellTerm ? (attachedVariable?.yearTerms ?? null) : null
  // Change polygons only when the cells are not carrying the change map.
  const analysisIsChange = paleActive && !activeLevel && !cellTerm &&
    (config.paleMap?.drivers ?? []).some((d) => d.id === paleDriver)
  // Paint expression for the gridded analysis overlay, plus a key that
  // changes exactly when the layers must be rebuilt.
  const analysisCellColor = useMemo(() => {
    if (activeLevel) return levelColorExpr(makeLevelVariable(activeLevel), isDark)
    if (activeCategorical && categoricalEntryList.length) {
      return categoricalColorExpr(categoricalEntryList, 5e-4)
    }
    if (cellTerm && cellChangeTerms && toolYearFactors) {
      return cellChangeColorExpr(
        cellChangeExpr({ terms: cellChangeTerms, factors: toolYearFactors,
                         trends: toolYearFactors, term: cellTerm }),
        50, isDark)
    }
    return null
  }, [activeLevel, activeCategorical, categoricalEntryList, isDark, cellTerm, cellChangeTerms, toolYearFactors])
  // Cell-scale magnitude ramp (kt CO2e per 0.25-degree cell).
  // The quantity a cell is judged by: the winning source for a dominance
  // map, the start-year emissions for a change map. Drives both the alpha
  // ramp and the low-zoom band filters.
  const analysisCellMagnitude = useMemo(() => {
    if (activeCategorical && categoricalEntryList.length) {
      const props = categoricalEntryList.map((e) => ['coalesce', ['to-number', ['get', e.prop]], 0])
      return props.length === 1 ? props[0] : ['max', ...props]
    }
    if (cellTerm && cellChangeTerms && toolYearFactors) {
      return cellChangeMagnitudeExpr({ terms: cellChangeTerms, factors: toolYearFactors })
    }
    return null
  }, [activeCategorical, categoricalEntryList, cellTerm, cellChangeTerms, toolYearFactors])
  const analysisCellOpacity = useMemo(() => {
    if (!analysisCellMagnitude) return null
    const expr = ['interpolate', ['linear'], analysisCellMagnitude]
    for (const [v, a] of [[0, 0.06], [1, 0.3], [8, 0.6], [40, 0.85], [150, 1]]) expr.push(v, a)
    return expr
  }, [analysisCellMagnitude])
  const analysisPaintKey = [
    paleDriver, isDark ? 'd' : 'l', state.mapView, toolYearFactors ? 'f' : '-',
    state.activeDimensions?.source, state.activeDimensions?.crop,
  ].join('|')

  // ── Dimension animation ────────────────────────────────────────────────
  // Lives at tool level (not in the slider component) so it keeps running —
  // and keeps looping — when the mobile controls drawer closes and unmounts
  // the rail. Toggled via Actions.SET_ANIMATING from the slider's play button.
  const animDim = state.animatingDimension
    ? config.dimensions.find((d) => d.id === state.animatingDimension)
    : null
  const animValueRef = useRef(null)
  animValueRef.current = animDim ? (state.activeDimensions[animDim.id] ?? animDim.defaultValue) : null
  useEffect(() => {
    if (!animDim) return undefined
    const ids = animDim.options.map((o) => o.id)
    const timer = setInterval(() => {
      const idx = ids.indexOf(String(animValueRef.current))
      dispatch({ type: Actions.SET_DIMENSION, dimensionId: animDim.id, value: ids[(idx + 1) % ids.length] })
    }, 700)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animDim?.id])

  // Prominent on-map readout of the animated/animatable dimension's current
  // value (e.g. the year) — the sidebar is hidden on mobile while the map
  // animates, so the value must live on the map itself.
  const mapBadgeDim = config.dimensions.find(
    (d) => d.animate && (config.layers.find((l) => l.id === state.activeLayer)?.dimensionIds ?? []).includes(d.id)
  )
  const compareOn = config.yearControl?.compareDimensionId
    ? (state.activeDimensions[config.yearControl.compareDimensionId] ?? 'off') === 'on'
    : false
  const mapBadgeValue = mapBadgeDim && !compareOn
    ? (state.activeDimensions[mapBadgeDim.id] ?? mapBadgeDim.defaultValue)
    : null
  // Small what-is-shown label under the year readout: the selected option of
  // every sidebar dropdown the active layer uses (e.g. "Fertilizer N₂O ·
  // Maize (corn)"). Year-bar projects only.
  const badgeSelectionLabel = config.yearControl
    ? [
        ...config.dimensions
          .filter((d) =>
            d.type === 'dropdown' &&
            d.location !== 'map' &&
            (config.layers.find((l) => l.id === state.activeLayer)?.dimensionIds ?? []).includes(d.id))
          .map((d) => d.options?.find((o) => o.id === (state.activeDimensions[d.id] ?? d.defaultValue))?.label),
        // What the colors mean right now, when it isn't just the total.
        (() => {
          if (state.analysis === 'dominance') {
            return (config.paleMap?.categorical ?? []).find((c) => c.id === state.analysisDriver)?.shortLabel
          }
          // Analysis is the one net-change view; say that plainly.
          if (state.analysis === 'pale') return 'Change 2000–2023'
          const low = state.percentileRange?.low ?? 0
          return low > 0 ? `Top ${100 - low}%` : null
        })(),
      ].filter(Boolean).join(' · ')
    : ''

  // Populate the "statewide" value distribution for the active variable.
  // Two paths:
  //   - Fuel-treatment uses the GeoJSON dev fallback (kept for back-compat).
  //   - Other projects (just-air) querySourceFeatures on the rendered map
  //     so the distribution chart + percentile filter have real values to
  //     work with. We listen for sourcedata events because tile features
  //     arrive asynchronously after the map first becomes ready.
  useEffect(() => {
    if (!activeVariable || activeVariable.type === 'categorical') {
      setStatewideValues([])
      setOpacityP95(null)
      return
    }
    const varId = activeVariable.id
    const zero = activeVariable.domain?.zero ?? activeVariable.domain?.min ?? 0

    function applyDist(vals) {
      setStatewideValues(vals)
      if (vals.length > 0) {
        const absDev = vals.map((v) => Math.abs(v - zero)).sort((a, b) => a - b)
        const idx = Math.floor(0.95 * (absDev.length - 1))
        setOpacityP95(absDev[idx])
      }
    }

    // Generic path: projects that declare config.distributionsUrl get their
    // precomputed value sample fetched directly (built alongside the tiles).
    if (activeVariable?.diffOf || activeVariable?.scaled?.isDiff) {
      // Computed difference variables have no stored distribution sample;
      // the sidebar falls back to the gradient legend.
      setStatewideValues([])
      setOpacityP95(null)
      return
    }
    if (config.distributionsUrl) {
      let cancelled = false
      fetch(config.distributionsUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return
          const vals = Array.isArray(data[varId]) ? data[varId] : []
          applyDist(vals)
        })
        .catch(() => {})
      return () => { cancelled = true }
    }

    if (state.projectId === 'fuel-treatment') {
      fetch('/geo/fuel-treatment.geojson')
        .then((r) => r.json())
        .then((data) => {
          const vals = data.features
            .map((f) => f.properties?.[varId])
            .filter((v) => v != null && isFinite(v))
          applyDist(vals)
        })
        .catch(() => {})
      return
    }

    if (state.projectId === 'just-air') {
      // Read the precomputed nationwide value sample baked at build time
      // (scripts/build-just-air-tiles.mjs writes distributions.json).
      // This replaces the previous querySourceFeatures-on-every-pan
      // approach: the sidebar chart is now a stable CONUS-wide reference
      // that doesn't shift as the user zooms or pans. For region-level
      // detail, use the area / region-focus tool.
      let cancelled = false
      fetch('/tools/just-air/distributions.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return
          const vals = Array.isArray(data[varId]) ? data[varId] : []
          applyDist(vals)
        })
        .catch(() => {})
      return () => { cancelled = true }
    }

    setStatewideValues([])
    setOpacityP95(null)
  }, [activeVariable?.id, activeVariable?.scaled?.isDiff, state.projectId, mapInstance, baseConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to the site-level theme attribute so the nav's dark/light
  // toggle drives the entire tool. The in-map moon/sun button was removed —
  // the nav button is the only switch.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    const observer = new MutationObserver(() => {
      const siteIsDark = html.getAttribute('data-theme') === 'dark'
      const toolIsDark = state.colorScheme === 'dark'
      if (siteIsDark !== toolIsDark) dispatch({ type: Actions.TOGGLE_SCHEME })
    })
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [state.colorScheme])

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

  // Mobile panel: show whichever dimensions the active layer declares.
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const mobileDimensions = config.dimensions.filter((d) =>
    activeLayerConfig?.dimensionIds?.includes(d.id) && d.location !== 'map',
  )

  const wordmarkSrc = isDark ? '/logos/sdss/SDSS_brand_white.png' : '/logos/sdss/SDSS_brand.png'

  return (
    <ToolShell
      eyebrow={config.eyebrow}
      title={config.title}
      summary={config.summary}
      surface="paper"
      railChrome={false}
      drawerOpen={mobilePanelOpen}
      onDrawerOpenChange={setMobilePanelOpen}
      rail={
        <Sidebar
          config={config}
          state={state}
          dispatch={dispatch}
          allValues={statewideValues}
          companion={companion}
          repoLinks={repoLinks}
          paleActive={paleActive}
          setPaleActive={setPaleActive}
          paleDriver={paleDriver}
          setPaleDriver={setPaleDriver}
          analysisEntries={categoricalEntryList}
        />
      }
      drawer={
        <>

        {config.layers.filter((l) => !l.hidden).length > 1 && (
          <div className="mb-3">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-1 m-0">
              Map
            </p>
            <LayerTabs config={config} state={state} dispatch={dispatch} />
          </div>
        )}

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

        {/* Map view + percentile presets — mobile */}
        {config.regionalView && (
          <div className="mb-3">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-1 m-0">
              Map view
            </p>
            <div className="flex gap-4">
              {[['gridded', 'Gridded'], ['regional', 'Regional']].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => dispatch({ type: Actions.SET_MAP_VIEW, view: v })}
                  className={[
                    'bg-transparent border-0 cursor-pointer p-0 font-sans text-[12px] uppercase tracking-[0.12em]',
                    (state.mapView ?? 'gridded') === v ? 'font-bold text-ink underline underline-offset-[3px]' : 'font-normal text-ink-3',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {config.percentileFilter?.enabled && (
          <div className="mb-2 flex items-center gap-3">
            {[[0, 'All'], [75, 'Top 25%'], [90, 'Top 10%'], [95, 'Top 5%']].map(([low, label]) => (
              <button
                key={low}
                type="button"
                onClick={() => {
                  if (state.analysis === 'dominance') dispatch({ type: Actions.SET_ANALYSIS, analysis: null })
                  dispatch({ type: Actions.SET_PERCENTILE, low, high: 100 })
                }}
                className={[
                  'bg-transparent border-0 cursor-pointer p-0 font-sans text-[11px]',
                  state.analysis !== 'dominance' && (state.percentileRange?.low ?? 0) === low ? 'font-bold text-ink underline underline-offset-[3px]' : 'font-normal text-ink-3',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {config.paleMap?.categorical && (
          <div className="mb-2 flex items-center gap-3">
            {config.paleMap.categorical.map((c) => {
              const on = state.analysis === 'dominance' && state.analysisDriver === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (on) { dispatch({ type: Actions.SET_ANALYSIS, analysis: null }); return }
                    dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
                    dispatch({ type: Actions.SET_ANALYSIS_DRIVER, driver: c.id })
                    dispatch({ type: Actions.SET_ANALYSIS, analysis: 'dominance' })
                  }}
                  className={[
                    'bg-transparent border-0 cursor-pointer p-0 font-sans text-[11px]',
                    on ? 'font-bold text-ink underline underline-offset-[3px]' : 'font-normal text-ink-3',
                  ].join(' ')}
                >
                  {c.shortLabel ?? c.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Region focus — mobile access (config.areaTool) */}
        {config.areaTool?.enabled && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: Actions.TOGGLE_AREA_TOOL })
              setMobilePanelOpen(false)
            }}
            className={[
              'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-3 mb-1',
              'font-sans text-[12px] uppercase tracking-[0.12em]',
              state.areaToolActive ? 'font-bold text-ink underline underline-offset-[3px]' : 'font-normal text-ink-3',
            ].join(' ')}
          >
            Region Focus
          </button>
        )}

        {/* Analysis — mobile access (config.paleMap) */}
        {config.paleMap && (
          <div className="mt-4 pt-3 border-t border-rule">
            <button
              type="button"
              onClick={() => setPaleActive(!paleActive)}
              className={[
                'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mb-1',
                'font-sans text-[12px] uppercase tracking-[0.12em]',
                paleActive ? 'font-bold text-ink underline underline-offset-[3px]' : 'font-normal text-ink-3',
              ].join(' ')}
            >
              Analysis
            </button>
            {paleActive && (
              <p className="font-sans text-ink-3 m-0 mt-1" style={{ fontSize: 10, lineHeight: 1.4 }}>
                Change in emissions 2000–2023 (blue down, red up). Tap a
                region for the drivers behind it.
              </p>
            )}
          </div>
        )}

        {/* City inequality picker — only meaningful for PM / mortality
            under one of the CDR scenarios (the equity bins are computed
            against those metrics specifically). Replaces the older
            Top-10%/Top-1% filter buttons on the mobile panel; the
            desktop sidebar still has the percentile-filter slider
            on its distribution chart. */}
        {(() => {
          const layerId = activeVariable?.layer
          const scenario = activeVariable?.dimensionValues?.scenario
          const valueKey =
            layerId === 'pm25' && scenario === 'low'  ? 'pm25_low'  :
            layerId === 'pm25' && scenario === 'high' ? 'pm25_high' :
            layerId === 'mortality' && scenario === 'low'  ? 'mort_low'  :
            layerId === 'mortality' && scenario === 'high' ? 'mort_high' :
            null
          if (!valueKey || !cityEquityData) return null
          const cities = Object.keys(cityEquityData).sort()
          const stats = equityCity ? cityEquityData[equityCity]?.[valueKey] : null
          return (
            <div className="mt-4 pt-3 border-t border-rule">
              <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-2 m-0">
                City inequality
              </p>
              <p className="font-sans text-[12px] text-ink-2 mb-2 m-0">
                Pick a metro to see {layerId === 'pm25' ? 'PM₂.₅' : 'mortality'} binned
                by income tertile and race within that city.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                {cities.map((c) => {
                  const isActive = c === equityCity
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEquityCity(isActive ? null : c)}
                      className={[
                        'cursor-pointer bg-transparent border-0 px-0',
                        'font-sans text-[12px]',
                        isActive ? 'font-bold text-ink underline underline-offset-[3px]' : 'font-normal text-ink-3',
                      ].join(' ')}
                      style={{ paddingTop: '2px', paddingBottom: '2px' }}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
              {stats ? (
                <CityEquityChart stats={stats} isDark={isDark} variable={activeVariable} />
              ) : (
                <p className="font-sans text-[11px] text-ink-3 m-0">
                  {equityCity
                    ? 'Not enough pixels in this city for this metric.'
                    : 'Tap a city above.'}
                </p>
              )}
            </div>
          )
        })()}

        <button
          type="button"
          onClick={() => {
            dispatch({ type: Actions.TOGGLE_METHODS })
            setMobilePanelOpen(false)
          }}
          className="block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-6 font-sans text-[12px] uppercase tracking-[0.12em] text-ink-3 hover:text-ink"
        >
          Read Methods
        </button>
        </>
      }
    >
      <div className="h-full w-full relative">
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
            tuning={tuning}
          />

          {showDevControls && (
            <DevControls tuning={tuning} setTuning={setTuning} mapInstance={mapInstance} />
          )}

          {/* Mobile color bar — sits above Safari's URL bar (~ 90 px tall on
              iPhones) and above the in-map attribution strip (~14 px). Bg
              uses the design-system paper color with transparency so it
              blends with the surrounding map background. */}
          <div
            className="block md:hidden absolute z-10"
            style={{
              // Just above the year bar pinned at the bottom of the map.
              bottom: 70,
              right: 8,
              width: 160,
              background: isDark ? 'rgba(12, 12, 28, 0.92)' : 'rgba(248, 248, 232, 0.92)',
              borderRadius: 4,
              padding: '6px 8px',
            }}
          >
            {paleActive ? (
              <div>
                <div style={{
                  height: 7, borderRadius: 2,
                  background: 'linear-gradient(to right, rgba(50,136,189,0.9), rgba(102,194,165,0.6), rgba(128,128,128,0.15), rgba(253,174,97,0.6), rgba(213,62,79,0.9))',
                }} />
                <div className="flex justify-between font-mono text-ink-3" style={{ fontSize: 9 }}>
                  <span>−50%</span><span>change since 2000</span><span>+50%</span>
                </div>
              </div>
            ) : state.analysis === 'dominance' && categoricalEntryList.length ? (
              <div className="flex flex-wrap" style={{ gap: '1px 8px' }}>
                {categoricalLegend(categoricalEntryList).map((e) => (
                  <span key={e.color} className="font-mono text-ink-2 inline-flex items-center"
                    style={{ fontSize: 8, gap: 3 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: e.color,
                      display: 'inline-block', flexShrink: 0 }} />
                    {e.label}
                  </span>
                ))}
              </div>
            ) : (
              <MobileLegend variable={activeVariable} allValues={statewideValues} isDark={isDark} />
            )}
          </div>

          {/* Latitudinal marginal — config-gated (latProfileUrl) */}
          {config.latProfileUrl && (
            <LatProfile
              map={mapInstance}
              config={config}
              variable={activeVariable}
              isDark={isDark}
            />
          )}

          {/* Always-on year control — config-gated (yearControl) */}
          {config.yearControl && !paleActive && (
            <YearBar config={config} state={state} dispatch={dispatch} isDark={isDark} />
          )}

          {/* Regional map view — config-gated (regionalView) */}
          {config.regionalView && (
            <RegionalLayer
              map={mapInstance}
              config={config}
              state={state}
              dispatch={dispatch}
              isDark={isDark}
              suppressed={analysisIsChange}
            />
          )}
          {config.regionalView && (
            <RegionStats
              map={mapInstance}
              state={state}
              dispatch={dispatch}
              activeVariable={activeVariable}
              isDark={isDark}
              config={config}
            />
          )}

          {/* Gridded analysis overlay (level or dominance) */}
          {state.mapView === 'gridded' && analysisCellColor && (
            <AnalysisCellLayer
              map={mapInstance}
              config={config}
              colorExpr={analysisCellColor}
              opacityExpr={analysisCellOpacity}
              magnitudeExpr={analysisCellMagnitude}
              paintKey={analysisPaintKey}
            />
          )}

          {/* PALE-drivers choropleth — config-gated (paleMap); regional-only */}
          {config.paleMap && (
            <PaleLayer
              map={mapInstance}
              config={config}
              active={analysisIsChange}
              driver={paleDriver}
              isDark={isDark}
              dispatch={dispatch}
              selectedId={state.selectedUnit?.id ?? null}
            />
          )}

          {/* Animated-dimension readout (e.g. year) + what-is-shown label */}
          {(mapBadgeValue != null || badgeSelectionLabel) && (
            <div
              className="absolute z-10 pointer-events-none font-mono text-ink"
              style={{
                top: 14,
                left: config.mapControls === false ? 14
                  : config.mapControlsSide === 'left' ? 66 : 12,
                textShadow: isDark
                  ? '0 1px 8px rgba(12,12,28,0.9)'
                  : '0 1px 8px rgba(248,248,232,0.9)',
              }}
            >
              {mapBadgeValue != null && (
                <div
                  aria-live="polite"
                  style={{
                    fontSize: 34,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.02em',
                    lineHeight: 1.05,
                    opacity: 0.85,
                  }}
                >
                  {mapBadgeValue}
                </div>
              )}
              {badgeSelectionLabel && (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    opacity: 0.85,
                    marginTop: 3,
                  }}
                >
                  {badgeSelectionLabel}
                </div>
              )}
            </div>
          )}

          {/* Regional data stats panel. sheetFocus tells the mobile sheet
              what the map is showing, so its collapsed view matches. */}
          <div>
            <StatsPanel
              sheetFocus={paleActive ? 'pale'
                : state.analysis === 'dominance'
                  ? ((config.paleMap?.categorical ?? [])
                      .find((c) => c.id === state.analysisDriver)?.kind ?? 'default')
                  : 'default'}
              config={config}
              drawnCircle={state.drawnCircle}
              drawnPolygon={state.drawnPolygon}
              aggregateStats={state.aggregateStats}
              areaToolActive={state.areaToolActive}
              activeVariable={activeVariable}
              isDark={isDark}
              dispatch={dispatch}
            />
          </div>

          {/* Area tool — touch-enabled, so mobile gets it too */}
          <div>
            <AreaTool
              map={mapInstance}
              config={config}
              state={state}
              dispatch={dispatch}
            />
          </div>

          {/* Methods overlay — covers the map area when "Read Methods" is clicked. */}
          {state.methodsOpen && (
            <MethodsPanel
              config={config}
              isDark={isDark}
              onClose={() => dispatch({ type: Actions.TOGGLE_METHODS })}
            />
          )}
        </div>
    </ToolShell>
  )
}
