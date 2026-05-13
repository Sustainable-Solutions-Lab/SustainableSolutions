/**
 * lib/use-just-air-layers.js
 *
 * Renders Just Air's single multi-scale PMTiles as a stack of circle layers
 * that progressively reveal finer resolution as the user zooms in — the
 * Firefuels feel, but with explicit per-scale zoom bands declared on the
 * project config rather than hardcoded.
 *
 * The tileset (built by scripts/build-just-air-tiles.mjs) has one feature
 * per cell, tagged with `_scale = cell side length in km`:
 *
 *   _scale = 36   4×4 supercell average     visible z 0–6
 *   _scale = 9    9 km national cell        visible z 5–11
 *   _scale = 1    native city pixel         visible z 8–14
 *
 * Each band gets one circle layer filtered to its scale value. The circle
 * radius follows the same exponential-zoom curve Firefuels uses, multiplied
 * by `_scale`, so a 36 km supercell at z3 reads the same physical size as
 * a 1 km city pixel at z8.
 */

import { useEffect, useRef } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

// Tiling-exact base radius for a 1 km cell. Identical curve to
// use-map-layer.js BASE_RADIUS so the visual density matches Firefuels.
//
//   r = 0.009° × (256 × 2^z / 360°) / 2 ≈ 0.0032 × 2^z
//     z 4  → 0.051 px         z 8  → 0.82 px
//     z 12 → 13.1 px          z 14 → 52.4 px
const FILL_FACTOR = 2.0
const R4  = 0.051 * FILL_FACTOR
const R12 = 13.1  * FILL_FACTOR

const RADIUS = [
  'interpolate', ['exponential', 2], ['zoom'],
  4,  ['*', ['coalesce', ['to-number', ['get', '_scale']], 1], R4],
  12, ['*', ['coalesce', ['to-number', ['get', '_scale']], 1], R12],
  22, ['*', ['coalesce', ['to-number', ['get', '_scale']], 1], R12],
]

const SOURCE_ID = 'just-air-data'

export function justAirLayerIds(config) {
  return (config.scales ?? []).map((s) => `just-air-cells-${s.value}`)
}

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 */
export function useJustAirLayers(map, config, state) {
  const scales = config.scales
  const tilesUrl = config.tilesUrl
  const sourceLayer = config.sourceLayer ?? config.id

  const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const variableRef = useRef(variable)
  variableRef.current = variable
  const isDarkRef = useRef(state.colorScheme === 'dark')
  isDarkRef.current = state.colorScheme === 'dark'

  // ── Source + layer lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!scales || scales.length === 0) return
    if (!tilesUrl) return

    function addLayers() {
      if (!map.isStyleLoaded()) return
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'vector',
          url: `pmtiles://${tilesUrl}`,
        })
      }

      const beforeId = map.getLayer('box-overlay-fill') ? 'box-overlay-fill'
                     : map.getLayer('city-labels-r1')   ? 'city-labels-r1'
                     : map.getLayer('ca-border')        ? 'ca-border'
                     : undefined

      for (const s of scales) {
        const layerId = `just-air-cells-${s.value}`
        if (map.getLayer(layerId)) continue
        try {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: SOURCE_ID,
            'source-layer': sourceLayer,
            minzoom: s.minZoom ?? 0,
            maxzoom: s.maxZoom ?? 24,
            filter: ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], s.value],
            paint: {
              'circle-radius':       RADIUS,
              'circle-color':        buildColorExpr(variableRef.current),
              'circle-opacity':      buildOpacityExpr(variableRef.current, s),
              'circle-stroke-width': 0,
              'circle-blur':         0,
            },
          }, beforeId)
        } catch (err) {
          console.error('[useJustAirLayers] addLayer', layerId, err)
        }
      }
    }

    map.on('styledata', addLayers)
    if (map.isStyleLoaded()) addLayers()
    else map.once('idle', addLayers)

    return () => {
      map.off('styledata', addLayers)
      for (const s of scales) {
        const layerId = `just-air-cells-${s.value}`
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Paint repaint when active variable / scheme flips ──────────────────
  useEffect(() => {
    if (!map || !scales) return
    if (!map.isStyleLoaded()) return
    for (const s of scales) {
      const layerId = `just-air-cells-${s.value}`
      if (!map.getLayer(layerId)) continue
      try {
        map.setPaintProperty(layerId, 'circle-color',   buildColorExpr(variableRef.current))
        map.setPaintProperty(layerId, 'circle-opacity', buildOpacityExpr(variableRef.current, s))
      } catch (err) {
        console.error('[useJustAirLayers] setPaintProperty', layerId, err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.activeLayer, state.activeDimensions, state.colorScheme])
}

// ── Paint expression builders ──────────────────────────────────────────────

function buildColorExpr(variable) {
  if (!variable) return '#888888'
  if (variable.type === 'categorical') {
    const expr = ['match', ['get', variable.id]]
    for (const cat of variable.categories ?? []) expr.push(cat.id, cat.color)
    expr.push('#888888')
    return expr
  }
  const { min, max } = variable.domain
  const scale = buildColorScale(variable)
  const steps = 24
  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    expr.push(v, scale(v))
  }
  return expr
}

// Per-scale opacity ramp: each scale fades in at the start of its zoom band
// and fades out at the end, so neighboring scales cross-fade instead of
// snapping at the maxzoom/minzoom boundary.
function buildOpacityExpr(variable, scaleEntry) {
  const peak = 0.9
  const { minZoom = 0, maxZoom = 24, fadeWidth = 0.5 } = scaleEntry
  if (variable?.type === 'categorical') return peak
  return ['interpolate', ['linear'], ['zoom'],
    minZoom,             0,
    minZoom + fadeWidth, peak,
    maxZoom - fadeWidth, peak,
    maxZoom,             0,
  ]
}
