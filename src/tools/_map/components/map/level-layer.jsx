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

import { useEffect, useRef } from 'react'
import { buildCellRadiusExpr, buildZoomFade, buildZoomFadeScaled } from '../../lib/use-just-air-layers.js'

const PREFIX = 'level-cells-'

export function AnalysisCellLayer({ map, config, colorExpr, opacityExpr = null, magnitudeExpr = null, paintKey }) {
  const createdRef = useRef([])
  useEffect(() => {
    if (!map || !config.scales) return undefined
    if (!colorExpr) return undefined
    const color = colorExpr

    // Band mode (config.paleMap.cellBands): one resolution at every zoom,
    // thinned by magnitude instead of swapped for a coarser tier. Filters
    // cannot read ['zoom'], so each band is its own layer with a static
    // value filter and its own zoom range.
    const bands = config.paleMap?.cellBands
    const bandProp = config.paleMap?.cellBandProp ?? 'tot'
    const fine = bands
      ? config.scales.reduce((a, s) => (s.value < a.value ? s : a), config.scales[0])
      : null

    function create() {
      if (!map.getStyle?.()) return
      try {
        const specs = bands
          ? bands.map((band, i) => ({
              id: `${PREFIX}b${i}`,
              scale: { ...fine, minZoom: band.minZoom, maxZoom: band.maxZoom },
              // Thin on a single stored property, not the full magnitude
              // expression: filters are re-evaluated per feature per tile
              // and a large nested expression there is both slow and
              // fragile (MapLibre reports failures with the whole
              // expression inlined).
              filter: band.minValue
                ? ['all',
                    ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], fine.value],
                    ['>=', ['coalesce', ['to-number', ['get', bandProp]], 0], band.minValue]]
                : ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], fine.value],
            }))
          : config.scales.map((s) => ({
              id: `${PREFIX}${s.value}`,
              scale: s,
              filter: ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], s.value],
            }))
        for (const { id, scale, filter } of specs) {
          if (map.getLayer(id)) continue
          const spec = {
            id, type: 'circle', source: 'just-air-data',
            'source-layer': config.sourceLayer ?? config.id,
            minzoom: scale.minZoom ?? 0,
            filter,
            paint: {
              'circle-radius': buildCellRadiusExpr(scale, null),
              'circle-color': color,
              'circle-opacity': opacityExpr
                ? buildZoomFadeScaled(scale, opacityExpr)
                : buildZoomFade(scale),
              'circle-stroke-width': 0,
            },
          }
          if (scale.maxZoom != null) spec.maxzoom = scale.maxZoom
          map.addLayer(spec)
        }
        createdRef.current = specs.map((x) => x.id)
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
        for (const id of createdRef.current) {
          if (map.getLayer(id)) map.removeLayer(id)
        }
        createdRef.current = []
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config, paintKey])
  return null
}
