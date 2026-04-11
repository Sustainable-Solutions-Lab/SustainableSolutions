// IMPORTANT: pages/_app.js must import 'maplibre-gl/dist/maplibre-gl.css'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { basemapStyle } from './basemap-style.js'
import { addStaticLayers, setGraticuleVisible as applyGraticuleVisibility } from './static-layers.js'
import { useClickHandler } from './click-handler.js'
import { useMapLayer } from '../../lib/use-map-layer.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { percentileThresholds } from '../../lib/area-stats.js'

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
export function Map({ config, state, dispatch, height, onMapReady, onFilterStats }) {
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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(schemeRef.current),
      center: config.region.center,
      zoom: config.region.zoom,
      ...(config.region.bounds ? { bounds: config.region.bounds } : {}),
      // Allow zoom anywhere within CA but prevent panning far outside
      maxBounds: [-132, 26, -106, 48],
    })

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

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
  useMapLayer(mapReady ? mapRef.current : null, config, state)

  // ── Click handler ────────────────────────────────────────────────────────
  useClickHandler(mapReady ? mapRef.current : null, config, dispatch)

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
    if (!map.getLayer('firemap-cells')) return

    const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
    if (!variable || variable.type === 'categorical') return

    const features = map.querySourceFeatures('firemap-data')
    if (features.length === 0) return

    const { low, high } = percentileThresholds(
      features,
      variable.id,
      state.percentileRange.low,
      state.percentileRange.high,
    )

    map.setFilter('firemap-cells', [
      'all',
      ['>=', ['get', variable.id], low],
      ['<=', ['get', variable.id], high],
    ])

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
      })
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
      />

      {/* Graticule toggle button */}
      <button
        onClick={handleGraticuleToggle}
        title={graticuleVisible ? 'Hide grid' : 'Show grid'}
        style={{
          position: 'absolute',
          bottom: 80,
          right: 12,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: state.colorScheme === 'dark'
            ? 'rgba(26,26,26,0.85)'
            : 'rgba(255,255,255,0.9)',
          color: state.colorScheme === 'dark'
            ? graticuleVisible ? '#E55C2F' : '#f0ede8'
            : graticuleVisible ? '#C94A1A' : '#1a1a1a',
          border: state.colorScheme === 'dark'
            ? '1px solid rgba(255,255,255,0.15)'
            : '1px solid rgba(0,0,0,0.15)',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          zIndex: 10,
          userSelect: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
        aria-pressed={graticuleVisible}
        aria-label='Toggle lat/lon grid'
      >
        ⊞
      </button>
    </div>
  )
}
