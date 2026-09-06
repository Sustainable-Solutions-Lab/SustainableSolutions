/**
 * components/map/regional-layer.jsx
 *
 * Regional map view (config.regionalView): the admin-1 x biome units as a
 * choropleth of the ACTIVE Source x Commodity selection — the same variable
 * resolution, year scaling, and colormap as the gridded cells, painted on
 * unit polygons and colored by per-area intensity (t CO2e per km2 of unit)
 * so large and small units compare fairly.
 *
 * Hover/tap shows the unit's total and intensity; click selects the unit
 * (outline + Actions.SELECT_UNIT, which opens the region statistics panel).
 * The percentile presets mask units below the chosen value percentile.
 *
 * Tiles: unit polygons carrying the same prop names as the cells (sums)
 * plus area_km2 and dominant m49 — built by the analysis repo's
 * export_unit_values.py.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Actions } from '../../contracts/events.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { useYearFactors } from '../../lib/year-factors.js'
import { varValueExpr, varHasExpr, readVarValue } from '../../lib/variable-value.js'
import { INTERPOLATORS } from '../../lib/colormap.js'

const SRC = 'unit-values'
const FILL = 'unit-values-fill'
const LINE = 'unit-values-line'
const SEL = 'unit-values-selected'

function withAlpha(rgbStr, a) {
  if (rgbStr.startsWith('rgb(')) return rgbStr.replace('rgb(', 'rgba(').replace(')', `,${a.toFixed(3)})`)
  return rgbStr
}

export function RegionalLayer({ map, config, state, dispatch, isDark, suppressed = false }) {
  // suppressed: an Analysis overlay (PALE) owns the polygons right now.
  const active = state.mapView === 'regional' && !suppressed
  const yearFactors = useYearFactors(config)
  const resolved = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const variable = useMemo(() => (
    resolved?.scaled && yearFactors
      ? { ...resolved, scaled: { ...resolved.scaled, factors: yearFactors } }
      : resolved
  ), [resolved, yearFactors])

  const [tip, setTip] = useState(null)
  const refs = useRef({})
  // Merge (never replace): the mount effect attaches .ensure/.repaint and a
  // wholesale assignment on re-render would clobber them.
  Object.assign(refs.current, { active, variable, isDark,
    percentileRange: state.percentileRange,
    selectedId: state.selectedUnit?.id ?? null, dispatch })

  // Intensity expression: value (kt, year-scaled) per km2 -> t/km2.
  const intensityExpr = useMemo(() => {
    if (!variable) return 0
    return ['/', ['*', ['to-number', varValueExpr(variable)], 1000],
            ['max', 1, ['to-number', ['get', 'area_km2']]]]
  }, [variable])

  // ── Source + layers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !config.regionalView) return undefined
    const rangeRef = { p95: null, locked: false }

    function paint() {
      const { variable: v, isDark: dark, percentileRange } = refs.current
      if (!map.getStyle?.() || !map.getLayer(FILL) || !v) return
      const interp = INTERPOLATORS[dark && v.darkColormap ? v.darkColormap : (v.colormap ?? 'SpectralHot')]
        ?? INTERPOLATORS.SpectralHot
      const max = rangeRef.p95 ?? 20
      const expr = ['interpolate', ['linear'], intensityExpr]
      const steps = 18
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const a = t < 0.04 ? 0.1 : Math.min(0.85, 0.2 + 0.75 * Math.pow(t, 0.6))
        expr.push((t * max) || i * 1e-6, withAlpha(interp(t), a))
      }
      try {
        map.setPaintProperty(FILL, 'fill-color', ['case', varHasExpr(v), expr, 'rgba(0,0,0,0)'])
      } catch {}
      // Percentile mask on the unit's value (not intensity): recompute
      // threshold from rendered features.
      try {
        const low = percentileRange?.low ?? 0
        if (low > 0) {
          const vals = map.queryRenderedFeatures({ layers: [FILL] })
            .map((f) => readVarValue(f.properties, v))
            .filter((x) => x != null && isFinite(x) && x > 0)
            .sort((a1, b1) => a1 - b1)
          const thr = vals.length ? vals[Math.floor((low / 100) * (vals.length - 1))] : 0
          map.setFilter(FILL, ['>=', ['to-number', varValueExpr(v)], thr])
        } else {
          map.setFilter(FILL, null)
        }
      } catch {}
    }

    function computeRange() {
      if (rangeRef.locked) return
      const { variable: v } = refs.current
      if (!v || !map.getLayer?.(FILL)) return
      try {
        const feats = map.queryRenderedFeatures({ layers: [FILL] })
        if (feats.length < 20) return
        const vals = feats
          .map((f) => {
            const val = readVarValue(f.properties, v)
            const a = f.properties.area_km2 || 1
            return val != null ? (val * 1000) / Math.max(1, a) : null
          })
          .filter((x) => x != null && isFinite(x) && x > 0)
          .sort((a, b) => a - b)
        if (vals.length < 20) return
        rangeRef.p95 = vals[Math.floor(0.95 * (vals.length - 1))] || 20
        if (feats.length > 300) rangeRef.locked = true
        paint()
      } catch {}
    }

    function ensure() {
      if (!map.getStyle?.()) return
      // Lazy creation: layers born visibility:none never trigger tile
      // loading under the pmtiles protocol, so don't create until the
      // regional view is first activated. And STRICTLY no-op when the
      // layers already exist — re-setting layout/paint on every idle
      // keeps the style permanently dirty and tile loads never finish.
      if (map.getLayer(FILL)) return
      if (!refs.current.active) return
      try {
        if (!map.getSource(SRC)) {
          map.addSource(SRC, { type: 'vector', url: `pmtiles://${config.regionalView.tilesUrl}` })
        }
        const sl = config.regionalView.sourceLayer ?? SRC
        map.addLayer({ id: FILL, type: 'fill', source: SRC, 'source-layer': sl,
                       paint: { 'fill-color': 'rgba(0,0,0,0)' } })
        map.addLayer({ id: LINE, type: 'line', source: SRC, 'source-layer': sl,
                       // Whisper-weight: biome subdivisions sit far below the
                       // national/admin-1 reference lines.
                       paint: { 'line-color': isDark ? 'rgba(248,248,232,0.10)' : 'rgba(24,24,56,0.08)', 'line-width': 0.3 } })
        map.addLayer({ id: SEL, type: 'line', source: SRC, 'source-layer': sl,
                       filter: ['==', ['get', 'unit_id'], refs.current.selectedId ?? -1],
                       paint: { 'line-color': isDark ? '#F8F8E8' : '#181838', 'line-width': 2 } })
        paint()
      } catch {}
    }

    function onMove(e) {
      if (!refs.current.active || !map.getLayer(FILL)) return
      const pad = 5
      const f = map.queryRenderedFeatures(
        [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
        { layers: [FILL] })[0]
      if (!f) { setTip(null); return }
      setTip({ x: e.point.x, y: e.point.y, p: f.properties })
    }
    function onClick(e) {
      if (!refs.current.active || !map.getLayer(FILL)) return
      const pad = 5
      const f = map.queryRenderedFeatures(
        [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
        { layers: [FILL] })[0]
      refs.current.dispatch({
        type: Actions.SELECT_UNIT,
        unit: f ? { id: f.properties.unit_id, props: f.properties } : null,
      })
    }
    function onLeave() { setTip(null) }

    ensure()
    map.on('styledata', ensure)
    map.on('idle', ensure)
    map.on('idle', computeRange)
    map.on('mousemove', onMove)
    map.on('click', onClick)
    map.on('mouseout', onLeave)
    // repaint hooks for variable/theme/percentile changes
    refs.current.repaint = () => { rangeRef.p95 = null; rangeRef.locked = false; computeRange(); paint() }
    refs.current.ensure = ensure
    return () => {
      map.off('styledata', ensure)
      map.off('idle', ensure)
      map.off('idle', computeRange)
      map.off('mousemove', onMove)
      map.off('click', onClick)
      map.off('mouseout', onLeave)
      if (!map.getStyle?.()) return
      try { for (const id of [FILL, LINE, SEL]) { if (map.getLayer(id)) map.removeLayer(id) } } catch {}
      try { if (map.getSource(SRC)) map.removeSource(SRC) } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // visibility + repaint on state changes (creating lazily on first show)
  useEffect(() => {
    if (!map?.getStyle?.()) return
    if (active && !map.getLayer?.(FILL)) refs.current.ensure?.()
    if (!map.getLayer?.(FILL)) return
    const vis = active ? 'visible' : 'none'
    try { for (const id of [FILL, LINE, SEL]) map.setLayoutProperty(id, 'visibility', vis) } catch {}
    if (active) refs.current.repaint?.()
    if (!active) setTip(null)
  }, [map, active, variable, isDark, state.percentileRange, suppressed])

  // selection outline
  useEffect(() => {
    if (!map?.getStyle?.() || !map.getLayer?.(SEL)) return
    try { map.setFilter(SEL, ['==', ['get', 'unit_id'], state.selectedUnit?.id ?? -1]) } catch {}
  }, [map, state.selectedUnit])

  // Slim hover tip: identification only — the numbers and distribution
  // live in the click-opened statistics panel (no duplication).
  if (!active || !tip || !variable) return null
  if (state.selectedUnit?.id === tip.p.unit_id) return null
  return (
    <div style={{
      position: 'absolute', left: tip.x + 12, top: tip.y + 12, zIndex: 20,
      pointerEvents: 'none', background: isDark ? 'rgba(12,12,28,0.94)' : 'rgba(248,248,232,0.96)',
      border: `1px solid ${isDark ? 'rgba(248,248,232,0.2)' : 'rgba(24,24,56,0.2)'}`,
      borderRadius: 4, padding: '4px 8px',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10,
      color: isDark ? '#F8F8E8' : '#181838',
    }}>
      <span style={{ fontWeight: 700 }}>{tip.p.name}</span>
      <span style={{ opacity: 0.6 }}> · {tip.p.country}</span>
      {!state.selectedUnit && (
        <span style={{ opacity: 0.5 }}> — click for statistics</span>
      )}
    </div>
  )
}
