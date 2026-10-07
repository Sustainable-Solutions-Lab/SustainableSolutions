/**
 * The range of impacts: every industry at full AI progress, in general
 * equilibrium. Each dot is an industry at its median change across the
 * scenario ensemble for the chosen growth case, in one of five lanes by
 * sector type (clusters of the GE force mix, ai-labor analysis/ws4-clusters),
 * coloured by its all-scenario jobs verdict and sized by employment. The metric is the
 * change in jobs or in the industry's average real wage. Tap or click a dot
 * to select the industry (its name and range appear); the selection drives
 * the rest of the tool. Data: ./data/tool.json (ai-labor web/build_tool_data.py).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { VERDICT, pctChange, shortName, svgLabel, svgText, useTip } from './ui.jsx';

// Sector types, top to bottom from the best to the worst typical jobs outcome.
export const LANES = [
  ['Income-elastic care', 'Income-elastic care'],
  ['Saturated in-person services', 'Saturated in-person services'],
  ['Exposed but attention-shielded', 'Exposed, attention-shielded'],
  ['Mixed goods and utilities', 'Mixed goods and utilities'],
  ['Exposed desk work', 'Exposed desk work'],
];
const LANE_OF = Object.fromEntries(LANES.map(([t], i) => [t, i]));

function jitter(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h / 997 - 0.5) * 2;
}

function niceTicks(lo, hi, n) {
  const step = [0.1, 0.2, 0.25, 0.5, 1].find((s) => (hi - lo) / s <= n) ?? 1;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}

export default function OutlookChart({ sectors, metric, growth, selCode, onPick }) {
  const tip = useTip();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = tip.ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tip.ref]);
  const svgRef = useRef(null);
  const W = narrow ? 380 : 640, H = narrow ? 372 : 322, M = { l: 8, r: 8, t: 22, b: 40 };
  const laneH = (H - M.t - M.b) / LANES.length;

  const val = (s) => s.by_growth[growth][metric];
  const [xmin, xmax] = useMemo(() => {
    const meds = sectors.map((s) => val(s)[1] - 1);
    const lo = Math.min(0, ...meds), hi = Math.max(0, ...meds);
    const pad = 0.06 * (hi - lo || 1);
    return [lo - pad, hi + pad];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectors, metric, growth]);
  const sx = (j) => M.l + ((j - 1 - xmin) / (xmax - xmin)) * (W - M.l - M.r);

  const pts = sectors.map((s) => {
    const lane = LANE_OF[s.type];
    const v = val(s);
    return { s, v, x: sx(v[1]), y: M.t + laneH * (lane + 0.5) + jitter(s.code) * laneH * 0.3,
             r: 2.5 + 2.2 * Math.sqrt(s.emp ?? 0.1), color: VERDICT[s.verdict].color };
  });
  const sel = pts.find((p) => p.s.code === selCode);
  const nearest = (ev) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const fx = ((ev.clientX - box.left) / box.width) * W, fy = ((ev.clientY - box.top) / box.height) * H;
    let best = null, bd = 18;
    for (const p of pts) {
      const d = Math.hypot(p.x - fx, p.y - fy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  const ticks = niceTicks(xmin, xmax, narrow ? 4 : 7);
  const what = metric === 'jobs' ? 'jobs' : 'average real wage';

  return (
    <div ref={tip.ref} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
        style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer', touchAction: 'manipulation' }}
        aria-label={`Each industry's median change in ${what} at full AI progress; tap a dot to select it`}
        onPointerMove={(ev) => {
          if (ev.pointerType === 'touch') return;
          const p = nearest(ev);
          if (p) tip.show(ev, `${p.s.name}: ${pctChange(p.v[1])}`); else tip.hide();
        }}
        onPointerLeave={tip.hide}
        onClick={(ev) => { const p = nearest(ev); if (p) { onPick(p.s.code); tip.hide(); } }}>
        {LANES.map(([t, short], i) => (
          <g key={t}>
            {i > 0 && <line x1={M.l} x2={W - M.r} y1={M.t + laneH * i} y2={M.t + laneH * i} stroke="var(--rule)" />}
            <text x={M.l} y={M.t + laneH * i + 12} style={{ ...svgText, fill: 'var(--ink-2)', paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>{narrow ? short : t}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(1 + t)} x2={sx(1 + t)} y1={M.t} y2={H - M.b} stroke={t === 0 ? 'var(--ink)' : 'var(--rule)'}
              strokeWidth={t === 0 ? 1.1 : 0.6} />
            <text x={sx(1 + t)} y={H - M.b + 15} textAnchor="middle" style={{ ...svgText, fill: t === 0 ? 'var(--ink)' : 'var(--ink-3)' }}>
              {t === 0 ? '0' : pctChange(1 + t)}
            </text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" style={svgLabel}>
          {narrow ? `median change in ${what}` : `change in the industry's ${what} at full AI progress (median across scenarios)`}
        </text>
        {sel && (
          <line x1={Math.max(sx(sel.v[0]), M.l)} x2={Math.min(sx(sel.v[2]), W - M.r)} y1={sel.y} y2={sel.y} stroke={sel.color}
            strokeWidth="3" strokeOpacity="0.45" strokeLinecap="round" />
        )}
        {/* selected circle drawn last so it sits on top */}
        {[...pts.filter((p) => p.s.code !== selCode), ...(sel ? [sel] : [])].map((p) => (
          <circle key={p.s.code} cx={p.x} cy={p.y} r={p.r} fill={p.color}
            fillOpacity={p.s.code === selCode ? 1 : 0.55}
            stroke={p.s.code === selCode ? 'var(--ink)' : 'var(--paper)'}
            strokeWidth={p.s.code === selCode ? 1.6 : 0.8} />
        ))}
        {sel && (() => {
          // Left-anchored and clamped inside the plot so the start of the name
          // always shows; a name too long for the width ends in an ellipsis.
          const CH = 6.4, pct = ` ${pctChange(sel.v[1])}`, room = W - M.l - M.r;
          let name = shortName(sel.s.name);
          if ((name.length + pct.length) * CH > room) name = `${name.slice(0, Math.max(4, Math.floor(room / CH) - pct.length - 1))}…`;
          const w = (name.length + pct.length) * CH;
          const x = Math.min(Math.max(sel.x - w / 2, M.l), W - M.r - w);
          return (
            <text x={x} y={(sel.y - M.t) % laneH < 26 ? sel.y + sel.r + 12 : sel.y - sel.r - 5} textAnchor="start"
              style={{ ...svgLabel, fontSize: 11, fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
              {name}{pct}
            </text>
          );
        })()}
      </svg>
      {tip.node}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4, fontSize: 12, color: 'var(--ink-2)' }}>
        {['loses', 'contested', 'gains'].map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: VERDICT[v].color, opacity: 0.75, display: 'inline-block' }} />
            {VERDICT[v].lab}
          </span>
        ))}
      </div>
    </div>
  );
}
