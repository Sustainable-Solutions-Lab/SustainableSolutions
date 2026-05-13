/**
 * components/area-tool/index.jsx
 *
 * Regional Data tool — resizable circle anchored to a lat/lng.
 *
 * Interactions:
 *   - Activate: circle appears at current map center (50 km default radius)
 *   - Cursor inside circle + drag  → moves the circle geographically
 *   - Cursor outside circle + drag → normal map pan (MapLibre handles it)
 *   - White/gray handle on east edge → drag to resize; diameter shown while dragging
 *   - Deactivate via StatsPanel × or sidebar "Regional Data" click
 *
 * Circle style: solid line, white in dark mode / dark gray in light mode.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { Actions } from '../../contracts/events.js'
import {
  haversineKm,
  featuresWithinCircle,
  featuresWithinPolygon,
  computeAggregateStats,
} from '../../lib/area-stats.js'
import { LAYER_IDS } from '../../lib/use-map-layer.js'
import { justAirLayerIds } from '../../lib/use-just-air-layers.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'

// Layer IDs that currently render data on the map. The area tool's
// queryRenderedFeatures call needs whichever set is live so the per-circle
// / per-polygon aggregates pull the right features. Each project's render
// hook produces a different set of layer ids; we union the three known
// shapes here so the area tool stays project-agnostic.
function dataLayerIds(config) {
  if (config.scales && config.scales.length > 0) {
    return justAirLayerIds(config)
  }
  if (config.tileSources && config.tileSources.length > 0) {
    return config.tileSources.map((ts) => `${ts.id}-fill`)
  }
  return LAYER_IDS
}

const CIRCLE_SOURCE_ID = 'area-circle'
const CIRCLE_MASK_LAYER_ID = 'area-circle-mask'
const CIRCLE_FILL_LAYER_ID = 'area-circle-fill'
const CIRCLE_LINE_LAYER_ID = 'area-circle-line'
const POLYGON_SOURCE_ID = 'area-polygon'
const POLYGON_MASK_LAYER_ID = 'area-polygon-mask'
const POLYGON_LINE_LAYER_ID = 'area-polygon-line'
const MIN_RADIUS_KM = 5
const HANDLE_PX = 8

// ── Map rendering helpers ─────────────────────────────────────────────────────

function circleLineColor(isDark) {
  return isDark ? 'rgba(255,255,255,0.85)' : 'rgba(50,50,50,0.65)'
}

function circleToGeoJSON(lat, lng, radiusKm, nPoints = 64) {
  const coords = []
  for (let i = 0; i <= nPoints; i++) {
    const angle = (i / nPoints) * 2 * Math.PI
    const dLat = (radiusKm / 6371) * (180 / Math.PI) * Math.cos(angle)
    const dLng =
      ((radiusKm / 6371) * (180 / Math.PI) * Math.sin(angle)) /
      Math.cos((lat * Math.PI) / 180)
    coords.push([lng + dLng, lat + dLat])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }
}

// World polygon with a circular hole — dims everything outside the selection circle.
// Outer ring covers the whole world; inner ring (reversed winding) punches the hole.
function worldWithHole(circlePoly) {
  const world = [[-180, -89], [180, -89], [180, 89], [-180, 89], [-180, -89]]
  const hole  = [...circlePoly.geometry.coordinates[0]].reverse()
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [world, hole] },
    properties: { _mask: 1 },
  }
}

function drawCircleOnMap(map, lat, lng, radiusKm, isDark = true) {
  const circlePoly = circleToGeoJSON(lat, lng, radiusKm)
  const geojson = {
    type: 'FeatureCollection',
    features: [circlePoly, worldWithHole(circlePoly)],
  }
  const lineColor = circleLineColor(isDark)

  if (map.getSource(CIRCLE_SOURCE_ID)) {
    map.getSource(CIRCLE_SOURCE_ID).setData(geojson)
  } else {
    map.addSource(CIRCLE_SOURCE_ID, { type: 'geojson', data: geojson })
  }

  // Dim mask — world-with-hole polygon tagged with _mask=1 dims everything outside circle
  if (!map.getLayer(CIRCLE_MASK_LAYER_ID)) {
    map.addLayer({
      id: CIRCLE_MASK_LAYER_ID,
      type: 'fill',
      source: CIRCLE_SOURCE_ID,
      filter: ['==', ['get', '_mask'], 1],
      paint: { 'fill-color': isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.30)' },
    })
  } else {
    map.setPaintProperty(CIRCLE_MASK_LAYER_ID, 'fill-color',
      isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.30)')
  }

  if (!map.getLayer(CIRCLE_LINE_LAYER_ID)) {
    map.addLayer({
      id: CIRCLE_LINE_LAYER_ID,
      type: 'line',
      source: CIRCLE_SOURCE_ID,
      paint: { 'line-color': lineColor, 'line-width': 1.5 },
    })
  } else {
    map.setPaintProperty(CIRCLE_LINE_LAYER_ID, 'line-color', lineColor)
  }
}

function removeCircleFromMap(map) {
  if (map.getLayer(CIRCLE_LINE_LAYER_ID)) map.removeLayer(CIRCLE_LINE_LAYER_ID)
  if (map.getLayer(CIRCLE_MASK_LAYER_ID)) map.removeLayer(CIRCLE_MASK_LAYER_ID)
  if (map.getSource(CIRCLE_SOURCE_ID)) map.removeSource(CIRCLE_SOURCE_ID)
}

// ── Polygon (ZIP) rendering ─────────────────────────────────────────────────

// World-with-hole for an arbitrary polygon. Adds the polygon's outer ring
// (and any holes) as inner rings of a world rectangle, so everything outside
// the polygon gets dimmed.
function worldWithPolygonHole(geometry) {
  const world = [
    [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
  ]
  let innerRings = []
  if (geometry.type === 'Polygon') {
    innerRings = geometry.coordinates.map((ring) => [...ring].reverse())
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) innerRings.push([...ring].reverse())
    }
  }
  return {
    type: 'Feature',
    properties: { _mask: 1 },
    geometry: { type: 'Polygon', coordinates: [world, ...innerRings] },
  }
}

function drawPolygonOnMap(map, geometry, isDark = true) {
  const poly = { type: 'Feature', properties: {}, geometry }
  const geojson = { type: 'FeatureCollection', features: [poly, worldWithPolygonHole(geometry)] }
  const lineColor = circleLineColor(isDark)

  if (map.getSource(POLYGON_SOURCE_ID)) {
    map.getSource(POLYGON_SOURCE_ID).setData(geojson)
  } else {
    map.addSource(POLYGON_SOURCE_ID, { type: 'geojson', data: geojson })
  }

  if (!map.getLayer(POLYGON_MASK_LAYER_ID)) {
    map.addLayer({
      id: POLYGON_MASK_LAYER_ID,
      type: 'fill',
      source: POLYGON_SOURCE_ID,
      filter: ['==', ['get', '_mask'], 1],
      paint: { 'fill-color': isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.30)' },
    })
  } else {
    map.setPaintProperty(POLYGON_MASK_LAYER_ID, 'fill-color',
      isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.30)')
  }

  if (!map.getLayer(POLYGON_LINE_LAYER_ID)) {
    map.addLayer({
      id: POLYGON_LINE_LAYER_ID,
      type: 'line',
      source: POLYGON_SOURCE_ID,
      paint: { 'line-color': lineColor, 'line-width': 1.5 },
    })
  } else {
    map.setPaintProperty(POLYGON_LINE_LAYER_ID, 'line-color', lineColor)
  }
}

function removePolygonFromMap(map) {
  if (map.getLayer(POLYGON_LINE_LAYER_ID)) map.removeLayer(POLYGON_LINE_LAYER_ID)
  if (map.getLayer(POLYGON_MASK_LAYER_ID)) map.removeLayer(POLYGON_MASK_LAYER_ID)
  if (map.getSource(POLYGON_SOURCE_ID)) map.removeSource(POLYGON_SOURCE_ID)
}

// Compute [west, south, east, north] for a Polygon or MultiPolygon geometry.
function polygonBbox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (geometry.type === 'Polygon') geometry.coordinates.forEach(visit)
  else if (geometry.type === 'MultiPolygon')
    geometry.coordinates.forEach((poly) => poly.forEach(visit))
  return [minX, minY, maxX, maxY]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AreaTool({ map, config, state, dispatch }) {
  const [handlePos, setHandlePos] = useState(null)
  const [resizeDiameterKm, setResizeDiameterKm] = useState(null)

  const circleRef = useRef({ lat: 0, lng: 0, radiusKm: 50 })
  // Refs so callbacks read current values without stale closure issues
  const stateRef = useRef(state)
  stateRef.current = state
  const isDarkRef = useRef(state.colorScheme === 'dark')
  isDarkRef.current = state.colorScheme === 'dark'

  // ── Handle screen position ────────────────────────────────────────────────
  const updateHandlePos = useCallback(() => {
    if (!map) return
    const { lat, lng, radiusKm } = circleRef.current
    const dLng = ((radiusKm / 6371) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180)
    const pt = map.project([lng + dLng, lat])
    setHandlePos({ x: pt.x, y: pt.y })
  }, [map])

  // ── Compute stats and dispatch ────────────────────────────────────────────
  const computeAndDispatch = useCallback(() => {
    if (!map) return
    const { lat, lng, radiusKm } = circleRef.current
    const degPerKm = radiusKm / 111
    const pad = degPerKm * 1.4
    const p1 = map.project([lng + pad, lat + pad])
    const p2 = map.project([lng - pad, lat - pad])
    const bbox = [
      [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
      [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
    ]
    const activeLayers = dataLayerIds(config).filter((id) => map.getLayer(id))
    const features = map.queryRenderedFeatures(bbox, { layers: activeLayers })
    const filtered = featuresWithinCircle(features, lat, lng, radiusKm)

    // Stats for preset aggregate variables
    const stats = computeAggregateStats(filtered, config.areaTool.aggregateVariableIds)

    // Also collect raw values for the active variable (for the histogram in StatsPanel)
    const currentState = stateRef.current
    const activeVar = getActiveVariable(
      config,
      currentState.activeLayer,
      currentState.activeDimensions
    )
    const activeVarValues = activeVar
      ? filtered
          .map((f) => f.properties?.[activeVar.id])
          .filter((v) => {
            if (v == null) return false
            // Keep string values for categorical variables; filter NaN for numeric
            return activeVar.type === 'categorical' ? true : !isNaN(v)
          })
      : []

    dispatch({ type: Actions.SET_DRAWN_CIRCLE, circle: { lat, lng, radiusKm } })
    dispatch({
      type: Actions.SET_AGGREGATE_STATS,
      stats: { ...stats, activeVarValues },
    })
  }, [map, config, dispatch])

  // ── Re-compute stats when active variable changes ────────────────────────
  // (e.g. switching to "Cheapest Type" while the circle is open)
  useEffect(() => {
    if (!map || !state.areaToolActive) return
    if (state.drawnPolygon) return  // polygon path computes via its own effect
    const t = setTimeout(computeAndDispatch, 50)
    return () => clearTimeout(t)
  }, [map, state.areaToolActive, state.activeLayer, state.activeDimensions, computeAndDispatch, state.drawnPolygon])

  // ── Polygon (ZIP) path ─────────────────────────────────────────────────
  const computePolygonStats = useCallback(() => {
    if (!map || !state.drawnPolygon) return
    const geometry = state.drawnPolygon.geometry
    const [w, s, e, n] = polygonBbox(geometry)
    const sw = map.project([w, s])
    const ne = map.project([e, n])
    const bbox = [
      [Math.min(sw.x, ne.x), Math.min(sw.y, ne.y)],
      [Math.max(sw.x, ne.x), Math.max(sw.y, ne.y)],
    ]
    const activeLayers = dataLayerIds(config).filter((id) => map.getLayer(id))
    const features = map.queryRenderedFeatures(bbox, { layers: activeLayers })
    const filtered = featuresWithinPolygon(features, geometry)
    const stats = computeAggregateStats(filtered, config.areaTool.aggregateVariableIds)
    const activeVar = getActiveVariable(config, state.activeLayer, state.activeDimensions)
    const activeVarValues = activeVar
      ? filtered
          .map((f) => f.properties?.[activeVar.id])
          .filter((v) => v != null && (activeVar.type === 'categorical' ? true : !isNaN(v)))
      : []
    dispatch({
      type: Actions.SET_AGGREGATE_STATS,
      stats: { ...stats, activeVarValues },
    })
  }, [map, config, dispatch, state.drawnPolygon, state.activeLayer, state.activeDimensions])

  // Render polygon + zoom to fit + compute stats when drawnPolygon changes.
  useEffect(() => {
    if (!map) return
    if (!state.drawnPolygon) {
      removePolygonFromMap(map)
      return
    }
    // Drawing a polygon implies the circle path is gone — strip its layers.
    removeCircleFromMap(map)
    setHandlePos(null)
    drawPolygonOnMap(map, state.drawnPolygon.geometry, state.colorScheme === 'dark')
    const [w, s, e, n] = polygonBbox(state.drawnPolygon.geometry)
    map.fitBounds([[w, s], [e, n]], { padding: 60, duration: 600, maxZoom: 11 })
    // Recompute after the fit lands so queryRenderedFeatures sees the new view.
    const t = setTimeout(computePolygonStats, 700)
    return () => clearTimeout(t)
  }, [map, state.drawnPolygon, state.colorScheme, computePolygonStats])

  // Re-run polygon stats when active variable changes
  useEffect(() => {
    if (!map || !state.drawnPolygon) return
    const t = setTimeout(computePolygonStats, 50)
    return () => clearTimeout(t)
  }, [map, state.drawnPolygon, state.activeLayer, state.activeDimensions, computePolygonStats])

  // ── Re-draw circle when color scheme changes ─────────────────────────────
  useEffect(() => {
    if (!map || !state.areaToolActive) return
    if (!map.getLayer(CIRCLE_LINE_LAYER_ID)) return
    map.setPaintProperty(
      CIRCLE_LINE_LAYER_ID,
      'line-color',
      circleLineColor(state.colorScheme === 'dark')
    )
  }, [map, state.colorScheme, state.areaToolActive])

  // ── Activate / deactivate ─────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!state.areaToolActive) {
      removeCircleFromMap(map)
      removePolygonFromMap(map)
      setHandlePos(null)
      map.getCanvas().style.cursor = ''
      dispatch({ type: Actions.SET_AGGREGATE_STATS, stats: null })
      return
    }
    // If a ZIP polygon is currently active, skip the default-circle init.
    // When the polygon is cleared (e.g., user clicks the X in the ZIP input),
    // this effect re-runs without an active polygon and initializes a circle.
    if (state.drawnPolygon) return
    if (map.getLayer(CIRCLE_LINE_LAYER_ID)) return  // circle already drawn
    const center = map.getCenter()
    // Scale default radius so the circle is a useful ~12 % of the smaller
    // viewport dimension. Without this the circle is sub-pixel at low zoom
    // (50 km at z3 ≈ 0.6 px on a CONUS-spanning view) or fills the screen
    // at high zoom. Honors config.areaTool.defaultRadiusKm as an explicit
    // cap so projects can keep the default reasonable for their scale.
    const zoom = map.getZoom()
    const lat = center.lat * Math.PI / 180
    const kmPerPx = (40075 * Math.cos(lat)) / (256 * Math.pow(2, zoom))
    const canvas = map.getCanvas()
    const targetPx = Math.min(canvas.width, canvas.height) * 0.12
    const computedKm = Math.max(MIN_RADIUS_KM, Math.round(targetPx * kmPerPx))
    const configCapKm = config.areaTool?.maxRadiusKm ?? 600
    const radiusKm = Math.min(computedKm, configCapKm)
    circleRef.current = { lat: center.lat, lng: center.lng, radiusKm }
    drawCircleOnMap(map, center.lat, center.lng, radiusKm, isDarkRef.current)
    updateHandlePos()
    const timer = setTimeout(computeAndDispatch, 150)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.areaToolActive, state.drawnPolygon, dispatch])

  // ── Keep handle in sync with map pan / zoom ───────────────────────────────
  useEffect(() => {
    if (!map || !state.areaToolActive) return
    map.on('move', updateHandlePos)
    map.on('zoom', updateHandlePos)
    return () => {
      map.off('move', updateHandlePos)
      map.off('zoom', updateHandlePos)
    }
  }, [map, state.areaToolActive, updateHandlePos])

  // ── Cursor tracking + circle-drag (capture-phase to beat dragPan) ─────────
  useEffect(() => {
    if (!map || !state.areaToolActive) return

    const canvas = map.getCanvas()
    let movingCircle = false

    function onMapMouseMove(e) {
      if (movingCircle) return
      const { lat, lng, radiusKm } = circleRef.current
      const dist = haversineKm(lat, lng, e.lngLat.lat, e.lngLat.lng)
      canvas.style.cursor = dist <= radiusKm ? 'grab' : ''
    }

    function onCanvasMouseDown(e) {
      if (e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      const lngLat = map.unproject([e.clientX - rect.left, e.clientY - rect.top])
      const { lat, lng, radiusKm } = circleRef.current
      const dist = haversineKm(lat, lng, lngLat.lat, lngLat.lng)

      if (dist > radiusKm) return

      e.stopPropagation()
      movingCircle = true
      canvas.style.cursor = 'grabbing'

      const startLat = lngLat.lat
      const startLng = lngLat.lng
      const origLat = lat
      const origLng = lng

      function onDocMouseMove(evt) {
        const r = canvas.getBoundingClientRect()
        const cur = map.unproject([evt.clientX - r.left, evt.clientY - r.top])
        const newLat = origLat + (cur.lat - startLat)
        const newLng = origLng + (cur.lng - startLng)
        circleRef.current = { ...circleRef.current, lat: newLat, lng: newLng }
        drawCircleOnMap(map, newLat, newLng, circleRef.current.radiusKm, isDarkRef.current)
        updateHandlePos()
      }

      function onDocMouseUp() {
        movingCircle = false
        canvas.style.cursor = 'grab'
        document.removeEventListener('mousemove', onDocMouseMove)
        document.removeEventListener('mouseup', onDocMouseUp)
        setTimeout(computeAndDispatch, 50)
      }

      document.addEventListener('mousemove', onDocMouseMove)
      document.addEventListener('mouseup', onDocMouseUp)
    }

    map.on('mousemove', onMapMouseMove)
    canvas.addEventListener('mousedown', onCanvasMouseDown, { capture: true })

    return () => {
      map.off('mousemove', onMapMouseMove)
      canvas.removeEventListener('mousedown', onCanvasMouseDown, { capture: true })
      canvas.style.cursor = ''
    }
  }, [map, state.areaToolActive, updateHandlePos, computeAndDispatch])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (map) removeCircleFromMap(map) }
  }, [map])

  // ── Resize handle drag ────────────────────────────────────────────────────
  const onHandleMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const canvas = map.getCanvas()

    const onMouseMove = (evt) => {
      const rect = canvas.getBoundingClientRect()
      const lngLat = map.unproject([evt.clientX - rect.left, evt.clientY - rect.top])
      const { lat, lng } = circleRef.current
      const newRadius = haversineKm(lat, lng, lngLat.lat, lngLat.lng)
      if (newRadius >= MIN_RADIUS_KM) {
        circleRef.current = { lat, lng, radiusKm: newRadius }
        drawCircleOnMap(map, lat, lng, newRadius, isDarkRef.current)
        updateHandlePos()
        setResizeDiameterKm((newRadius * 2).toFixed(0))
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      setResizeDiameterKm(null)
      computeAndDispatch()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [map, updateHandlePos, computeAndDispatch])

  if (!state.areaToolActive || !handlePos) return null

  const handleColor = state.colorScheme === 'dark' ? 'rgba(255,255,255,0.85)' : 'rgba(50,50,50,0.65)'
  const handleBorder = state.colorScheme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.7)'

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {/* Resize handle */}
      <div
        onMouseDown={onHandleMouseDown}
        title='Drag to resize'
        style={{
          position: 'absolute',
          left: handlePos.x - HANDLE_PX,
          top: handlePos.y - HANDLE_PX,
          width: HANDLE_PX * 2,
          height: HANDLE_PX * 2,
          borderRadius: '50%',
          background: handleColor,
          border: `2px solid ${handleBorder}`,
          cursor: 'ew-resize',
          pointerEvents: 'auto',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />

      {/* Diameter label — visible only while resizing */}
      {resizeDiameterKm !== null && (
        <div
          style={{
            position: 'absolute',
            left: handlePos.x + 14,
            top: handlePos.y - 9,
            background: 'rgba(0,0,0,0.6)',
            color: '#F8F8E8',
            padding: '2px 7px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
          }}
        >
          {resizeDiameterKm} km ⌀
        </div>
      )}
    </div>
  )
}
