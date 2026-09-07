/**
 * components/map/level-layer.jsx
 *
 * Gridded LEVEL analysis (config.paleMap.levels): dedicated circle layers
 * over the cell source painted by a stored-prop intensity ratio (e.g.
 * kg CO2e per cropland ha). Layers are REMOVED AND RECREATED whenever the
 * driver, theme, or activation changes — repainting existing layers
 * mid-tile-load leaves stale unevaluated tiles (observed as tile-boundary
 * checkerboards), while freshly created layers always lay out every tile
 * with the paint they were born with.
 */

import { useEffect } from 'react'
import { makeLevelVariable, levelColorExpr } from '../../lib/analysis-levels.js'
import { buildCellRadiusExpr, buildZoomFade } from '../../lib/use-just-air-layers.js'

const PREFIX = 'level-cells-'

export function LevelLayer({ map, config, level, isDark }) {
  useEffect(() => {
    if (!map || !config.scales) return undefined
    if (!level) return undefined
    const variable = makeLevelVariable(level)
    const color = levelColorExpr(variable, isDark)

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
              'circle-opacity': buildZoomFade(s),
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
  }, [map, config, level?.id, isDark, level])
  return null
}
