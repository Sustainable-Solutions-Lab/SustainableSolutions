/** map/DetailPanel.jsx — what the clicked cell is made of, over time. */
import { X } from 'lucide-react'
import { cellSeries, STATUS } from '../engine/evaluate.js'
import { rateLayers } from '../engine/rates.js'
import { fmt, fmtCoord } from './format.js'

function usedLayers(def) {
  const s = new Set([def.area.layer])
  for (const e of def.area.eligibility ?? []) s.add(e.layer)
  for (const m of def.mitigation) rateLayers(m.rate, s)
  for (const c of def.costs) { rateLayers(c.quantity, s); for (const m of c.modifiers ?? []) rateLayers(m, s) }
  s.delete('country_id')
  return [...s]
}

function MiniChart({ years, values, color = 'bar', unit, title }) {
  const W = 300, H = 72, pad = { l: 36, r: 4, t: 6, b: 16 }
  const n = values.length
  let lo = 0, hi = 0
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v }
  if (hi === lo) hi = lo + 1
  const x = (t) => pad.l + (t / n) * (W - pad.l - pad.r)
  const bw = Math.max(1, (W - pad.l - pad.r) / n - 1)
  const y = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b)
  return (
    <div style={{ marginTop: 6 }}>
      <p className="label" style={{ marginBottom: 2 }}>{title}</p>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line className="axis" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        {Array.from(values).map((v, t) => (
          <rect key={t} className={`bar ${v < 0 ? 'neg' : ''} ${color}`} x={x(t)} width={bw} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} />
        ))}
        <text x={pad.l - 4} y={pad.t + 8} textAnchor="end">{fmt(hi, '')}</text>
        <text x={pad.l - 4} y={y(0) + 3} textAnchor="end">0</text>
        <text x={pad.l} y={H - 3}>{years[0]}</text>
        <text x={W - pad.r} y={H - 3} textAnchor="end">{years[n - 1]}</text>
      </svg>
      <p className="caption" style={{ marginTop: 0 }}>{unit}</p>
    </div>
  )
}

export function DetailPanel({ grid, res, cell, onClose }) {
  if (cell == null || cell < 0) return null
  const def = res.def
  const [lon, lat] = grid.lonLatOf(cell)
  const country = grid.countryName(cell)
  const status = res.status[cell]
  const series = status === STATUS.OK ? cellSeries(res, cell) : null
  const layers = usedLayers(def)
  const perHa = (v) => (series && series.areaHa > 0 ? v / series.areaHa : NaN)

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <div className="detail-place">{country ?? 'Ocean or no data'}</div>
          <div className="detail-coord">{fmtCoord(lon, lat)} · {grid.res}° cell</div>
        </div>
        <button type="button" className="btn icon" onClick={onClose} aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
      </div>

      {status === STATUS.OUT ? (
        <p className="note">Not treated here: the cell fails the eligibility rules or has no area in “{grid.meta[def.area.layer]?.label ?? def.area.layer}”.</p>
      ) : status === STATUS.MISSING ? (
        <p className="note warn">Eligible, but an input layer the rates need has no value here, so nothing is computed.</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="v">{fmt(series.areaHa, 'ha')}</div><div className="k">Treated area</div></div>
            <div className="kpi"><div className="v">{fmt(res.lcoa[cell], '$/t')}</div><div className="k">Cost per t CO₂e</div></div>
            <div className="kpi"><div className="v">{fmt(perHa(res.netBenefit[cell]), '$/ha')}</div><div className="k">Net benefit</div></div>
            <div className="kpi"><div className="v">{fmt(perHa(res.mitTotal[cell]), 't/ha')}</div><div className="k">Abatement, {res.T} yr</div></div>
            <div className="kpi"><div className="v">{fmt(res.mitTotal[cell], 't')}</div><div className="k">Abatement, cell</div></div>
            <div className="kpi"><div className="v">{fmt(res.costNPV[cell], '$')}</div><div className="k">Cost, present value</div></div>
          </div>
          <MiniChart years={series.years} values={Array.from(series.mitigation, (v) => v / series.areaHa)} unit="t CO₂e per ha per year (net)" title="Carbon over time" />
          <MiniChart years={series.years} values={Array.from(series.cost, (v) => v / series.areaHa)} unit="$ per ha per year (undiscounted)" title="Cost over time" />
          <table className="table">
            <thead><tr><th>Cost component</th><th className="num">PV $/ha</th><th className="num">Share</th></tr></thead>
            <tbody>
              {res.costs.map((c, k) => {
                const pv = series.byCost[k].reduce((a, v, t) => a + v * res.df[t], 0)
                return <tr key={c.def.id}><td>{c.def.label}</td><td className="num">{fmt(pv / series.areaHa, '')}</td><td className="num">{res.costNPV[cell] ? `${Math.round((pv / res.costNPV[cell]) * 100)}%` : '—'}</td></tr>
              })}
            </tbody>
          </table>
          <table className="table">
            <thead><tr><th>Carbon effect</th><th className="num">Year 1 t/ha</th><th className="num">{res.T} yr t/ha</th></tr></thead>
            <tbody>
              {res.mit.map((m, k) => (
                <tr key={m.def.id}><td>{m.def.label}</td><td className="num">{fmt(m.R[cell] * m.g[0], '')}</td><td className="num">{fmt(series.byMit[k].reduce((a, b) => a + b, 0) / series.areaHa, '')}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <table className="table">
        <thead><tr><th>Input here</th><th className="num">Value</th></tr></thead>
        <tbody>
          {layers.map((id) => (
            <tr key={id}><td>{grid.meta[id]?.label ?? id}</td><td className="num">{fmt(grid.layers[id]?.[cell], grid.meta[id]?.unit ?? '')}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
