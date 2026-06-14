/**
 * lib/use-multi-source-layers.js
 *
 * Renders polygon-tiled PMTiles for projects that declare `config.tileSources`.
 * Sits in parallel with the legacy useMapLayer hook (which handles the
 * Firefuels-specific 0.01°/0.05°/0.1° LOD circle scheme). When a project
 * opts in via tileSources, the legacy hook bows out (see use-map-layer.js).
 *
 * For each tile source we add:
 *   - one vector source (`type: 'vector'`, `url: pmtiles://...`)
 *   - one fill layer keyed on that source's `sourceLayer`
 *
 * fill-color is a 24-stop interpolate expression over the active variable's
 * domain. fill-opacity is constant unless the source declares fadeInRange or
 * fadeOutRange, in which case the opacity ramps with map zoom. This lets a
 * "national" surface stay visible at all zooms while a "cities" surface
 * smoothly fades in once the user zooms past its native resolution.
 */

import { useEffect, useRef } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

const BASE_FILL_OPACITY = 0.85

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 */
export function useMultiSourceLayers(map, config, state) {
  const tileSources = config.tileSources
  const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  const variableRef = useRef(variable)
  variableRef.current = variable
  const isDarkRef = useRef(state.colorScheme === 'dark')
  isDarkRef.current = state.colorScheme === 'dark'

  // ── Source / layer lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!tileSources || tileSources.length === 0) return

    function addLayers() {
      if (!map.isStyleLoaded()) return
      for (const ts of tileSources) {
        const layerId = `${ts.id}-fill`
        if (map.getLayer(layerId)) continue

        if (!map.getSource(ts.id)) {
          map.addSource(ts.id, {
            type: 'vector',
            url: `pmtiles://${ts.url}`,
          })
        }

        // Sit below the box overlay (so city boxes / labels stay on top of
        // the pixel data) and the basemap's city labels & state border (so
        // place names remain legible).
        const beforeId = map.getLayer('box-overlay-fill') ? 'box-overlay-fill'
                       : map.getLayer('city-labels-r1')   ? 'city-labels-r1'
                       : map.getLayer('ca-border')        ? 'ca-border'
                       : undefined

        try {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: ts.id,
            'source-layer': ts.sourceLayer,
            minzoom: ts.minZoom ?? 0,
            maxzoom: ts.maxZoom ?? 24,
            paint: {
              'fill-color':     buildColorExpr(variableRef.current, isDarkRef.current),
              'fill-opacity':   buildOpacityExpr(ts),
              'fill-antialias': false,
            },
          }, beforeId)
        } catch (err) {
          console.error('[useMultiSourceLayers] addLayer', layerId, err)
        }
      }
    }

    map.on('styledata', addLayers)
    if (map.isStyleLoaded()) addLayers()
    else map.once('idle', addLayers)

    return () => {
      map.off('styledata', addLayers)
      for (const ts of tileSources) {
        const layerId = `${ts.id}-fill`
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(ts.id))  map.removeSource(ts.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Paint update when active variable / scheme changes ─────────────────
  useEffect(() => {
    if (!map || !tileSources) return
    if (!map.isStyleLoaded()) return
    for (const ts of tileSources) {
      const layerId = `${ts.id}-fill`
      if (!map.getLayer(layerId)) continue
      try {
        map.setPaintProperty(layerId, 'fill-color',   buildColorExpr(variableRef.current, isDarkRef.current))
        map.setPaintProperty(layerId, 'fill-opacity', buildOpacityExpr(ts))
      } catch (err) {
        console.error('[useMultiSourceLayers] setPaintProperty', layerId, err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.activeLayer, state.activeDimensions, state.colorScheme])
}

// ── Paint expression builders ──────────────────────────────────────────────

function buildColorExpr(variable, _isDark) {
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

function buildOpacityExpr(tileSource) {
  if (tileSource.fadeInRange) {
    const [z0, z1] = tileSource.fadeInRange
    return ['interpolate', ['linear'], ['zoom'],
      z0, 0,
      z1, BASE_FILL_OPACITY,
    ]
  }
  if (tileSource.fadeOutRange) {
    const [z0, z1] = tileSource.fadeOutRange
    return ['interpolate', ['linear'], ['zoom'],
      z0, BASE_FILL_OPACITY,
      z1, 0,
    ]
  }
  return BASE_FILL_OPACITY
}
