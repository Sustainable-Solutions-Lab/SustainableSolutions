/**
 * components/map/region-stats.jsx
 *
 * Statistics panel for a selected admin-1 x biome unit (Regional view):
 * the active variable's total and per-area intensity for the unit, plus a
 * mini distribution of the unit's underlying 0.25-degree cell values —
 * queried live from the cell tiles via the `u` (unit id) prop.
 */

import { useMemo } from 'react'
import { Actions } from '../../contracts/events.js'
import { readVarValue } from '../../lib/variable-value.js'
import { composition } from '../../lib/analysis-categorical.js'
import { PaleSeriesChart } from '../area-tool/trend-chart.jsx'

const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"

function MiniDist({ values, isDark }) {
  if (!values || values.length < 5) return null
  const W = 216
  const H = 44
  const BINS = 36
  const max = Math.max(...values)
  if (!(max > 0)) return null
  const bins = new Array(BINS).fill(0)
  for (const v of values) {
    bins[Math.min(BINS - 1, Math.floor((v / max) * BINS))] += 1
  }
  const bmax = Math.max(...bins)
  const bar = isDark ? 'rgba(248,248,232,0.55)' : 'rgba(24,24,56,0.5)'
  const muted = isDark ? 'rgba(248,248,232,0.45)' : 'rgba(24,24,56,0.45)'
  return (
    <div style={{ marginTop: 6 }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {bins.map((b, i) => (
          <rect key={i} x={(i * W) / BINS} width={W / BINS - 1}
            y={H - (b / bmax) * (H - 4)} height={(b / bmax) * (H - 4)} fill={bar} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 8, color: muted }}>
        <span>0</span>
        <span>{values.length} cells · max {max < 10 ? max.toFixed(2) : Math.round(max)} kt</span>
      </div>
    </div>
  )
}

/**
 * Top contributors by source and by commodity — the numbers behind the
 * dominance maps. Shares are of the region's 2020 total for that axis.
 */
export function Composition({ props, taxonomy, isDark, max = 3 }) {
  if (!props || !taxonomy) return null
  const axes = [
    ['Sources', taxonomy.sources.map((s) => ({ ...s, prop: s.id }))],
    ['Commodities', taxonomy.commodities.map((c) => ({ ...c, prop: `tot_${c.id}` }))],
  ]
  const muted = isDark ? 'rgba(248,248,232,0.5)' : 'rgba(24,24,56,0.5)'
  const text = isDark ? 'rgba(248,248,232,0.9)' : 'rgba(24,24,56,0.9)'
  const rendered = axes
    .map(([title, entries]) => [title, composition(props, entries).slice(0, max)])
    .filter(([, rows]) => rows.length > 0)
  if (rendered.length === 0) return null
  return (
    <div style={{ marginTop: 7 }}>
      {rendered.map(([title, rows]) => (
        <div key={title} style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 8, letterSpacing: '0.08em', color: muted, marginBottom: 1 }}>
            TOP {title.toUpperCase()}
          </div>
          {rows.map((r) => (
            <div key={r.prop} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: r.color, flexShrink: 0 }} />
              <span style={{ color: text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.label}
              </span>
              <span style={{ color: muted, flexShrink: 0 }}>{Math.round(r.share * 100)}%</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Change contributions for a selected unit, straight from the LMDI props
 * baked into the unit tiles (percentages of the unit's 2000 emissions, so
 * the four terms sum to the net change).
 */
function ChangeContributions({ props, isDark }) {
  if (props?.r_net == null) return null
  const rows = [
    ['Population', props.r_pop],
    ['Production / capita', props.r_prodpc],
    ['Land / kcal', props.r_landkcal],
    ['Emissions / ha', props.r_eland],
  ].filter(([, v]) => v != null)
  if (rows.length === 0) return null
  const muted = isDark ? 'rgba(248,248,232,0.5)' : 'rgba(24,24,56,0.5)'
  const text = isDark ? 'rgba(248,248,232,0.9)' : 'rgba(24,24,56,0.9)'
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)), Math.abs(props.r_net), 1)
  const HALF = 52
  const fmt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ fontSize: 8, letterSpacing: '0.08em', color: muted, marginBottom: 2 }}>
        CHANGE 2000–2023 · {fmt(props.r_net)} OF 2000
      </div>
      {rows.map(([label, v]) => {
        const w = (Math.abs(v) / max) * HALF
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
            <span style={{ fontSize: 9, color: text, width: 96, flexShrink: 0, textAlign: 'right' }}>
              {label}
            </span>
            <div style={{ position: 'relative', width: 2 * HALF, height: 8, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: HALF, top: 0, bottom: 0, width: 1,
                background: muted, opacity: 0.5 }} />
              <div style={{
                position: 'absolute', left: v >= 0 ? HALF : HALF - w, width: Math.max(1, w),
                top: 1, bottom: 1, background: v >= 0 ? '#D53E4F' : '#3288BD', opacity: 0.85,
              }} />
            </div>
            <span style={{ fontSize: 9, color: muted, whiteSpace: 'nowrap' }}>{fmt(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function RegionStats({ map, state, dispatch, activeVariable, isDark, config = null }) {
  const unit = state.selectedUnit
  // Unit-as-region weights for the PALE factor series: the unit's own
  // reference-year source sums under its country.
  const unitWeights = useMemo(() => {
    if (!unit?.props || !config?.areaTool?.trend) return null
    const w = {}
    const rec = {}
    for (const src of config.areaTool.trend.sources) {
      const v = Number(unit.props[src.prop] ?? 0)
      if (v > 0) rec[src.prop] = v
    }
    if (Object.keys(rec).length === 0) return null
    w[String(unit.props.m49 ?? 0)] = rec
    return w
  }, [unit, config])
  const cellValues = useMemo(() => {
    if (!map || !unit || !activeVariable) return []
    try {
      const feats = map.querySourceFeatures('just-air-data', { sourceLayer: 'food-emissions' })
      const out = []
      const seen = new Set()
      for (const f of feats) {
        const p = f.properties
        if (!p || p.u !== unit.id || p._scale !== 28) continue
        const k = `${f.geometry?.coordinates?.[0]},${f.geometry?.coordinates?.[1]}`
        if (seen.has(k)) continue
        seen.add(k)
        const v = readVarValue(p, activeVariable)
        if (v != null && isFinite(v) && v > 0) out.push(v)
      }
      return out
    } catch { return [] }
  }, [map, unit?.id, activeVariable])

  if (!unit || state.mapView !== 'regional') return null
  const p = unit.props
  const total = activeVariable ? readVarValue(p, activeVariable) : null
  const intens = total != null && p.area_km2 ? (total * 1000) / p.area_km2 : null
  const text = isDark ? 'rgba(248,248,232,0.9)' : 'rgba(24,24,56,0.9)'
  const muted = isDark ? 'rgba(248,248,232,0.5)' : 'rgba(24,24,56,0.5)'

  return (
    <div style={{
      position: 'absolute', left: 12, bottom: 96, zIndex: 15, width: 240,
      background: isDark ? 'rgba(12,12,28,0.94)' : 'rgba(248,248,232,0.96)',
      border: `1px solid ${isDark ? 'rgba(248,248,232,0.2)' : 'rgba(24,24,56,0.2)'}`,
      borderRadius: 4, padding: '10px 12px',
      fontFamily: FONT_MONO, color: text,
    }}>
      <button
        type="button"
        onClick={() => dispatch({ type: Actions.SELECT_UNIT, unit: null })}
        aria-label="Close region statistics"
        style={{ position: 'absolute', top: 6, right: 8, background: 'transparent',
                 border: 'none', color: muted, cursor: 'pointer', fontSize: 13, padding: 2 }}
      >×</button>
      <div style={{ fontSize: 11, fontWeight: 700, paddingRight: 14 }}>{p.name}</div>
      <div style={{ fontSize: 9, color: muted, marginBottom: 6 }}>
        {p.country} · {Number(p.area_km2 ?? 0).toLocaleString()} km²
        {p.ha ? ` · ${Math.round(p.ha / 1000).toLocaleString()} kha cropland` : ''}
      </div>
      {p.r_net != null && p.e2020_kt != null && (
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {Math.round(p.e2020_kt).toLocaleString()} kt CO₂e
          <span style={{ fontSize: 9, color: muted, fontWeight: 400 }}> in 2020</span>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {p.r_net != null ? null : total != null
          ? activeVariable?.rawRead
            ? `${total < 10 ? total.toFixed(2) : Math.round(total).toLocaleString()} ${activeVariable.unit ?? ''}`
            : `${Math.round(total).toLocaleString()} kt CO₂e`
          : '—'}
      </div>
      <div style={{ fontSize: 9, color: muted }}>
        {!activeVariable?.rawRead && intens != null
          ? `${intens < 10 ? intens.toFixed(1) : Math.round(intens).toLocaleString()} t CO₂e / km²` : ''}
      </div>
      <ChangeContributions props={p} isDark={isDark} />
      <Composition props={p} taxonomy={config?.paleMap?.taxonomy} isDark={isDark} />
      {unitWeights && config?.areaTool?.trend ? (
        <PaleSeriesChart
          trendConfig={config.areaTool.trend}
          trendWeights={unitWeights}
          isDark={isDark}
        />
      ) : (
        <MiniDist values={cellValues} isDark={isDark} />
      )}
    </div>
  )
}
