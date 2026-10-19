/**
 * mining-water/WaterCost.jsx
 *
 * The "Trade-offs" view: what it costs to cut the stress-weighted water
 * use of mining, after the paper's Figure 2a.
 *
 * Contours. As in the paper, bands between frontiers solved for many
 * demand levels, coloured by cumulative metal demand. For all four minerals
 * they are the model's own demand sweep (runs.json, 31 levels). Single-
 * mineral curves exist only for the three IEA cases, so for one mineral the
 * bands are interpolated between those three by demand.
 *
 * Fish biodiversity. With impact = 'fish' the curves are the chosen scenario's demand
 * with basins above a fish-index threshold closed to mining (Extended Data
 * Fig. 6). Deltas are then measured from the least-cost solution with no
 * protection, so the cost of protection shows.
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
  if (a.unmetCo != null) o.unmetCo = lerp(a.unmetCo, b.unmetCo, f)
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

const fishLabel = (k) => (k === 'none' ? 'No protection' : `Fish index > ${k}`)

export default function WaterCost({ data, scenario, material, compact = false, impact = 'water', fishLevel = '70', mineStats = null, onStep = null }) {
  const box = useRef(null)
  const svgRef = useRef(null)
  const w = useWidth(box)
  const h = Math.round(compact ? Math.min(380, Math.max(240, w * 0.7)) : Math.min(520, Math.max(320, w * 0.6)))
  const narrow = w < 560
  const m = { t: 18, r: narrow ? 58 : 86, b: 48, l: narrow ? 52 : 64 }

  const fish = impact === 'fish' && data.runs?.fish
  const curves = fish
    ? Object.keys(data.runs.fish.byScenario[scenario].series).map((k) => ({ s: k, label: fishLabel(k), pts: data.runs.fish.byScenario[scenario].series[k] }))
    : data.scenarios.map((s) => ({ s, label: s, pts: data.series[s][material], d: data.demandMt[s][material] }))
  const sel = fish ? data.runs.fish.byScenario[scenario].series[fishLevel] : data.series[scenario][material]
  const selKey = fish ? fishLevel : scenario
  const n = sel.length

  // Default handle at the 10% cost ceiling; kept per scenario/material change.
  const tAt = (step) => Math.max(0, sel.findIndex((p) => p.step === step))
  const [t, setT] = useState(tAt('10%'))
  useEffect(() => { setT(tAt('10%')) }, [scenario, material, impact, fishLevel]) // eslint-disable-line react-hooks/exhaustive-deps
  const stepIdx = Math.round(t)
  useEffect(() => { onStep?.(stepIdx) }, [stepIdx, onStep])

  // Demand bands: the solved sweep for all minerals, else interpolated
  // between the three IEA frontiers. None in the fish view.
  const sweep = !fish && material === 'All' && data.runs?.sweep
  const bands = useMemo(() => {
    if (fish) return null
    if (sweep) {
      const L = sweep.map((r) => ({ d: r.demand, pts: r.pts.map(([cost, water]) => ({ cost, water })) }))
      return { dMin: L[0].d, dMax: L[L.length - 1].d, polys: L.slice(0, -1).map((l, k) => ({ d: (l.d + L[k + 1].d) / 2, pts: [...l.pts, ...[...L[k + 1].pts].reverse()] })) }
    }
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
  }, [data, material, fish]) // eslint-disable-line react-hooks/exhaustive-deps

  const allPts = [...curves.flatMap((c) => c.pts), ...(bands ? bands.polys.flatMap((b) => b.pts) : [])]
  const u = units(Math.max(...allPts.map((p) => p.cost)), Math.max(...allPts.map((p) => p.water)))
  const wMax = Math.max(...allPts.map((p) => p.water))
  const cMin = Math.min(...allPts.map((p) => p.cost)), cMax = Math.max(...allPts.map((p) => p.cost))
  const x = scaleLinear().domain([0, u.water(wMax) * 1.04]).nice().range([m.l, w - m.r])
  const y = scaleLinear().domain([u.cost(cMin - (cMax - cMin) * 0.06), u.cost(cMax + (cMax - cMin) * 0.04)]).nice().range([h - m.b, m.t])
  const X = (p) => x(u.water(p.water)), Y = (p) => y(u.cost(p.cost))
  const ln = d3line().x(X).y(Y)

  // Deltas from the least-cost point; in the fish view, the least-cost point
  // with no protection.
  const base = fish ? data.runs.fish.byScenario[scenario].series.none[0] : sel[0]
  const cur = at(sel, t)
  const ms = mineStats?.[stepIdx]

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
  // Mouse and pen drag through pointer events. Touch is handled separately
  // below: iOS Safari ignores touch-action on SVG, so the scrolling panel
  // takes the gesture and cancels the pointer stream mid-drag.
  const onDown = (e) => {
    if (e.pointerType === 'touch') return
    const b = project(e.clientX, e.clientY)
    if (b.d > 40) return
    dragging.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setT(b.t)
  }
  const onMove = (e) => { if (e.pointerType !== 'touch' && dragging.current) setT(project(e.clientX, e.clientY).t) }
  const onUp = (e) => { if (e.pointerType !== 'touch') dragging.current = false }

  // Touch: non-passive listeners, so a touch that starts on or near the
  // curve can stop the page from scrolling (React's touch handlers are
  // passive and cannot). A touch that starts away from it scrolls as usual.
  const projectRef = useRef(project)
  projectRef.current = project
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let active = false
    const start = (e) => {
      if (e.touches.length !== 1) return
      const tch = e.touches[0]
      const b = projectRef.current(tch.clientX, tch.clientY)
      if (b.d > 44) return
      active = true
      e.preventDefault()
      setT(b.t)
    }
    const move = (e) => {
      if (!active) return
      e.preventDefault()
      const tch = e.touches[0]
      setT(projectRef.current(tch.clientX, tch.clientY).t)
    }
    const end = () => { active = false }
    el.addEventListener('touchstart', start, { passive: false })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [])
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setT((v) => Math.max(0, v - 0.25)); e.preventDefault() }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setT((v) => Math.min(n - 1, v + 0.25)); e.preventDefault() }
  }

  const dCost = cur.cost - base.cost, dWater = cur.water - base.water
  const what = fish || material === 'All' ? 'copper, nickel, cobalt and lithium' : material.toLowerCase()
  const barW = narrow ? 8 : 12, barH = h - m.t - m.b, barX = w - m.r + (narrow ? 10 : 34)

  return (
    <div className={compact ? '' : 'h-full overflow-y-auto'}>
      <div className={compact ? 'px-3 pb-3' : 'mx-auto px-4 py-4 md:px-8 md:py-6'} style={compact ? null : { maxWidth: 1000 }}>
        {!compact && <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Trade-offs · {fish ? `${scenario} · ${fishLabel(fishLevel)}` : `${scenario} · ${material === 'All' ? 'all minerals' : material}`}</p>}
        <p className="font-serif text-ink" style={{ fontSize: compact ? 17 : 23, fontWeight: 600, lineHeight: 1.2, margin: '2px 0 6px' }}>
          {fish
            ? 'What it costs to protect fish-rich rivers as well'
            : <>What it costs to mine {what} where water is more available</>}
        </p>
        <p className="text-ink-2 m-0" style={{ fontSize: compact ? 12 : 13, lineHeight: 1.5, maxWidth: 680, display: compact ? 'none' : undefined }}>
          The model meets demand at least cost, then is allowed a little more cost and asked to cut stress-weighted
          water use. Drag the point along the curve to see what each step buys. Totals are for 2025–2050.
        </p>

        <div ref={box} className="relative" style={{ marginTop: compact ? 6 : 14 }}>
          <svg
            ref={svgRef}
            width={w}
            height={h}
            role="img"
            aria-label={`Cost against stress-weighted water use for ${what}, ${fish ? `Net-zero, ${fishLabel(fishLevel)}` : `${scenario} scenario`}`}
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
              {bands?.polys.map((b, k) => (
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

            {/* Other scenarios (or protection levels), faint. In the fish view
                only the unprotected curve is labelled. */}
            {curves.filter((c) => c.s !== selKey).map((c) => (
              <g key={c.s}>
                <path d={ln(c.pts)} fill="none" stroke="var(--ink-3)" strokeWidth={1} strokeDasharray={fish && c.s !== 'none' ? '1 3' : '3 3'} />
                {(!fish || c.s === 'none') && <text x={X(c.pts[0]) + 6} y={Y(c.pts[0]) + 4} fill="var(--ink-3)" stroke="var(--paper)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" style={{ font: '10.5px var(--font-sans)' }}>{c.label}</text>}
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
              if (!p) return null
              // Offset along the curve's normal, to the side away from the
              // origin (up and to the right of a descending frontier), and
              // haloed so the label reads over the bands.
              const i = sel.indexOf(p)
              const a = sel[Math.max(0, i - 1)], b = sel[Math.min(n - 1, i + 1)]
              let nx = -(Y(b) - Y(a)), ny = X(b) - X(a)
              const L = Math.hypot(nx, ny) || 1
              nx /= L; ny /= L
              if (nx + -ny < 0) { nx = -nx; ny = -ny } // point up-right
              return (
                <text key={s} x={X(p) + nx * 16} y={Y(p) + ny * 16} dy="0.32em" textAnchor="start"
                  fill="var(--ink-2)" stroke="var(--paper)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
                  style={{ font: '600 10.5px var(--font-mono)' }}>+{s}</text>
              )
            })}
            <circle cx={X(sel[0])} cy={Y(sel[0])} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
            <text x={X(sel[0]) + 9} y={Y(sel[0]) + 4} fill="var(--ink-2)" stroke="var(--paper)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" style={{ font: '600 11px var(--font-sans)' }}>Least cost</text>
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
            {bands && Array.from({ length: 40 }, (_, k) => (
              <rect key={k} x={barX} y={m.t + (barH * (39 - k)) / 40} width={barW} height={barH / 40 + 0.5}
                fill={demandColor(k / 39)} fillOpacity={0.55} />
            ))}
            {bands && <rect x={barX} y={m.t} width={barW} height={barH} fill="none" stroke="var(--rule-strong)" />}
            {bands && (narrow ? [0, 1] : [0, 0.5, 1]).map((f) => (
              <text key={f} x={barX + barW + 3} y={m.t + barH * (1 - f)} dy="0.32em" fill="var(--ink-3)" style={{ font: `${narrow ? 9 : 10}px var(--font-mono)` }}>
                {fmt(lerp(bands.dMin, bands.dMax, f), bands.dMax < 100 ? 1 : 0)}
              </text>
            ))}
            {bands && !narrow && <text transform={`translate(${barX - 6},${m.t + barH / 2}) rotate(-90)`} textAnchor="middle" fill="var(--ink-3)" style={{ font: '10px var(--font-sans)' }}>
              Metal demand 2025–2050, Mt
            </text>}
          </svg>
        </div>

        {/* Keyboard focus shows as a ring; a pointer drag shows none. */}
        <style>{`.mw-handle:focus{outline:none}.mw-handle:focus-visible{stroke:var(--ink);stroke-width:3}`}</style>

        {/* Readout */}
        <div className="border-t border-rule" style={{ marginTop: 6, paddingTop: 10, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? 130 : 170}px, 1fr))`, gap: compact ? 10 : 14 }}>
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
              {dCost >= 0 ? '+' : '−'}${fmt(Math.abs(dCost))}bn · {signed((100 * dCost) / base.cost, 1)}%{fish ? ' vs. no protection' : ''}
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
          {ms && (
            <div>
              <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Deposits mined</p>
              <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmt(ms.n)} of {fmt(ms.total)}</p>
              <p className="font-mono text-ink-3 m-0" style={{ fontSize: 11 }}>+{ms.added} · −{ms.dropped} vs. {fish ? 'no protection' : 'least cost'}</p>
            </div>
          )}
          {fish && cur.unmetCo > 0.005 && (
            <div>
              <p className={eyebrowCls} style={{ margin: '0 0 3px' }}>Cobalt demand unmet</p>
              <p className="text-ink m-0" style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmt(cur.unmetCo, 2)} Mt</p>
              <p className="font-mono text-ink-3 m-0" style={{ fontSize: 11 }}>2025–2050 · cost includes a penalty for it</p>
            </div>
          )}
        </div>

        <p className="text-ink-3 m-0" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 14, maxWidth: 760 }}>
          Costs are discounted US dollars; water is weighted by AWARE 2.0 basin scarcity (m³ world-equivalent).
          {bands && sweep && ' Shading shows how the curve moves with cumulative metal demand (colour bar, Mt of metal, 2025–2050): each band lies between two of the model’s 31 demand levels.'}
          {bands && !sweep && ' Shading shows how the curve moves with cumulative metal demand (colour bar, Mt of metal, 2025–2050), interpolated between the three IEA scenarios, the only demand levels solved mineral by mineral.'}
          {fish && ` ${{ 'Current policies': 'Current-policies', Pledges: 'Pledged-policies', 'Net-zero': 'Net-zero' }[scenario] ?? scenario} demand. Each dotted curve closes basins above a fish biodiversity index (0–100, from IUCN fish ranges) to mining, along with basins that drain into them; the tighter the threshold, the higher the curve. Shortfalls are cobalt, much of which lies in fish-rich basins; where demand goes unmet, total cost includes the model’s penalty for the shortfall.`}
          {' The map behind follows the point: deposits the model mines at that cost ceiling, those it adds and those it drops.'}
          {!fish && material !== 'All' && ' Single-mineral curves are the paper’s per-kilogram results times that mineral’s demand; the cost ceiling applies to all four minerals together, so one mineral’s cost can move either way.'}
        </p>
      </div>
    </div>
  )
}
