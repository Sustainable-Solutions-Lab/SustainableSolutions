/** ui/Results.jsx — headline totals, the supply curve and the country ranking. */
import { useMemo } from 'react'
import { supplyCurve, byCountry } from '../engine/aggregate.js'
import { fmt, fmtMha, fmtGt, fmtBn } from '../map/format.js'
import { Section } from './controls.jsx'

function SupplyCurve({ sc, maxCost }) {
  const W = 300, H = 130, pad = { l: 40, r: 8, t: 8, b: 22 }
  if (!sc.curve.length) return <p className="note">No eligible cells mitigate anything under these settings.</p>
  const xmax = sc.totalMt || 1
  const x = (mt) => pad.l + (mt / xmax) * (W - pad.l - pad.r)
  const y = (c) => pad.t + (1 - Math.max(0, Math.min(maxCost, c)) / maxCost) * (H - pad.t - pad.b)
  const d = sc.curve.map((p, k) => `${k ? 'L' : 'M'}${x(p.mt).toFixed(1)},${y(p.cost).toFixed(1)}`).join(' ')
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Marginal abatement cost curve">
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} className="grid" x1={pad.l} x2={W - pad.r} y1={y(f * maxCost)} y2={y(f * maxCost)} />)}
        <line className="axis" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        <line className="axis" x1={pad.l} x2={pad.l} y1={pad.t} y2={y(0)} />
        {[100].map((p) => <line key={p} className="mark" x1={pad.l} x2={x(sc.atPrice[p])} y1={y(p)} y2={y(p)} />)}
        <path className="curve" d={d} />
        {[0.5, 1].map((f) => <text key={f} x={pad.l - 4} y={y(f * maxCost) + 3} textAnchor="end">{fmt(f * maxCost, '$')}</text>)}
        <text x={pad.l - 4} y={y(0) + 3} textAnchor="end">0</text>
        <text x={pad.l} y={H - 6}>0</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end">{fmtGt(sc.totalMt * 1e6)}</text>
        <text x={x(sc.atPrice[100]) + 3} y={y(100) - 3}>{fmtGt(sc.atPrice[100] * 1e6)} ≤ $100</text>
      </svg>
      <p className="caption">Cells ranked by cost per tonne; cumulative abatement over the horizon along the bottom. Costs above {fmt(maxCost, '$')}/t are clipped.</p>
    </>
  )
}

export function Results({ res, grid }) {
  const sc = useMemo(() => supplyCurve(res, { maxCost: 500 }), [res])
  const countries = useMemo(() => byCountry(res, grid.layers.country_id, grid.countries, 10), [res, grid])
  const t = res.totals
  const priced = res.def.finance.carbonPrice
  return (
    <Section title="Results" defaultOpen>
      <div className="kpis">
        <div className="kpi"><div className="v">{fmtMha(t.areaHa)}</div><div className="k">Treated area</div></div>
        <div className="kpi"><div className="v">{fmtGt(t.mitTotal)}</div><div className="k">Abatement, {res.T} yr</div></div>
        <div className="kpi"><div className="v">{fmtBn(t.costNPV)}</div><div className="k">Cost, present value</div></div>
        <div className="kpi"><div className="v">{fmt(t.lcoa, '$/t')}</div><div className="k">Mean cost per t CO₂e</div></div>
        <div className="kpi"><div className="v">{fmtGt(sc.atPrice[100] * 1e6)}</div><div className="k">At or below $100/t</div></div>
        <div className="kpi"><div className="v">{fmtBn(t.netBenefit)}</div><div className="k">Net benefit at ${priced}/t</div></div>
      </div>
      {t.missing ? <p className="hint warn">{t.missing.toLocaleString()} eligible cells lack an input layer and are left out.</p> : null}
      <SupplyCurve sc={sc} maxCost={500} />
      <Section title="By country" defaultOpen={false}>
        <table className="table">
          <thead><tr><th>Country</th><th className="num">Mt CO₂e</th><th className="num">$/t</th></tr></thead>
          <tbody>
            {countries.map((c) => <tr key={c.id}><td>{c.name}</td><td className="num">{(c.mitTotal / 1e6).toFixed(0)}</td><td className="num">{fmt(c.lcoa, '')}</td></tr>)}
          </tbody>
        </table>
      </Section>
    </Section>
  )
}
