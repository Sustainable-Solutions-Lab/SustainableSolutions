/**
 * ui/Results.jsx — headline totals, the cost breakdown by category, and the
 * supply (marginal abatement cost) curve. Dragging along the curve selects
 * a run of cells by cost per tonne; the map then shows only those.
 */
import { useMemo, useRef, useState } from 'react'
import { supplyCurve, totalsOver } from '../engine/aggregate.js'
import { costCategory, COST_CATEGORIES } from '../engine/schema.js'
import { STATUS } from '../engine/evaluate.js'
import { fmt, fmtMha, fmtGt, fmtBn } from '../map/format.js'
import { Section } from './controls.jsx'

const W = 300, H = 140, PAD = { l: 40, r: 8, t: 8, b: 22 }

function SupplyCurve({ sc, maxCost, brush, onBrush }) {
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(null)
  if (!sc.curve.length) return <p className="note">No eligible cells mitigate anything under these settings.</p>
  const xmax = sc.totalMt || 1
  const x = (mt) => PAD.l + (mt / xmax) * (W - PAD.l - PAD.r)
  const xInv = (px) => Math.max(0, Math.min(xmax, ((px - PAD.l) / (W - PAD.l - PAD.r)) * xmax))
  const y = (c) => PAD.t + (1 - Math.max(0, Math.min(maxCost, c)) / maxCost) * (H - PAD.t - PAD.b)
  const d = sc.curve.map((p, k) => `${k ? 'L' : 'M'}${x(p.mt).toFixed(1)},${y(p.cost).toFixed(1)}`).join(' ')
  const costAt = (mt) => { let c = sc.curve[0].cost; for (const p of sc.curve) { if (p.mt > mt) break; c = p.cost }; return c }
  const toSvgX = (ev) => { const r = svgRef.current.getBoundingClientRect(); return ((ev.clientX - r.left) / r.width) * W }
  const start = (ev) => { ev.preventDefault(); svgRef.current.setPointerCapture?.(ev.pointerId); const mt = xInv(toSvgX(ev)); setDrag({ a: mt, b: mt }) }
  const move = (ev) => { if (!drag) return; setDrag({ ...drag, b: xInv(toSvgX(ev)) }) }
  const end = () => {
    if (!drag) return
    const lo = Math.min(drag.a, drag.b), hi = Math.max(drag.a, drag.b)
    setDrag(null)
    if (hi - lo < xmax * 0.01) { onBrush(null); return }
    onBrush({ mtLo: lo, mtHi: hi, costLo: lo <= 0 ? -Infinity : costAt(lo), costHi: costAt(hi) })
  }
  const sel = drag ? { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) } : brush ? { lo: brush.mtLo, hi: brush.mtHi } : null
  return (
    <>
      <svg ref={svgRef} className="chart brushable" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Marginal abatement cost curve; drag to select a range"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(f * maxCost)} y2={y(f * maxCost)} />)}
        {sel ? <rect className="brush" x={x(sel.lo)} width={Math.max(1, x(sel.hi) - x(sel.lo))} y={PAD.t} height={H - PAD.t - PAD.b} /> : null}
        <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
        <line className="axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={y(0)} />
        <line className="mark" x1={PAD.l} x2={x(sc.atPrice[100])} y1={y(100)} y2={y(100)} />
        <path className="curve" d={d} />
        {sel ? <><line className="brush-edge" x1={x(sel.lo)} x2={x(sel.lo)} y1={PAD.t} y2={y(0)} /><line className="brush-edge" x1={x(sel.hi)} x2={x(sel.hi)} y1={PAD.t} y2={y(0)} /></> : null}
        {[0.5, 1].map((f) => <text key={f} x={PAD.l - 4} y={y(f * maxCost) + 3} textAnchor="end">{fmt(f * maxCost, '$')}</text>)}
        <text x={PAD.l - 4} y={y(0) + 3} textAnchor="end">0</text>
        <text x={PAD.l} y={H - 6}>0</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end">{fmtGt(sc.totalMt * 1e6)}</text>
        <text x={x(sc.atPrice[100]) + 3} y={y(100) - 3}>{fmtGt(sc.atPrice[100] * 1e6)} ≤ $100</text>
      </svg>
      <p className="caption">
        Cells ranked by cost per tonne; cumulative abatement over the horizon along the bottom. Costs above {fmt(maxCost, '$')}/t are clipped.
        {brush ? <> Showing cells from {fmt(Math.max(0, brush.costLo), '$')} to {fmt(brush.costHi, '$')} per tonne ({fmtGt((brush.mtHi - brush.mtLo) * 1e6)}). <button type="button" className="btn link" onClick={() => onBrush(null)}>Clear</button></> : ' Drag along the curve to show only that run of cells on the map.'}
      </p>
    </>
  )
}

function byCategory(res, mask) {
  const { costs, status, mitTotal } = res
  const acc = new Map(COST_CATEGORIES.map((c) => [c.id, 0]))
  let mit = 0
  // Per-component PV restricted to the mask (per-cell recomputation of the
  // per-component dot products; cheap enough for one pass).
  for (let i = 0; i < status.length; i++) {
    if (status[i] !== STATUS.OK) continue
    if (mask && !mask[i]) continue
    mit += mitTotal[i]
    for (const c of costs) {
      let v
      if (c.perT) { v = 0; for (let k = 0; k < res.mit.length; k++) v += res.area[i] * res.mit[k].R[i] * c.gk[k]; v *= c.U[i] } else v = c.U[i] * c.H
      acc.set(c.def.category, (acc.get(c.def.category) ?? 0) + v)
    }
  }
  return COST_CATEGORIES.map((c) => ({ ...c, pv: acc.get(c.id) ?? 0, perT: mit > 0 ? (acc.get(c.id) ?? 0) / mit : NaN })).filter((c) => c.pv !== 0)
}

export function Results({ res, mask, focusLabel, brush, onBrush }) {
  const t = useMemo(() => totalsOver(res, mask), [res, mask])
  const sc = useMemo(() => supplyCurve(res, { mask, maxCost: 500 }), [res, mask])
  const cats = useMemo(() => byCategory(res, mask), [res, mask])
  const price = res.def.finance.carbonPrice
  const discounted = res.def.finance.discountCarbon
  return (
    <Section title="Results" aside={focusLabel ?? 'Whole world'} defaultOpen>
      <div className="kpis">
        <div className="kpi"><div className="v">{fmtMha(t.areaHa)}</div><div className="k">Treated area</div></div>
        <div className="kpi"><div className="v">{fmtGt(t.mitTotal)}</div><div className="k">Abatement, {res.T} yr</div></div>
        <div className="kpi"><div className="v">{fmtBn(t.costNPV)}</div><div className="k">Cost, present value</div></div>
        <div className="kpi"><div className="v">{fmt(t.lcoa, '$/t')}</div><div className="k">Mean cost per t CO₂e</div></div>
        <div className="kpi"><div className="v">{fmtGt(sc.atPrice[100] * 1e6)}</div><div className="k">At or below $100/t</div></div>
        <div className="kpi"><div className="v">{fmtBn(t.netBenefit)}</div><div className="k">Net benefit at ${price}/t</div></div>
      </div>
      {res.totals.missing ? <p className="hint warn">{res.totals.missing.toLocaleString()} eligible cells lack an input layer and are left out.</p> : null}
      <SupplyCurve sc={sc} maxCost={500} brush={brush} onBrush={onBrush} />
      <table className="table" style={{ marginTop: 8 }}>
        <thead><tr><th>Cost by category</th><th className="num">PV</th><th className="num">$/t{discounted ? ' (disc.)' : ''}</th></tr></thead>
        <tbody>
          {cats.map((c) => <tr key={c.id}><td title={c.description}>{c.short}</td><td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtBn(c.pv)}</td><td className="num">{Math.abs(c.perT) < 0.01 ? (c.perT < 0 ? '> −0.01' : '< 0.01') : fmt(c.perT, '')}</td></tr>)}
          <tr><td><strong>Total</strong></td><td className="num" style={{ whiteSpace: 'nowrap' }}><strong>{fmtBn(t.costNPV)}</strong></td><td className="num"><strong>{fmt(t.lcoa, '')}</strong></td></tr>
        </tbody>
      </table>
    </Section>
  )
}
