/**
 * components/area-tool/index.js
 *
 * Regional Data tool — creates a resizable circle at the current map center.
 *
 * Behavior:
 *   - Activates when state.areaToolActive === true
 *   - Immediately places a circle at the map's current center
 *   - Map panning and zooming are always available
 *   - A small handle on the east edge of the circle can be dragged to resize
 *   - Stats are computed from visible features inside the circle
 *
 * Must be rendered INSIDE the map container div (position: relative) so
 * the handle can use position: absolute in map-pixel coordinates.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { Actions } from '../../contracts/events.js'
import { haversineKm, featuresWithinCircle, computeAggregateStats } from '../../lib/area-stats.js'
import { LAYER_ID as FIREMAP_LAYER_ID } from '../../lib/use-map-layer.js'

const CIRCLE_SOURCE_ID = 'area-circle'
const CIRCLE_FILL_LAYER_ID = 'area-circle-fill'
const CIRCLE_LINE_LAYER_ID = 'area-circle-line'
const DEFAULT_RADIUS_KM = 50
const MIN_RADIUS_KM = 5
const HANDLE_PX = 8  // handle circle radius in pixels

// ── Map rendering helpers ─────────────────────────────────────────────────────

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
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  }
}

function drawCircleOnMap(map, lat, lng, radiusKm) {
  const geojson = {
    type: 'FeatureCollection',
    features: [circleToGeoJSON(lat, lng, radiusKm)],
  }

  if (map.getSource(CIRCLE_SOURCE_ID)) {
    map.getSource(CIRCLE_SOURCE_ID).setData(geojson)
  } else {
    map.addSource(CIRCLE_SOURCE_ID, { type: 'geojson', data: geojson })
  }

  if (!map.getLayer(CIRCLE_FILL_LAYER_ID)) {
    map.addLayer({
      id: CIRCLE_FILL_LAYER_ID,
      type: 'fill',
      source: CIRCLE_SOURCE_ID,
      paint: { 'fill-color': 'rgba(255,255,255,0.05)' },
    })
  }
  if (!map.getLayer(CIRCLE_LINE_LAYER_ID)) {
    map.addLayer({
      id: CIRCLE_LINE_LAYER_ID,
      type: 'line',
      source: CIRCLE_SOURCE_ID,
      paint: {
        'line-color': '#E55C2F',
        'line-width': 1.5,
        'line-dasharray': [3, 2],
      },
    })
  }
}

function removeCircleFromMap(map) {
  if (map.getLayer(CIRCLE_LINE_LAYER_ID)) map.removeLayer(CIRCLE_LINE_LAYER_ID)
  if (map.getLayer(CIRCLE_FILL_LAYER_ID)) map.removeLayer(CIRCLE_FILL_LAYER_ID)
  if (map.getSource(CIRCLE_SOURCE_ID)) map.removeSource(CIRCLE_SOURCE_ID)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AreaTool({ map, config, state, dispatch }) {
  // Screen coordinates of the resize handle (east edge of circle)
  const [handlePos, setHandlePos] = useState(null)

  // The circle's geographic state — kept in a ref so event handlers don't stale-close
  const circleRef = useRef({ lat: 0, lng: 0, radiusKm: DEFAULT_RADIUS_KM })

  // ── Compute east-edge handle screen position ────────────────────────────
  const updateHandlePos = useCallback(() => {
    if (!map) return
    const { lat, lng, radiusKm } = circleRef.current
    // Longitude offset of the east edge
    const dLng =
      ((radiusKm / 6371) * (180 / Math.PI)) /
      Math.cos((lat * Math.PI) / 180)
    const pt = map.project([lng + dLng, lat])
    setHandlePos({ x: pt.x, y: pt.y })
  }, [map])

  // ── Query visible features and dispatch stats ───────────────────────────
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

    const features = map.queryRenderedFeatures(bbox, { layers: [FIREMAP_LAYER_ID] })
    const filtered = featuresWithinCircle(features, lat, lng, radiusKm)
    const stats = computeAggregateStats(filtered, config.areaTool.aggregateVariableIds)

    dispatch({ type: Actions.SET_DRAWN_CIRCLE, circle: { lat, lng, radiusKm } })
    dispatch({ type: Actions.SET_AGGREGATE_STATS, stats })
  }, [map, config, dispatch])

  // ── Activate / deactivate ───────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!state.areaToolActive) {
      removeCircleFromMap(map)
      setHandlePos(null)
      return
    }

    // Place circle at current map center
    const center = map.getCenter()
    circleRef.current = { lat: center.lat, lng: center.lng, radiusKm: DEFAULT_RADIUS_KM }
    drawCircleOnMap(map, center.lat, center.lng, DEFAULT_RADIUS_KM)
    updateHandlePos()

    // Compute initial stats after the map has rendered the new source
    const t = setTimeout(computeAndDispatch, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.areaToolActive])

  // ── Keep handle in sync with map pan/zoom ───────────────────────────────
  useEffect(() => {
    if (!map || !state.areaToolActive) return
    map.on('move', updateHandlePos)
    map.on('zoom', updateHandlePos)
    return () => {
      map.off('move', updateHandlePos)
      map.off('zoom', updateHandlePos)
    }
  }, [map, state.areaToolActive, updateHandlePos])

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (map) removeCircleFromMap(map) }
  }, [map])

  // ── Handle drag (resize) ────────────────────────────────────────────────
  const onHandleMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()

    const onMouseMove = (evt) => {
      if (!map) return
      const rect = map.getCanvas().getBoundingClientRect()
      const lngLat = map.unproject([evt.clientX - rect.left, evt.clientY - rect.top])
      const { lat, lng } = circleRef.current
      const newRadius = haversineKm(lat, lng, lngLat.lat, lngLat.lng)
      if (newRadius >= MIN_RADIUS_KM) {
        circleRef.current = { lat, lng, radiusKm: newRadius }
        drawCircleOnMap(map, lat, lng, newRadius)
        updateHandlePos()
      }
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      computeAndDispatch()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [map, updateHandlePos, computeAndDispatch])

  if (!state.areaToolActive || !handlePos) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
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
          background: '#E55C2F',
          border: '2px solid rgba(255,255,255,0.9)',
          cursor: 'ew-resize',
          pointerEvents: 'auto',
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  )
}
