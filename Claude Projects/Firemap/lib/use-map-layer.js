/**
 * lib/use-map-layer.js
 *
 * React hook: reactively adds/updates a PMTiles or GeoJSON circle layer.
 *
 * Layer ordering:  data circles  →  ca-mask-fill  →  county-borders  →  graticule
 * Circles must sit below ca-mask-fill so the inverted CA polygon clips any
 * feature that falls outside the state boundary.
 *
 * Opacity encoding (diverging variables):
 *   Pre-computed stops map each data value to an opacity so that cells near
 *   zero net benefit are nearly transparent and extreme values are opaque.
 *   All computation is done in JavaScript — no runtime MapLibre abs/divide
 *   expressions, which avoids potential expression-evaluation failures.
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

  const variableRef = useRef(null)
  variableRef.current = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  // ── Source / layer lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const sourceConfig = isPlaceholder
      ? { type: 'geojson', data: '/fuel-treatment.geojson' }
      : { type: 'vector', url: `pmtiles://${config.tilesUrl}` }

    function addLayers() {
      if (!map.isStyleLoaded()) return
      if (map.getSource(SOURCE_ID)) {
        updatePaint()
        return
      }

      try {
        map.addSource(SOURCE_ID, sourceConfig)

        const variable = variableRef.current
        const layerSpec = {
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            // Radius grows to tile the ~5.5 km grid seamlessly at high zoom
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              4,  1.5,
              6,  2,
              8,  6,
              9,  12,
              10, 20,
              11, 36,
              12, 58,
              22, 58,
            ],
            'circle-color':   buildColorExpression(variable),
            'circle-opacity': buildOpacityExpression(variable),
            'circle-stroke-width': 0,
            'circle-blur': [
              'interpolate', ['linear'], ['zoom'],
              5, 0.35,
              9, 0.1,
              12, 0,
            ],
          },
        }

        if (!isPlaceholder) layerSpec['source-layer'] = config.id

        // Insert BELOW ca-mask-fill so the inverted CA polygon clips outside circles
        const before = map.getLayer('ca-mask-fill') ? 'ca-mask-fill' : undefined
        map.addLayer(layerSpec, before)
      } catch (err) {
        console.error('[useMapLayer] addLayers failed:', err)
      }
    }

    function updatePaint() {
      if (!map.getLayer(LAYER_ID)) return
      const variable = variableRef.current
      if (!variable || variable.type === 'categorical') return
      try {
        map.setPaintProperty(LAYER_ID, 'circle-color', buildColorExpression(variable))
        map.setPaintProperty(LAYER_ID, 'circle-opacity', buildOpacityExpression(variable))
      } catch (err) {
        console.error('[useMapLayer] updatePaint failed:', err)
      }
    }

    // Register styledata listener first (covers setStyle reloads)
    map.on('styledata', addLayers)
    // Try immediately if loaded; otherwise wait for idle (handles edge case where
    // isStyleLoaded() returns false even after the load event has fired)
    if (map.isStyleLoaded()) {
      addLayers()
    } else {
      map.once('idle', addLayers)
    }

    return () => {
      map.off('styledata', addLayers)
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Update paint when active variable changes ─────────────────────────────
  useEffect(() => {
    if (!map || !map.isStyleLoaded() || !map.getLayer(LAYER_ID)) return
    const variable = variableRef.current
    if (!variable || variable.type === 'categorical') return
    try {
      map.setPaintProperty(LAYER_ID, 'circle-color', buildColorExpression(variable))
      map.setPaintProperty(LAYER_ID, 'circle-opacity', buildOpacityExpression(variable))
    } catch (err) {
      console.error('[useMapLayer] paint update failed:', err)
    }
  }, [map, config, state.activeLayer, state.activeDimensions])
}

// ── Paint expression builders ─────────────────────────────────────────────

/**
 * MapLibre interpolate expression: data value → CSS color string.
 */
function buildColorExpression(variable) {
  if (!variable || variable.type === 'categorical') return '#888888'
  const scale = buildColorScale(variable)
  const { min, max } = variable.domain
  const steps = 24
  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    expr.push(v, scale(v))
  }
  return expr
}

/**
 * MapLibre interpolate expression: data value → opacity.
 *
 * For diverging variables (net benefits, BCR):
 *   All stops are pre-computed in JavaScript so no runtime MapLibre math
 *   expressions are needed. Cells near zero are nearly transparent; extreme
 *   values (strongly positive or negative) are opaque.
 *
 * For sequential / non-diverging variables: returns a fixed 0.85.
 */
function buildOpacityExpression(variable) {
  if (!variable || variable.type === 'categorical') return 0.85

  const { min, max } = variable.domain
  const steps = 20
  const expr = ['interpolate', ['linear'], ['get', variable.id]]

  if (variable.diverging) {
    // Diverging: transparent near zero, opaque at extremes
    const { zero = 0 } = variable.domain
    const maxAbsDev = Math.max(Math.abs(min - zero), Math.abs(max - zero))
    if (maxAbsDev === 0) return 0.85
    for (let i = 0; i <= steps; i++) {
      const v = min + (i / steps) * (max - min)
      const t = Math.abs(v - zero) / maxAbsDev
      expr.push(v, opacityCurve(t))
    }
  } else {
    // Sequential: fade from ~0 at min to 0.85 at max (no white blobs at low values)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps  // 0 → 1
      const v = min + t * (max - min)
      expr.push(v, t * 0.85)
    }
  }

  return expr
}

/**
 * Maps normalized absolute deviation (0–1) to opacity.
 * At t=0 (value == zero): 0.05 (nearly invisible)
 * At t=1 (max deviation): 0.88 (opaque)
 */
function opacityCurve(t) {
  if (t < 0.03) return 0.05
  if (t < 0.20) return 0.05 + ((t - 0.03) / 0.17) * 0.35   // 0.05 → 0.40
  return 0.40 + ((t - 0.20) / 0.80) * 0.48                  // 0.40 → 0.88
}
