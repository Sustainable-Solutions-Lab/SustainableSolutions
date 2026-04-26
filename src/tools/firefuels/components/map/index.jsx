// IMPORTANT: pages/_app.js must import 'maplibre-gl/dist/maplibre-gl.css'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { basemapStyle } from './basemap-style.jsx'
import { addStaticLayers, setGraticuleVisible as applyGraticuleVisibility } from './static-layers.jsx'
import { useMapLayer } from '../../lib/use-map-layer.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { percentileThresholds } from '../../lib/area-stats.js'
import { SOURCE_ID, LAYER_ID, LAYER_ID_AGG, LAYER_ID_MED, LAYER_ID_COARSE, LAYER_IDS } from '../../lib/use-map-layer.js'

// ── SVG icons for map controls ────────────────────────────────────────────────

function GlobeIcon() {
  return (
    <svg width='22' height='22' viewBox='0 0 18 18' fill='none' stroke='currentColor' strokeWidth='1.3'>
      <circle cx='9' cy='9' r='6.5'/>
      <ellipse cx='9' cy='9' rx='3' ry='6.5'/>
      <line x1='2.5' y1='9' x2='15.5' y2='9'/>
      <line x1='3.8' y1='5.5' x2='14.2' y2='5.5'/>
      <line x1='3.8' y1='12.5' x2='14.2' y2='12.5'/>
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width='22' height='22' viewBox='0 0 18 18' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
      <circle cx='9' cy='9' r='3'/>
      <line x1='9' y1='1.5' x2='9' y2='3.5'/>
      <line x1='9' y1='14.5' x2='9' y2='16.5'/>
      <line x1='1.5' y1='9' x2='3.5' y2='9'/>
      <line x1='14.5' y1='9' x2='16.5' y2='9'/>
      <line x1='3.8' y1='3.8' x2='5.2' y2='5.2'/>
      <line x1='12.8' y1='12.8' x2='14.2' y2='14.2'/>
      <line x1='14.2' y1='3.8' x2='12.8' y2='5.2'/>
      <line x1='5.2' y1='12.8' x2='3.8' y2='14.2'/>
    </svg>
  )
}

/**
 * Interactive MapLibre GL map for Firemap.
 *
 * @param {object}   props
 * @param {import('../../contracts/project-config').ProjectConfig} props.config
 * @param {import('../../contracts/events').AppState}              props.state
 * @param {Function} props.dispatch
 * @param {string}   props.height    - CSS height string
 * @param {Function} [props.onMapReady]  - called with the map instance after load
 */
export function Map({ config, state, dispatch, height, onMapReady, onFilterStats, onToggleScheme, isDark, opacityP95 }) {
  const containerRef = useRef(null)

  /** @type {React.MutableRefObject<import('maplibre-gl').Map|null>} */
  const mapRef = useRef(null)

  // Keep latest colorScheme in a ref so effects can read it without re-running
  const schemeRef = useRef(state.colorScheme)
  schemeRef.current = state.colorScheme

  const [mapReady, setMapReady] = useState(false)
  const [graticuleVisible, setGraticuleVisible_] = useState(false)

  // ── Map initialization ───────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!containerRef.current) return

    // Register PMTiles protocol
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)

    const isMobile = window.innerWidth < 768
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(schemeRef.current),
      center: config.region.center,
      zoom: isMobile ? 4.8 : 5,
      minZoom: isMobile ? 4.8 : 5.3,
      maxZoom: 9,
      // Disable built-in attribution — we render our own static text below
      attributionControl: false,
    })

    mapRef.current = map

    map.once('load', () => {
      addStaticLayers(map, schemeRef.current)
      setMapReady(true)
      if (onMapReady) onMapReady(map)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
      maplibregl.removeProtocol('pmtiles')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Data layer (PMTiles / GeoJSON) ───────────────────────────────────────
  useMapLayer(mapReady ? mapRef.current : null, config, state, opacityP95)

  // ── Color scheme change ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    map.setStyle(basemapStyle(state.colorScheme))

    map.once('styledata', () => {
      addStaticLayers(map, state.colorScheme)
      // Restore graticule visibility
      applyGraticuleVisibility(map, graticuleVisible)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.colorScheme])

  // ── Percentile filter ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    function applyFilter() {
      const hasAnyLayer = LAYER_IDS.some(id => map.getLayer(id))
      if (!hasAnyLayer) return

      const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
      if (!variable || variable.type === 'categorical') return

      // PMTiles (vector) sources require sourceLayer; GeoJSON sources do not.
      const sourceOptions = config.tilesUrl === 'REPLACE_WITH_R2_URL'
        ? {}
        : { sourceLayer: config.id }
      const allFeatures = map.querySourceFeatures(SOURCE_ID, sourceOptions)
      if (allFeatures.length === 0) return

      // Prefer finest-resolution features (_scale ≤ 3) for statistics so
      // block-averaged means don't distort the distribution; fall back progressively.
      const fineFeatures = allFeatures.filter(f => {
        const s = f.properties?._scale
        return s == null || Number(s) <= 3
      })
      const features = fineFeatures.length >= 5 ? fineFeatures : allFeatures

      const { low, high } = percentileThresholds(
        features,
        variable.id,
        state.percentileRange.low,
        state.percentileRange.high,
      )

      // Apply percentile filter to each layer, preserving their _scale range conditions
      const pctFilter = (scaleExpr) => ['all',
        scaleExpr,
        ['>=', ['get', variable.id], low],
        ['<=', ['get', variable.id], high],
      ]
      if (map.getLayer(LAYER_ID_COARSE)) {
        map.setFilter(LAYER_ID_COARSE, pctFilter(
          ['>=', ['coalesce', ['to-number', ['get', '_scale']], 0], 10]
        ))
      }
      if (map.getLayer(LAYER_ID_MED)) {
        map.setFilter(LAYER_ID_MED, pctFilter(['all',
          ['>=', ['coalesce', ['to-number', ['get', '_scale']], 0], 3],
          ['<',  ['coalesce', ['to-number', ['get', '_scale']], 0], 10],
        ]))
      }
      if (map.getLayer(LAYER_ID_AGG)) {
        map.setFilter(LAYER_ID_AGG, pctFilter(
          ['<', ['coalesce', ['to-number', ['get', '_scale']], 5], 3]
        ))
      }
      if (map.getLayer(LAYER_ID)) {
        map.setFilter(LAYER_ID, ['<', ['coalesce', ['to-number', ['get', '_scale']], 5], 0])
      }

      // Compute mean / median for filtered features and bubble up to sidebar
      if (onFilterStats) {
        const values = features
          .map((f) => f.properties?.[variable.id])
          .filter((v) => v != null && !isNaN(v) && v >= low && v <= high)
        const totalValues = features
          .map((f) => f.properties?.[variable.id])
          .filter((v) => v != null && !isNaN(v))

        const mean = values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : null

        const sorted = [...values].sort((a, b) => a - b)
        const n = sorted.length
        const median = n > 0
          ? (n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)])
          : null

        onFilterStats({
          count: values.length,
          totalCount: totalValues.length,
          mean,
          median,
          allValues: totalValues,  // full unsorted array for distribution chart
        })
      }
    }

    // Try immediately — works if source is already loaded
    applyFilter()

    // Re-run once the source finishes loading (querySourceFeatures returns empty
    // until the GeoJSON/tile data has been parsed and loaded into the map)
    function onSourceData(e) {
      if (e.sourceId === SOURCE_ID && e.isSourceLoaded) applyFilter()
    }
    map.on('sourcedata', onSourceData)

    return () => {
      map.off('sourcedata', onSourceData)
    }
  }, [state.percentileRange, state.activeLayer, state.activeDimensions, config, mapReady, onFilterStats])

  // ── Graticule toggle ─────────────────────────────────────────────────────
  const handleGraticuleToggle = () => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const next = !graticuleVisible
    setGraticuleVisible_(next)
    applyGraticuleVisibility(map, next)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', flex: 1, height }}>
      {/* MapLibre container */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
        onClick={() => { if (state.methodsOpen) dispatch({ type: 'TOGGLE_METHODS' }) }}
      />

      {/* Map control buttons — upper right */}
      <style>{`
        .firemap-map-controls {
          position: absolute;
          top: 18px;
          right: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          z-index: 10;
        }
        @media (max-width: 767px) {
          .firemap-map-controls { top: 82px; }
        }
      `}</style>
      <div className='firemap-map-controls'>
        {/* Dark/light scheme toggle */}
        {onToggleScheme && (
          <button
            onClick={onToggleScheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.65)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              userSelect: 'none',
            }}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <SunIcon />
          </button>
        )}

        {/* Graticule / city labels toggle */}
        <button
          onClick={handleGraticuleToggle}
          title={graticuleVisible ? 'Hide city labels' : 'Show city labels'}
          style={{
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            color: isDark
              ? graticuleVisible ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)'
              : graticuleVisible ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.45)',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            userSelect: 'none',
          }}
          aria-pressed={graticuleVisible}
          aria-label='Toggle city labels'
        >
          <GlobeIcon />
        </button>
      </div>

      {/* Static attribution — replaces MapLibre's built-in control */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        right: 6,
        fontSize: 10,
        fontFamily: 'sans-serif',
        color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        © <a
          href='https://maplibre.org'
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'inherit', textDecoration: 'none', pointerEvents: 'auto' }}
        >MapLibre</a>
        {' · '}
        <a
          href='https://stadiamaps.com/attribution'
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'inherit', textDecoration: 'none', pointerEvents: 'auto' }}
        >Stadia Maps</a>
        {' · '}
        <a
          href='https://openmaptiles.org/attribution'
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'inherit', textDecoration: 'none', pointerEvents: 'auto' }}
        >OpenMapTiles</a>
        {' · '}
        <a
          href='https://www.openstreetmap.org/copyright'
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'inherit', textDecoration: 'none', pointerEvents: 'auto' }}
        >OpenStreetMap</a>
      </div>
    </div>
  )
}
