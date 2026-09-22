/**
 * components/map/regional-layer.jsx
 *
 * Regional map view (config.regionalView): the admin-1 x biome units as a
 * choropleth of the ACTIVE Source x Commodity selection — the same
 * variable resolution, year scaling, colormap, colour RANGE and alpha ramp
 * as the gridded cells, painted on unit polygons and read against the same
 * quantity: t CO2e per km2 of ground (lib/intensity.js). A unit and a cell
 * that both read 200 t/km2 paint the same colour; the unit simply averages
 * over far more ground, so its distribution is the tighter one.
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
import { varValueExpr, readVarValue } from '../../lib/variable-value.js'
import { unitIntensityExpr } from '../../lib/intensity.js'
import { buildColorExpr } from '../../lib/use-just-air-layers.js'
import { levelFor, makeLevelVariable, levelColorExpr } from '../../lib/analysis-levels.js'
import { categoricalFor, categoricalEntries, categoricalColorExpr, categoricalOpacityExpr, categoricalChangeColorExpr, categoricalChangeMagnitudeExpr, composition } from '../../lib/analysis-categorical.js'

const SRC = 'unit-values'
const FILL = 'unit-values-fill'
const LINE = 'unit-values-line'
const SEL = 'unit-values-selected'

/**
 * Selection filter. unit_id alone collided across tile vintages and
 * outlined unrelated polygons, so identity is compound. This lives in one
 * place because the bug came back once: the layer was CREATED with a
 * unit_id-only filter and only upgraded by an effect keyed on selection
 * change, so any re-creation of the layer (style reload, view switch)
 * silently reverted it.
 */
function selectionFilter(su) {
  if (!su) return ['==', ['get', 'unit_id'], -1]
  return ['all',
    ['==', ['get', 'unit_id'], su.id ?? -1],
    ['==', ['get', 'name'], su.props?.name ?? ''],
    ['==', ['get', 'country'], su.props?.country ?? '']]
}

export function RegionalLayer({ map, config, state, dispatch, isDark, suppressed = false, socPaint = null, colorRange = null }) {
  // suppressed: an Analysis overlay (PALE) owns the polygons right now.
  // colorRange: the range the gridded cells are painted with (MapTool's
  // fixedColorRange, in stored per-cell units — buildColorExpr restates it
  // per km² the same way for both views). Shared deliberately: it is the
  // whole point that the two views saturate at the same number.
  const active = state.mapView === 'regional' && !suppressed
  const yearFactors = useYearFactors(config)
  const resolved = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const lvl = levelFor(config, state)
  const cat = categoricalFor(config, state)
  const catEntries = useMemo(
    () => (cat ? categoricalEntries(cat, config, state) : []),
    [cat, config, state.activeDimensions],
  )
  const variable = useMemo(() => {
    if (lvl) return makeLevelVariable(lvl)
    return resolved?.scaled && yearFactors
      ? { ...resolved, scaled: { ...resolved.scaled, factors: yearFactors } }
      : resolved
  }, [resolved, yearFactors, lvl])

  const [tip, setTip] = useState(null)
  const refs = useRef({})
  // Merge (never replace): the mount effect attaches .ensure/.repaint and a
  // wholesale assignment on re-render would clobber them.
  if (active) refs.current.everActive = true
  const domCompare = state.analysis === 'dominance'
    && (state.activeDimensions?.compare ?? 'off') === 'on'
    && yearFactors
    ? { factors: yearFactors,
        from: Number(state.activeDimensions?.yearB ?? 2000),
        to: Number(state.activeDimensions?.year ?? 2024) }
    : null
  Object.assign(refs.current, { active, variable, isDark, catEntries, domCompare,
    socPaint: socPaint ?? null, colorRange,
    percentileRange: state.percentileRange,
    selectedId: state.selectedUnit?.id ?? null,
    // the whole unit, so a layer re-created outside React can rebuild the
    // compound selection filter rather than falling back to unit_id alone
    selectedUnit: state.selectedUnit ?? null, dispatch })

  // ── Source + layers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !config.regionalView) return undefined

    function paint() {
      const { variable: v, isDark: dark, percentileRange } = refs.current
      if (!map.getStyle?.() || !map.getLayer(FILL) || !v) return
      // Soil-carbon view: signed per-km2 diverging choropleth.
      if (refs.current.socPaint) {
        const sp = refs.current.socPaint
        try {
          map.setPaintProperty(FILL, 'fill-color', sp.colorExpr)
          map.setPaintProperty(FILL, 'fill-opacity', 0.85)
          map.setFilter(FILL, null)
        } catch {}
        return
      }
      if (refs.current.catEntries?.length) {
        const ents = refs.current.catEntries
        const cmp = refs.current.domCompare
        try {
          if (cmp) {
            map.setPaintProperty(FILL, 'fill-color',
              categoricalChangeColorExpr(ents, cmp.factors, cmp.from, cmp.to, 5e-4))
            const mag = categoricalChangeMagnitudeExpr(ents, cmp.factors, cmp.to)
            const op = ['interpolate', ['linear'], mag]
            for (const [v, a] of [[0, 0.1], [200, 0.45], [2000, 0.72], [12000, 0.9]]) op.push(v, a)
            map.setPaintProperty(FILL, 'fill-opacity', op)
          } else {
            map.setPaintProperty(FILL, 'fill-color', categoricalColorExpr(ents, 5e-4))
            map.setPaintProperty(FILL, 'fill-opacity', categoricalOpacityExpr(ents,
              [[0, 0.1], [200, 0.45], [2000, 0.72], [12000, 0.9]]))
          }
        } catch {}
        try { map.setFilter(FILL, null) } catch {}
        return
      }
      try { map.setPaintProperty(FILL, 'fill-opacity', 1) } catch {}
      // Level analyses are ratios already and bring their own fixed ramp.
      if (v.rawExpr && !v.diverging) {
        try { map.setPaintProperty(FILL, 'fill-color', levelColorExpr(v, dark)) } catch {}
        try { map.setFilter(FILL, null) } catch {}
        return
      }
      // Everything else — the emission sums, soil carbon, the forest-carbon
      // pilots — goes through the gridded cells' OWN ramp builder, read
      // against the unit's t CO2e/km2 instead of the cell's and off the
      // same colour range. One scale, one colorbar, two geometries; the
      // regional map no longer needs a divisor of its own (it used
      // colorMax/500, a nominal quarter-degree cell area that had drifted
      // 16x from the pooled forest layers).
      try {
        map.setPaintProperty(FILL, 'fill-color',
          buildColorExpr(v, dark, refs.current.colorRange, { alphaMin: 0.1 }, config,
                         unitIntensityExpr(config, v)))
        map.setFilter(FILL, null)
      } catch {}
      if (v.diverging) return
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

    function ensure() {
      if (!map.getStyle?.()) return
      // Lazy creation: layers born visibility:none never trigger tile
      // loading under the pmtiles protocol, so don't create until the
      // regional view is first activated. And STRICTLY no-op when the
      // layers already exist — re-setting layout/paint on every idle
      // keeps the style permanently dirty and tile loads never finish.
      if (map.getLayer(FILL)) return
      if (!(refs.current.active || refs.current.everActive)) return
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
        if (!map.getLayer(SEL)) {
          map.addLayer({ id: SEL, type: 'line', source: SRC, 'source-layer': sl,
                         filter: selectionFilter(refs.current.selectedUnit),
                         paint: { 'line-color': isDark ? '#F8F8E8' : '#181838', 'line-width': 2 } })
        }
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
    // If the map is already idle at activation no event may fire — retry.
    const retry = setInterval(ensure, 400)
    const stopRetry = setTimeout(() => clearInterval(retry), 4000)
    map.on('mousemove', onMove)
    map.on('click', onClick)
    map.on('mouseout', onLeave)
    // repaint hooks for variable/theme/percentile changes
    refs.current.repaint = () => { paint() }
    refs.current.ensure = ensure
    return () => {
      clearInterval(retry)
      clearTimeout(stopRetry)
      map.off('styledata', ensure)
      map.off('idle', ensure)
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
  }, [map, active, variable, isDark, state.percentileRange, suppressed, catEntries, colorRange])

  // selection outline
  useEffect(() => {
    if (!map?.getStyle?.() || !map.getLayer?.(SEL)) return
    // Compound identity: unit_id alone collided in some tile vintages,
    // outlining unrelated polygons when e.g. Hawaii was selected.
    try { map.setFilter(SEL, selectionFilter(state.selectedUnit)) } catch {}
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
      {catEntries.length > 0 && (() => {
        const top = composition(tip.p, catEntries)[0]
        return top ? (
          <div style={{ marginTop: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: top.color,
              display: 'inline-block', marginRight: 4 }} />
            {top.label}
            <span style={{ opacity: 0.6 }}> · {Math.round(top.share * 100)}%</span>
          </div>
        ) : null
      })()}
      {!state.selectedUnit && (
        <span style={{ opacity: 0.5 }}> — click for statistics</span>
      )}
    </div>
  )
}
