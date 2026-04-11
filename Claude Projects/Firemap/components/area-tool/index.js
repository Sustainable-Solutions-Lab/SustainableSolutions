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

const CIRCLE_SOURCE_ID = 'area-circle'
const CIRCLE_FILL_LAYER_ID = 'area-circle-fill'
const CIRCLE_LINE_LAYER_ID = 'area-circle-line'
const FIREMAP_LAYER_ID = 'firemap-cells'

/**
 * Generate a GeoJSON polygon approximating a circle with nPoints points.
 * @param {number} lat       - center latitude
 * @param {number} lng       - center longitude
 * @param {number} radiusKm  - radius in km
 * @param {number} [nPoints] - number of polygon vertices (default 64)
 * @returns {GeoJSON Feature}
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

/**
 * Add or update the circle GeoJSON source and fill/line layers on the map.
 * @param {import('maplibre-gl').Map} map
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 */
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
      paint: {
        'fill-color': 'rgba(255,255,255,0.08)',
      },
    })
  }

  if (!map.getLayer(CIRCLE_LINE_LAYER_ID)) {
    map.addLayer({
      id: CIRCLE_LINE_LAYER_ID,
      type: 'line',
      source: CIRCLE_SOURCE_ID,
      paint: {
        'line-color': '#E55C2F',
        'line-width': 2,
        'line-dasharray': [3, 2],
      },
    })
  }
}

/**
 * Remove circle layers and source from the map if they exist.
 * @param {import('maplibre-gl').Map} map
 */
function removeCircleFromMap(map) {
  if (map.getLayer(CIRCLE_LINE_LAYER_ID)) map.removeLayer(CIRCLE_LINE_LAYER_ID)
  if (map.getLayer(CIRCLE_FILL_LAYER_ID)) map.removeLayer(CIRCLE_FILL_LAYER_ID)
  if (map.getSource(CIRCLE_SOURCE_ID)) map.removeSource(CIRCLE_SOURCE_ID)
}

export function AreaTool({ map, config, state, dispatch }) {
  // ── Clean up when tool is deactivated ────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!state.areaToolActive) {
      removeCircleFromMap(map)
    }
  }, [map, state.areaToolActive])

  // ── Main drawing interaction ──────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!state.areaToolActive) return

    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'

    let drawing = false
    let centerLat = null
    let centerLng = null

    function handleMouseDown(e) {
      drawing = true
      centerLat = e.lngLat.lat
      centerLng = e.lngLat.lng
    }

    function handleMouseMove(e) {
      if (!drawing) return
      const currentLat = e.lngLat.lat
      const currentLng = e.lngLat.lng
      const radiusKm = haversineKm(centerLat, centerLng, currentLat, currentLng)
      if (radiusKm > 0) {
        drawCircleOnMap(map, centerLat, centerLng, radiusKm)
      }
    }

    function handleMouseUp(e) {
      if (!drawing) return
      drawing = false

      const currentLat = e.lngLat.lat
      const currentLng = e.lngLat.lng
      const radiusKm = haversineKm(centerLat, centerLng, currentLat, currentLng)

      // Guard against zero-radius clicks (no drag)
      if (radiusKm < 0.01) return

      // Build pixel bounding box from geographic extent
      const ne = map.project([centerLng + radiusKm / 111, centerLat + radiusKm / 111])
      const sw = map.project([centerLng - radiusKm / 111, centerLat - radiusKm / 111])
      const bbox = [sw, ne]

      // Query rendered features within the bounding box
      const features = map.queryRenderedFeatures(bbox, { layers: [FIREMAP_LAYER_ID] })

      // Spatial filter: keep only features inside the circle
      const filtered = featuresWithinCircle(features, centerLat, centerLng, radiusKm)

      // Compute aggregate stats
      const aggregateStats = computeAggregateStats(
        filtered,
        config.areaTool.aggregateVariableIds
      )

      // Dispatch results
      dispatch({
        type: Actions.SET_DRAWN_CIRCLE,
        circle: { lat: centerLat, lng: centerLng, radiusKm },
      })
      dispatch({
        type: Actions.SET_AGGREGATE_STATS,
        stats: aggregateStats,
      })
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
