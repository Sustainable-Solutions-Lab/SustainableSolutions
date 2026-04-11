/**
 * lib/use-map-layer.js
 *
 * React hook: reactively adds/updates a PMTiles or GeoJSON circle layer.
 *
 * Layer ordering contract:
 *   data circles  →  ca-mask-fill  →  county-borders  →  graticule
 *
 * The circles must be BELOW ca-mask-fill so the inverted CA polygon hides
 * any circle that falls outside the state boundary.
 *
 * Visual encoding:
 * - circle-color   : D3 diverging/sequential colormap
 * - circle-opacity : for diverging variables, opacity encodes |deviation from
 *                    zero| — neutral cells are nearly transparent, extremes are
 *                    opaque. This produces the CarbonPlan heatmap effect.
 * - circle-radius  : grows with zoom (fills the ~5.5 km synthetic cell footprint),
 *                    clamped so circles never appear smaller than 2 px or
 *                    larger than 14 px in screen space.
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

  // Ref keeps the latest variable without stale closures in the styledata handler
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
        // Source already present — just refresh paint in case variable changed
        updatePaint()
        return
      }

      map.addSource(SOURCE_ID, sourceConfig)

      const variable = variableRef.current
      const layerSpec = {
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          // Radius: calibrated for ~5.5 km synthetic grid spacing.
          // Grows with zoom so cells tile together; clamped to [2, 14] px.
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4,  2,
            6,  2.5,
            8,  6,
            9,  11,
            10, 14,
            20, 14,   // cap — stays at 14 px beyond zoom 10
          ],
          'circle-color': variable ? buildColorExpression(variable) : '#888888',
          'circle-opacity': variable ? buildOpacityExpression(variable) : 0.85,
          'circle-stroke-width': 0,
          // Slight blur softens edges and helps cells blend at low zoom
          'circle-blur': [
            'interpolate', ['linear'], ['zoom'],
            5, 0.4,
            9, 0.1,
            12, 0,
          ],
        },
      }

      if (!isPlaceholder) layerSpec['source-layer'] = config.id

      // INSERT BELOW ca-mask-fill so the inverted CA polygon clips outside data
      const before = map.getLayer('ca-mask-fill') ? 'ca-mask-fill' : undefined
      map.addLayer(layerSpec, before)
    }

    function updatePaint() {
      if (!map.getLayer(LAYER_ID)) return
      const variable = variableRef.current
      if (!variable || variable.type === 'categorical') return
      map.setPaintProperty(LAYER_ID, 'circle-color', buildColorExpression(variable))
      map.setPaintProperty(LAYER_ID, 'circle-opacity', buildOpacityExpression(variable))
    }

    if (map.isStyleLoaded()) addLayers()
    map.on('styledata', addLayers)

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
    map.setPaintProperty(LAYER_ID, 'circle-color', buildColorExpression(variable))
    map.setPaintProperty(LAYER_ID, 'circle-opacity', buildOpacityExpression(variable))
  }, [map, config, state.activeLayer, state.activeDimensions])
}

// ── Paint expression builders ─────────────────────────────────────────────

/**
 * MapLibre `interpolate` expression mapping feature property value → CSS color.
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
 * MapLibre expression for circle opacity.
 *
 * Diverging variables (e.g. net benefits):
 *   Opacity = f(|value − zero| / maxAbsDev)
 *   → zero deviation  = nearly transparent (0.05)
 *   → max deviation   = opaque (0.88)
 *   This is the CarbonPlan "opacity encodes magnitude" technique.
 *
 * Sequential/non-diverging variables: fixed 0.85 opacity.
 */
function buildOpacityExpression(variable) {
  if (!variable || variable.type === 'categorical') return 0.85
  if (!variable.diverging) return 0.85

  const { min, max, zero = 0 } = variable.domain
  const maxAbsDev = Math.max(Math.abs(min - zero), Math.abs(max - zero))
  if (maxAbsDev === 0) return 0.85

  // |value - zero| / maxAbsDev  → [0, 1]
  const normalised = ['/', ['abs', ['-', ['get', variable.id], zero]], maxAbsDev]

  return [
    'interpolate', ['linear'], normalised,
    0,    0.05,   // at zero: nearly transparent
    0.05, 0.2,
    0.2,  0.55,
    1,    0.88,   // at maximum deviation: opaque
  ]
}
