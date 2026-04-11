/**
 * components/area-tool/index.js
 *
 * Circle-drawing area selection tool.
 * When active, the user clicks the map to set a center, drags to set a radius.
 * On mouseup, computes aggregate statistics for all visible features in the circle.
 *
 * Props:
 *   map:      MapLibre map instance (or null)
 *   config:   ProjectConfig
 *   state:    AppState   (reads: areaToolActive)
 *   dispatch: Dispatch
 */

import { useEffect } from 'react'
import { Actions } from '../../contracts/events.js'
import { haversineKm, featuresWithinCircle, computeAggregateStats } from '../../lib/area-stats.js'
import { LAYER_ID as FIREMAP_LAYER_ID } from '../../lib/use-map-layer.js'

const CIRCLE_SOURCE_ID = 'area-circle'
const CIRCLE_FILL_LAYER_ID = 'area-circle-fill'
const CIRCLE_LINE_LAYER_ID = 'area-circle-line'

/**
 * Generate a GeoJSON polygon approximating a circle with nPoints points.
 */
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
      paint: { 'fill-color': 'rgba(255,255,255,0.06)' },
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

export function AreaTool({ map, config, state, dispatch }) {
  // ── Enable/disable map drag-pan based on tool state ───────────────────────
  useEffect(() => {
    if (!map) return
    if (state.areaToolActive) {
      map.dragPan.disable()
      map.boxZoom.disable()
    } else {
      map.dragPan.enable()
      map.boxZoom.enable()
      removeCircleFromMap(map)
    }
    return () => {
      map.dragPan.enable()
      map.boxZoom.enable()
    }
  }, [map, state.areaToolActive])

  // ── Drawing interaction ───────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !state.areaToolActive) return

    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'

    let drawing = false
    let centerLat = null
    let centerLng = null

    function handleMouseDown(e) {
      // Only respond to left button
      if (e.originalEvent.button !== 0) return
      drawing = true
      centerLat = e.lngLat.lat
      centerLng = e.lngLat.lng
      // Prevent the event from triggering map pan
      e.preventDefault()
    }

    function handleMouseMove(e) {
      if (!drawing) return
      const radiusKm = haversineKm(centerLat, centerLng, e.lngLat.lat, e.lngLat.lng)
      if (radiusKm > 0.01) {
        drawCircleOnMap(map, centerLat, centerLng, radiusKm)
      }
    }

    function handleMouseUp(e) {
      if (!drawing) return
      drawing = false

      const radiusKm = haversineKm(centerLat, centerLng, e.lngLat.lat, e.lngLat.lng)
      if (radiusKm < 0.01) return

      // Build bounding box for queryRenderedFeatures
      const degPerKm = radiusKm / 111
      const ne = map.project([centerLng + degPerKm, centerLat + degPerKm])
      const sw = map.project([centerLng - degPerKm, centerLat - degPerKm])

      const features = map.queryRenderedFeatures([sw, ne], { layers: [FIREMAP_LAYER_ID] })
      const filtered = featuresWithinCircle(features, centerLat, centerLng, radiusKm)
      const aggregateStats = computeAggregateStats(filtered, config.areaTool.aggregateVariableIds)

      dispatch({ type: Actions.SET_DRAWN_CIRCLE, circle: { lat: centerLat, lng: centerLng, radiusKm } })
      dispatch({ type: Actions.SET_AGGREGATE_STATS, stats: aggregateStats })
    }

    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)

    return () => {
      canvas.style.cursor = ''
      map.off('mousedown', handleMouseDown)
      map.off('mousemove', handleMouseMove)
      map.off('mouseup', handleMouseUp)
    }
  }, [map, state.areaToolActive, config, dispatch])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (map) removeCircleFromMap(map)
    }
  }, [map])

  return null
}
