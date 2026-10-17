/**
 * mining-water/WaterCost.jsx
 *
 * The "Water vs. cost" view: what it costs to cut the stress-weighted water
 * use of mining, after the paper's Figure 2a.
 *
 * Contours. The paper shades bands between frontiers solved for eleven
 * demand levels, coloured by cumulative metal demand. Only three of those
 * runs are public (the IEA Current policies, Pledges and Net-zero cases), so
 * the bands here are interpolated between those three frontiers by demand,
 * step by step along the cost ceiling. They show how the trade-off shifts
 * with demand; they are not additional model runs. Swap in the solved sweep
 * by adding its frontiers to frontier.json (scripts/build-mining-water.mjs).
 *
 * Curve and handle. The selected scenario and material draw as a curve over
 * the bands. Its handle can be dragged along the curve (or moved with the
 * arrow keys); the readout gives cost and water at that point, absolute and
 * relative to the least-cost solution.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'

const SPECTRAL = ['#9E0142', '#D53E4F', '#F46D43', '#FDAE61', '#FEE08B', '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD', '#5E4FA2']
const BANDS = 10 // interpolated demand levels between the lowest and highest scenario

const eyebrowCls = 'font-mono text-xs uppercase tracking-wider text-ink-3 leading-none'
const fmt = (v, d = 0) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }))
const signed = (v, d = 0) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), d)}`
const stepNum = (s) => Number(String(s).replace('%', ''))
const lerp = (a, b, t) => a + (b - a) * t

// Colour for a demand level: low demand blue, high demand red, as the paper.
function demandColor(t) {
  const c = SPECTRAL.slice(1, 9).reverse() // 3288BD … D53E4F
  const x = Math.max(0, Math.min(1, t)) * (c.length - 1)
  const i = Math.min(c.length - 2, Math.floor(x))
  const f = x - i
  const h = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16))
  const [a, b] = [h(c[i]), h(c[i + 1])]
  return `rgb(${a.map((v, k) => Math.round(lerp(v, b[k], f))).join(',')})`
}

// Pick units so axis numbers stay short: trillions when the range needs it.
function units(maxCost, maxWater) {
  const costT = maxCost >= 1500
  const waterT = maxWater >= 1500
  return {
    cost: (v) => (costT ? v / 1000 : v),
    water: (v) => (waterT ? v / 1000 : v),
    costLabel: costT ? '$ trillion' : '$ billion',
    waterLabel: waterT ? 'trillion m³-eq' : 'billion m³-eq',
    costTick: (v) => (costT ? `$${fmt(v, 1)}T` : `$${fmt(v)}bn`),
    costFull: (v) => (costT ? `$${fmt(v / 1000, 2)} trillion` : `$${fmt(v)} billion`),
    costDp: costT ? 2 : 0,
    waterDp: waterT ? 2 : 0,
  }
}

// Interpolate along a frontier at a continuous position t in [0, n-1].
function at(pts, t) {
  const i = Math.max(0, Math.min(pts.length - 2, Math.floor(t)))
  const f = Math.max(0, Math.min(1, t - i))
  const a = pts[i], b = pts[i + 1]
  const o = { step: lerp(stepNum(a.step), stepNum(b.step), f), cost: lerp(a.cost, b.cost, f), water: lerp(a.water, b.water, f) }
  if (a.mines != null) o.mines = lerp(a.mines, b.mines, f)
  if (a.consumed != null) o.consumed = lerp(a.consumed, b.consumed, f)
  return o
}

function useWidth(ref) {
  const [w, setW] = useState(720)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export default function WaterCost({ data, scenario, material }) {
  const box = useRef(null)
  const svgRef = useRef(null)
  const w = useWidth(box)
  const h = Math.round(Math.min(520, Math.max(320, w * 0.6)))
  const narrow = w < 560
  const m = { t: 18, r: narrow ? 58 : 86, b: 48, l: narrow ? 52 : 64 }

  const curves = data.scenarios.map((s) => ({ s, pts: data.series[s][material], d: data.demandMt[s][material] }))
  const sel = data.series[scenario][material]
  const n = sel.length

  // Default handle at the 10% cost ceiling; kept per scenario/material change.
  const tAt = (step) => Math.max(0, sel.findIndex((p) => p.step === step))
  const [t, setT] = useState(tAt('10%'))
  useEffect(() => { setT(tAt('10%')) }, [scenario, material]) // eslint-disable-line react-hooks/exhaustive-deps

  // Interpolated demand bands between the scenario frontiers.
  const bands = useMemo(() => {
    const sorted = [...curves].sort((a, b) => a.d - b.d)
    const dMin = sorted[0].d, dMax = sorted[sorted.length - 1].d
    const levels = Array.from({ length: BANDS + 1 }, (_, k) => dMin + ((dMax - dMin) * k) / BANDS)
    const curveAt = (d) => {
      let j = 0
      while (j < sorted.length - 2 && d > sorted[j + 1].d) j++
      const lo = sorted[j], hi = sorted[j + 1]
      const f = hi.d === lo.d ? 0 : (d - lo.d) / (hi.d - lo.d)
      return lo.pts.map((p, i) => ({ cost: lerp(p.cost, hi.pts[i].cost, f), water: lerp(p.water, hi.pts[i].water, f) }))
    }
    const lines = levels.map((d) => ({ d, pts: curveAt(d) }))
    return { dMin, dMax, polys: lines.slice(0, -1).map((l, k) => ({ d: (l.d + lines[k + 1].d) / 2, pts: [...l.pts, ...[...lines[k + 1].pts].reverse()] })) }
  }, [data, material]) // eslint-disable-line react-hooks/exhaustive-deps

  const allPts = curves.flatMap((c) => c.pts)
  const u = units(Math.max(...allPts.map((p) => p.cost)), Math.max(...allPts.map((p) => p.water)))
  const wMax = Math.max(...allPts.map((p) => p.water))
  const cMin = Math.min(...allPts.map((p) => p.cost)), cMax = Math.max(...allPts.map((p) => p.cost))
  const x = scaleLinear().domain([0, u.water(wMax) * 1.04]).nice().range([m.l, w - m.r])
  const y = scaleLinear().domain([u.cost(cMin - (cMax - cMin) * 0.06), u.cost(cMax + (cMax - cMin) * 0.04)]).nice().range([h - m.b, m.t])
  const X = (p) => x(u.water(p.water)), Y = (p) => y(u.cost(p.cost))
  const ln = d3line().x(X).y(Y)

  const base = sel[0]
  const cur = at(sel, t)

  // Drag: project the pointer onto the curve in screen space.
  const dragging = useRef(false)
  const project = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect()
    const px = clientX - r.left, py = clientY - r.top
    let best = { d: Infinity, t: 0 }
    for (let i = 0; i < n - 1; i++) {
      const ax = X(sel[i]), ay = Y(sel[i]), bx = X(sel[i + 1]), by = Y(sel[i + 1])
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1
      const f = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
      const d = Math.hypot(px - (ax + f * dx), py - (ay + f * dy))
      if (d < best.d) best = { d, t: i + f }
    }
    return best
  }
  const onDown = (e) => {
    const b = project(e.clientX, e.clientY)
    if (b.d > 40) return
    dragging.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setT(b.t)
  }
  const onMove = (e) => { if (dragging.current) setT(project(e.clientX, e.clientY).t) }
  const onUp = () => { dragging.current = false }
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setT((v) => Math.max(0, v - 0.25)); e.preventDefault() }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setT((v) => Math.min(n - 1, v + 0.25)); e.preventDefault() }
  }

  const dCost = cur.cost - base.cost, dWater = cur.water - base.water
  const what = material === 'All' ? 'copper, nickel, cobalt and lithium' : material.toLowerCase()
  const barW = narrow ? 8 : 12, barH = h - m.t - m.b, barX = w - m.r + (narrow ? 10 : 34)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 1000 }}>
        <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Water vs. cost · {scenario} · {material === 'All' ? 'all four minerals' : material}</p>
        <p className="font-serif text-ink" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.2, margin: '2px 0 6px' }}>
          What it costs to mine {what} where water is available
        </p>
        <p className="text-ink-2 m-0" style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
          The model meets demand at least cost, then is allowed a little more cost and asked to cut stress-weighted
          water use. Drag the point along the curve to see what each step buys. Totals are for 2025–2050.
        </p>

        <div ref={box} className="relative" style={{ marginTop: 14 }}>
          <svg
            ref={svgRef}
            width={w}
            height={h}
            role="img"
            aria-label={`Cost against stress-weighted water use for ${what}, ${scenario} scenario`}
            style={{ display: 'block', touchAction: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <defs>
              <clipPath id="mw-plot"><rect x={m.l} y={m.t} width={w - m.l - m.r} height={h - m.t - m.b} /></clipPath>
            </defs>
            {/* Demand bands */}
            <g clipPath="url(#mw-plot)">
              {bands.polys.map((b, k) => (
                <path key={k} d={`M${b.pts.map((p) => `${X(p)},${Y(p)}`).join('L')}Z`}
                  fill={demandColor((b.d - bands.dMin) / (bands.dMax - bands.dMin || 1))} fillOpacity={0.32} stroke="var(--paper)" strokeWidth={0.6} />
              ))}
            </g>
            {/* Axes */}
            {y.ticks(6).map((v) => (
              <g key={`y${v}`}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
                <text x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fill="var(--ink-3)" style={{ font: '11px var(--font-mono)' }}>{u.costTick(v)}</text>
              </g>
            ))}
            {x.ticks(6).map((v) => (
              <text key={`x${v}`} x={x(v)} y={h - m.b + 16} textAnchor="middle" fill="var(--ink-3)" style={{ font: '11px var(--font-mono)' }}>{fmt(v, v % 1 ? 1 : 0)}</text>
            ))}
            <line x1={m.l} x2={w - m.r} y1={h - m.b} y2={h - m.b} stroke="var(--rule-strong)" />
            <text x={(m.l + w - m.r) / 2} y={h - 8} textAnchor="middle" fill="var(--ink-2)" style={{ font: '12px var(--font-sans)' }}>
              Stress-weighted water use, {u.waterLabel}
            </text>
            {!narrow && <text transform={`translate(14,${(m.t + h - m.b) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--ink-2)" style={{ font: '12px var(--font-sans)' }}>
              Total cost, {u.costLabel}
            </text>}

            {/* Other scenarios, faint */}
            {curves.filter((c) => c.s !== scenario).map((c) => (
              <g key={c.s}>
                <path d={ln(c.pts)} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
                <text x={X(c.pts[0]) + 6} y={Y(c.pts[0]) + 4} fill="var(--ink-3)" style={{ font: '10.5px var(--font-sans)' }}>{c.s}</text>
              </g>
            ))}

            {/* Selected curve, least-cost point, handle */}
            <path d={ln(sel)} fill="none" stroke="var(--ink)" strokeWidth={2} />
            {sel.map((p) => (
              <circle key={p.step} cx={X(p)} cy={Y(p)} r={2.2} fill="var(--ink)" />
            ))}
            {['5%', '10%', '25%'].map((s) => {
              const p = sel.find((q) => q.step === s)
              // Hide a step label when the handle sits on it.
              if (p && Math.hypot(X(p) - X(cur), Y(p) - Y(cur)) < 22) return null
              return p ? <text key={s} x={X(p) - 7} y={Y(p) - 7} textAnchor="end" fill="var(--ink-3)" style={{ font: '10px var(--font-mono)' }}>+{s}</text> : null
            })}
            <circle cx={X(base)} cy={Y(base)} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
            <text x={X(base) + 9} y={Y(base) + 4} fill="var(--ink-2)" style={{ font: '600 11px var(--font-sans)' }}>Least cost</text>
            {/* Guides from the handle to the axes */}
            <line x1={X(cur)} x2={X(cur)} y1={Y(cur)} y2={h - m.b} stroke="var(--cardinal)" strokeDasharray="2 3" />
            <line x1={m.l} x2={X(cur)} y1={Y(cur)} y2={Y(cur)} stroke="var(--cardinal)" strokeDasharray="2 3" />
            <circle
              cx={X(cur)} cy={Y(cur)} r={9}
              fill="var(--cardinal)" stroke="var(--paper)" strokeWidth={2}
              className="mw-handle"
              style={{ cursor: 'grab' }}
              tabIndex={0}
              role="slider"
              aria-label="Allowed cost increase"
              aria-valuemin={0}
              aria-valuemax={stepNum(sel[n - 1].step)}
              aria-valuenow={Math.round(cur.step * 10) / 10}
              aria-valuetext={`${fmt(cur.step, 1)}% above least cost`}
              onKeyDown={onKey}
            />

            {/* Demand colour bar */}
            {Array.from({ length: 40 }, (_, k) => (
              <rect key={k} x={barX} y={m.t + (barH * (39 - k)) / 40} width={barW} height={barH / 40 + 0.5}
                fill={demandColor(k / 39)} fillOpacity={0.55} />
            ))}
            <rect x={barX} y={m.t} width={barW} height={barH} fill="none" stroke="var(--rule-strong)" />
            {(narrow ? [0, 1] : [0, 0.5, 1]).map((f) => (
              <text key={f} x={barX + barW + 3} y={m.t + barH * (1 - f)} dy="0.32em" fill="var(--ink-3)" style={{ font: `${narrow ? 9 : 10}px var(--font-mono)` }}>
                {fmt(lerp(bands.dMin, bands.dMax, f), bands.dMax < 100 ? 1 : 0)}
              </text>
            ))}
            {!narrow && <text transform={`translate(${barX - 6},${m.t + barH / 2}) rotate(-90)`} textAnchor="middle" fill="var(--ink-3)" style={{ font: '10px var(--font-sans)' }}>
              Metal demand 2025–2050, Mt
            </text>}
          </svg>
        </div>

        {/* Keyboard focus shows as a ring; a pointer drag shows none. */}
        <style>{`.mw-handle:focus{outline:none}.mw-handle:focus-visible{stroke:var(--ink);stroke-width:3}`}</style>

        {/* Readout */}
        <div className="border-t border-rule" style={{ marginTop: 6, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
          <div>
            <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Cost increase allowed</p>
            <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{cur.step < 0.05 ? 'None (least cost)' : `+${fmt(cur.step, 1)}%`}</p>
          </div>
          <div>
            <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Total cost</p>
            <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
              {u.costFull(cur.cost)}
            </p>
            <p className="font-mono text-ink-3 m-0" style={{ fontSize: 11 }}>
              {dCost >= 0 ? '+' : '−'}${fmt(Math.abs(dCost))}bn · {signed((100 * dCost) / base.cost, 1)}%
            </p>
          </div>
          <div>
            <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Stress-weighted water</p>
            <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmt(u.water(cur.water), u.waterDp)} {u.waterLabel}</p>
            <p className="font-mono text-ink-3 m-0" style={{ fontSize: 11 }}>
              {signed(dWater, 0)} bn m³-eq · {signed((100 * dWater) / base.water, 0)}%
            </p>
          </div>
          {dWater < 0 && (
            <div>
              <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Cost of water saved</p>
              <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>${fmt(dCost / -dWater, 2)} per m³-eq</p>
              <p className="font-mono text-ink-3 m-0" style={{ fontSize: 11 }}>average from least cost</p>
            </div>
          )}
          {cur.mines != null && (
            <div>
              <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Mines opened</p>
              <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmt(cur.mines)}</p>
              <p className="font-mono text-ink-3 m-0" style={{ fontSize: 11 }}>{signed(cur.mines - base.mines, 0)} vs least cost</p>
            </div>
          )}
        </div>

        <p className="text-ink-3 m-0" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 14, maxWidth: 760 }}>
          Costs are discounted US dollars; water is weighted by AWARE 2.0 basin scarcity (m³ world-equivalent).
          Shading shows how the curve moves with cumulative metal demand (colour bar, Mt of metal, 2025–2050). It interpolates between the three IEA
          scenarios the paper solves and published; it is not a set of additional model runs.
          {material !== 'All' && ' Single-mineral curves are the paper’s per-kilogram results times that mineral’s demand; the cost ceiling applies to all four minerals together, so one mineral’s cost can move either way.'}
        </p>
      </div>
    </div>
  )
}
