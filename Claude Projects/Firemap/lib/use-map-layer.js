/**
 * lib/use-map-layer.js
 *
 * React hook: reactively adds/updates a PMTiles or GeoJSON circle layer on the
 * MapLibre map. Uses a ref to always have the latest variable without stale closures,
 * and re-adds layers after setStyle() via the styledata event.
 */

import { useEffect, useRef } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

export const SOURCE_ID = 'firemap-data'
export const LAYER_ID = 'firemap-cells'

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 */
export function useMapLayer(map, config, state) {
  const isPlaceholder = config.tilesUrl === 'REPLACE_WITH_R2_URL'

  // Keep the latest resolved variable in a ref so the styledata handler never
  // captures a stale closure value.
  const variableRef = useRef(null)
  variableRef.current = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  // ── Source / layer lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const sourceConfig = isPlaceholder
      ? { type: 'geojson', data: '/fuel-treatment.geojson' }
      : { type: 'vector', url: `pmtiles://${config.tilesUrl}` }

    function addLayers() {
      // Guard: style must be fully loaded before adding sources/layers
      if (!map.isStyleLoaded()) return
      // If source already exists the layers are present — just refresh paint
      if (map.getSource(SOURCE_ID)) {
        updatePaint()
        return
      }

      map.addSource(SOURCE_ID, sourceConfig)

      const layerSpec = {
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          // Radius interpolates exponentially with zoom for CarbonPlan-style cells
          'circle-radius': [
            'interpolate', ['exponential', 2], ['zoom'],
            4, 2,
            7, 2.5,
            9, 5,
            11, 14,
            13, 40,
          ],
          'circle-color': variableRef.current
            ? buildPaintExpression(variableRef.current)
            : '#888888',
          'circle-opacity': 0.9,
          'circle-stroke-width': 0,
        },
      }

      // PMTiles vector source requires source-layer; GeoJSON does not
      if (!isPlaceholder) {
        layerSpec['source-layer'] = config.id
      }

      // Insert below county-borders so county lines render on top of cells
      const before = map.getLayer('county-borders') ? 'county-borders' : undefined
      map.addLayer(layerSpec, before)
    }

    function updatePaint() {
      if (!map.getLayer(LAYER_ID)) return
      const variable = variableRef.current
      if (!variable || variable.type === 'categorical') return
      map.setPaintProperty(LAYER_ID, 'circle-color', buildPaintExpression(variable))
    }

    // Add immediately if style is ready, otherwise wait for styledata
    if (map.isStyleLoaded()) {
      addLayers()
    }

    // Re-add after every setStyle() call (which removes all custom layers)
    map.on('styledata', addLayers)

    return () => {
      map.off('styledata', addLayers)
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Paint expression update when active variable changes ──────────────────
  useEffect(() => {
    if (!map) return
    if (!map.isStyleLoaded() || !map.getLayer(LAYER_ID)) return

    const variable = variableRef.current
    if (!variable || variable.type === 'categorical') return

    map.setPaintProperty(LAYER_ID, 'circle-color', buildPaintExpression(variable))
  }, [map, config, state.activeLayer, state.activeDimensions])
}

/**
 * Build a MapLibre GL interpolate expression mapping property values to colors.
 * @param {import('../contracts/project-config').Variable} variable
 * @returns {Array} MapLibre expression
 */
function buildPaintExpression(variable) {
  if (!variable || variable.type === 'categorical') return '#888888'

  const scale = buildColorScale(variable)
  const { min, max } = variable.domain
  const steps = 24
  const expression = ['interpolate', ['linear'], ['get', variable.id]]

  for (let i = 0; i <= steps; i++) {
    const value = min + (i / steps) * (max - min)
    expression.push(value, scale(value))
  }

  return expression
}
