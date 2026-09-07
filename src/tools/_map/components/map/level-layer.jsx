/**
 * components/map/level-layer.jsx
 *
 * Gridded analysis overlay: dedicated circle layers over the cell source
 * painted by a caller-supplied color expression — an intensity ratio
 * (config.paleMap.levels) or a dominance category
 * (config.paleMap.categorical). Layers are REMOVED AND RECREATED whenever
 * that expression changes — repainting existing layers mid-tile-load
 * leaves stale unevaluated tiles (observed as tile-boundary
 * checkerboards), while freshly created layers always lay out every tile
 * with the paint they were born with.
 */

import { useEffect } from 'react'
import { buildCellRadiusExpr, buildZoomFade, buildZoomFadeScaled } from '../../lib/use-just-air-layers.js'

const PREFIX = 'level-cells-'

export function AnalysisCellLayer({ map, config, colorExpr, opacityExpr = null, paintKey }) {
  useEffect(() => {
    if (!map || !config.scales) return undefined
    if (!colorExpr) return undefined
    const color = colorExpr

    function create() {
      if (!map.getStyle?.()) return
      try {
        for (const s of config.scales) {
          const id = `${PREFIX}${s.value}`
          if (map.getLayer(id)) continue
          const spec = {
            id, type: 'circle', source: 'just-air-data',
            'source-layer': config.sourceLayer ?? config.id,
            minzoom: s.minZoom ?? 0,
            filter: ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], s.value],
            paint: {
              'circle-radius': buildCellRadiusExpr(s, null),
              'circle-color': color,
              'circle-opacity': opacityExpr
                ? buildZoomFadeScaled(s, opacityExpr)
                : buildZoomFade(s),
              'circle-stroke-width': 0,
            },
          }
          if (s.maxZoom != null) spec.maxzoom = s.maxZoom
          map.addLayer(spec)
        }
      } catch { /* styledata retry */ }
    }

    create()
    map.on('styledata', create)
    map.on('idle', create)
    // If the map is already idle when the analysis activates, no further
    // idle/styledata may fire — retry creation briefly.
    const retry = setInterval(create, 400)
    const stopRetry = setTimeout(() => clearInterval(retry), 4000)
    return () => {
      clearInterval(retry)
      clearTimeout(stopRetry)
      map.off('styledata', create)
      map.off('idle', create)
      if (!map.getStyle?.()) return
      try {
        for (const s of config.scales) {
          const id = `${PREFIX}${s.value}`
          if (map.getLayer(id)) map.removeLayer(id)
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config, paintKey])
  return null
}
