/**
 * components/map/pale-layer.jsx
 *
 * PALE-drivers choropleth, config-gated (config.paleMap). When active, the
 * cell circles hide and admin-1 x biome unit polygons render instead,
 * colored by one LMDI term of the unit's 2000-2023 emissions change,
 * expressed relative to year-2000 emissions (percent): net change,
 * population, production per capita, land per kcal, or emissions per land.
 * Blue = pushed emissions down, red = pushed them up. Hover shows the
 * unit's full decomposition.
 *
 * Tiles: polygons with per-unit props (r_net, r_pop, r_prodpc, r_landkcal,
 * r_eland in %, e2020_kt, de_kt, name, country) built by the analysis
 * repo's build_pale_polygons.py and tiled to PMTiles.
 */

import { useEffect, useRef, useState } from 'react'

const SRC = 'pale-units'
const FILL = 'pale-units-fill'
const LINE = 'pale-units-line'
const CELL_PREFIX = 'just-air-cells-'
const RANGE = 50 // % of 2000 emissions at which the ramp saturates

function fillExpr(driver, isDark) {
  const neutral = isDark ? 'rgba(248,248,232,0.06)' : 'rgba(24,24,56,0.05)'
  return [
    'case',
    ['==', ['typeof', ['get', driver]], 'number'],
    ['interpolate', ['linear'], ['get', driver],
      -RANGE, 'rgba(50,136,189,0.75)',
      -RANGE / 5, 'rgba(102,194,165,0.55)',
      0, neutral,
      RANGE / 5, 'rgba(253,174,97,0.55)',
      RANGE, 'rgba(213,62,79,0.8)',
    ],
    'rgba(0,0,0,0)',
  ]
}

export function PaleLayer({ map, config, active, driver, isDark }) {
  const [tip, setTip] = useState(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (!map || !config.paleMap) return undefined

    function setCellsVisible(visible) {
      const style = map.getStyle?.()
      if (!style) return
      for (const l of style.layers ?? []) {
        if (l.id.startsWith(CELL_PREFIX)) {
          try { map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none') } catch {}
        }
      }
    }

    function ensureLayers() {
      // NOTE: no isStyleLoaded() gate — with the pmtiles protocol it never
      // reliably flips true (same workaround as use-just-air-layers); the
      // try/catch below absorbs a genuinely-not-ready style.
      if (!map.getStyle?.()) return
      try {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'vector', url: `pmtiles://${config.paleMap.tilesUrl}` })
      }
      const beforeId = map.getLayer('graticule') ? 'graticule' : undefined
      if (!map.getLayer(FILL)) {
        map.addLayer({
          id: FILL, type: 'fill', source: SRC,
          'source-layer': config.paleMap.sourceLayer ?? SRC,
          paint: { 'fill-color': fillExpr(driver, isDark) },
        }, beforeId)
      }
      if (!map.getLayer(LINE)) {
        map.addLayer({
          id: LINE, type: 'line', source: SRC,
          'source-layer': config.paleMap.sourceLayer ?? SRC,
          paint: {
            'line-color': isDark ? 'rgba(248,248,232,0.25)' : 'rgba(24,24,56,0.2)',
            'line-width': 0.4,
          },
        }, beforeId)
      }
      const vis = activeRef.current ? 'visible' : 'none'
      map.setLayoutProperty(FILL, 'visibility', vis)
      map.setLayoutProperty(LINE, 'visibility', vis)
      setCellsVisible(!activeRef.current)
      } catch { /* style not ready yet — the styledata/idle retries cover it */ }
    }

    function onMove(e) {
      if (!activeRef.current || !map.getLayer(FILL)) return
      const f = map.queryRenderedFeatures(e.point, { layers: [FILL] })[0]
      if (!f) { setTip(null); return }
      setTip({ x: e.point.x, y: e.point.y, p: f.properties })
    }
    function onLeave() { setTip(null) }

    ensureLayers()
    map.on('styledata', ensureLayers)
    map.on('idle', ensureLayers)
    map.on('mousemove', onMove)
    map.on('click', onMove)  // touch devices: tap to inspect
    map.on('mouseout', onLeave)
    return () => {
      map.off('styledata', ensureLayers)
      map.off('idle', ensureLayers)
      map.off('mousemove', onMove)
      map.off('click', onMove)
      map.off('mouseout', onLeave)
      if (!map.getStyle?.()) return  // map already removed
      setCellsVisible(true)
      try { for (const id of [FILL, LINE]) { if (map.getLayer(id)) map.removeLayer(id) } } catch {}
      try { if (map.getSource(SRC)) map.removeSource(SRC) } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config, active])

  // Repaint on driver / theme change
  useEffect(() => {
    if (!map?.getStyle?.() || !map.getLayer(FILL)) return
    try { map.setPaintProperty(FILL, 'fill-color', fillExpr(driver, isDark)) } catch {}
  }, [map, driver, isDark])

  if (!active) return null
  const rows = tip ? [
    ['Net change', tip.p.r_net],
    ['Population', tip.p.r_pop],
    ['Prod / capita', tip.p.r_prodpc],
    ['Land / kcal', tip.p.r_landkcal],
    ['Emissions / land', tip.p.r_eland],
  ] : []
  return tip ? (
    <div
      style={{
        position: 'absolute', left: tip.x + 12, top: tip.y + 12, zIndex: 20,
        pointerEvents: 'none', minWidth: 170,
        background: isDark ? 'rgba(12,12,28,0.94)' : 'rgba(248,248,232,0.96)',
        border: `1px solid ${isDark ? 'rgba(248,248,232,0.2)' : 'rgba(24,24,56,0.2)'}`,
        borderRadius: 4, padding: '7px 9px',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10,
        color: isDark ? '#F8F8E8' : '#181838',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{tip.p.name}</div>
      <div style={{ opacity: 0.6, marginBottom: 4 }}>
        {tip.p.country} · {tip.p.e2020_kt != null ? `${Math.round(tip.p.e2020_kt).toLocaleString()} kt (2020)` : ''}
      </div>
      {rows.map(([label, v]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ opacity: 0.7 }}>{label}</span>
          <span style={{ fontWeight: label === 'Net change' ? 700 : 400 }}>
            {v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`}
          </span>
        </div>
      ))}
      <div style={{ opacity: 0.5, marginTop: 4 }}>% of 2000 emissions, 2000–2023</div>
    </div>
  ) : null
}
