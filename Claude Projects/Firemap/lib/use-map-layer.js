/**
 * lib/use-map-layer.js
 *
 * React hook: reactively adds/updates a PMTiles or GeoJSON circle layer on the
 * MapLibre map.  Rebuilds the paint expression whenever the active variable
 * changes (derived from state.activeLayer + state.activeDimensions).
 */

import { useEffect } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

const SOURCE_ID = 'firemap-data'
const LAYER_ID = 'firemap-cells'

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 */
export function useMapLayer(map, config, state) {
  const isPlaceholder = config.tilesUrl === 'REPLACE_WITH_R2_URL'

  // ── Add source + layer on mount, clean up on unmount ───────────────────────
  useEffect(() => {
    if (!map) return

    const sourceConfig = isPlaceholder
      ? { type: 'geojson', data: '/fuel-treatment.geojson' }
      : { type: 'vector', url: `pmtiles://${config.tilesUrl}` }

    const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)

    function addLayers() {
      if (map.getSource(SOURCE_ID)) return  // already added

      map.addSource(SOURCE_ID, sourceConfig)

      const layerSpec = {
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            5, 2,
            10, 6,
          ],
          'circle-color': variable
            ? buildPaintExpression(variable)
            : '#888888',
          'circle-opacity': 0.85,
        },
      }

      // PMTiles vector tiles require source-layer; GeoJSON does not
      if (!isPlaceholder) {
        layerSpec['source-layer'] = config.id
      }

      map.addLayer(layerSpec)
    }

    if (map.isStyleLoaded()) {
      addLayers()
    } else {
      map.once('load', addLayers)
    }

    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Update paint expression when the active variable changes ───────────────
  useEffect(() => {
    if (!map) return
    if (!map.isStyleLoaded() || !map.getLayer(LAYER_ID)) return

    const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
    if (!variable || variable.type === 'categorical') return

    map.setPaintProperty(LAYER_ID, 'circle-color', buildPaintExpression(variable))
  }, [map, config, state.activeLayer, state.activeDimensions])
}

/**
 * Build a MapLibre GL interpolate expression that maps feature property values
 * to colors using the variable's color scale.
 *
 * @param {import('../contracts/project-config').Variable} variable
 * @returns {Array} MapLibre expression
 */
function buildPaintExpression(variable) {
  if (variable.type === 'categorical') return '#888888'

  const scale = buildColorScale(variable)
  const { min, max } = variable.domain
  const steps = 20
  const expression = ['interpolate', ['linear'], ['get', variable.id]]

  for (let i = 0; i <= steps; i++) {
    const value = min + (i / steps) * (max - min)
    expression.push(value, scale(value))
  }

  return expression
}
