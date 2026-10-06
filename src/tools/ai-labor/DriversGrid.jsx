/**
 * Why industries differ: three small scatters placing every industry by the
 * characteristics that drive its outcome, coloured by its central-case change
 * in jobs or average real wage at full AI progress (general equilibrium,
 * central assumptions, chosen growth case). AI exposure and the human-
 * attention shield explain most of the jobs pattern without extra growth;
 * with growth, the income elasticity of demand joins them.
 */
import { useRef } from 'react';
import { changeColor, pctChange, shortName, svgText, useTip } from './ui.jsx';

const PANELS = [
  { x: 'expo', y: 'shield', xl: 'AI exposure (share of tasks automated)', yl: 'Human-attention shield', xr: [0.2, 0.9], yr: [0, 0.85] },
  { x: 'expo', y: 'eps', xl: 'AI exposure (share of tasks automated)', yl: 'Income elasticity of demand', xr: [0.2, 0.9], yr: [-0.6, 2.6] },
  { x: 'shield', y: 'eps', xl: 'Human-attention shield', yl: 'Income elasticity of demand', xr: [-0.05, 0.85], yr: [-0.6, 2.6] },
];
const fmt = (k, v) => (k === 'eps' ? v.toFixed(2) : `${Math.round(100 * v)}%`);

function Panel({ p, sectors, metric, growth, span, selCode, onPick }) {
  const tip = useTip();
  const svgRef = useRef(null);
  const W = 300, H = 230, M = { l: 50, r: 10, t: 10, b: 36 };
  const sx = (v) => M.l + ((v - p.xr[0]) / (p.xr[1] - p.xr[0])) * (W - M.l - M.r);
  const sy = (v) => H - M.b - ((v - p.yr[0]) / (p.yr[1] - p.yr[0])) * (H - M.t - M.b);
  const key = metric === 'jobs' ? 'jobs_central' : 'wage_central';
  const pts = sectors.map((s) => ({ s, x: sx(s[p.x]), y: sy(s[p.y]), j: s.by_growth[growth][key],
                                    r: 2 + 1.8 * Math.sqrt(s.emp ?? 0.1) }));
  const nearest = (ev) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const fx = ((ev.clientX - box.left) / box.width) * W, fy = ((ev.clientY - box.top) / box.height) * H;
    let best = null, bd = 14;
    for (const q of pts) {
      const d = Math.hypot(q.x - fx, q.y - fy);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  const sel = pts.find((q) => q.s.code === selCode);
  const ticks = (r) => [r[0] + (r[1] - r[0]) * 0.1, (r[0] + r[1]) / 2, r[1] - (r[1] - r[0]) * 0.1];
  return (
    <div ref={tip.ref} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${p.yl} against ${p.xl}, industries coloured by change in ${metric}`}
        style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer', touchAction: 'manipulation' }}
        onPointerMove={(ev) => {
          if (ev.pointerType === 'touch') return;
          const q = nearest(ev);
          if (q) tip.show(ev, `${q.s.name}: ${pctChange(q.j)}`); else tip.hide();
        }}
        onPointerLeave={tip.hide}
        onClick={(ev) => { const q = nearest(ev); if (q) { onPick(q.s.code); tip.hide(); } }}>
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="none" stroke="var(--rule)" />
        {ticks(p.xr).map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - M.b + 13} textAnchor="middle" style={{ ...svgText, fontSize: 10 }}>{fmt(p.x, t)}</text>
        ))}
        {ticks(p.yr).map((t) => (
          <text key={`y${t}`} x={M.l - 5} y={sy(t) + 3.5} textAnchor="end" style={{ ...svgText, fontSize: 10 }}>{fmt(p.y, t)}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" style={{ ...svgText, fontSize: 10.5, fill: 'var(--ink-2)' }}>{p.xl}</text>
        <text transform={`translate(11 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle"
          style={{ ...svgText, fontSize: 10.5, fill: 'var(--ink-2)' }}>{p.yl}</text>
        {[...pts].sort((a, b) => b.r - a.r).map((q) => (
          <circle key={q.s.code} cx={q.x} cy={q.y} r={q.r} fill={changeColor(q.j, span)}
            stroke={q.s.code === selCode ? 'var(--ink)' : 'rgba(24,24,56,0.35)'}
            strokeWidth={q.s.code === selCode ? 1.8 : 0.5} />
        ))}
        {sel && (() => {
          const nm = shortName(sel.s.name);
          const lab = nm.length > 24 ? `${nm.slice(0, 23)}…` : nm;
          const half = (lab.length * 6.2) / 2;
          return (
          <text x={Math.min(Math.max(sel.x, M.l + half), W - M.r - half)} y={Math.max(sel.y - sel.r - 4, M.t + 10)} textAnchor="middle"
            style={{ ...svgText, fontSize: 10.5, fill: 'var(--ink)', fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
            {lab}
          </text>
          );
        })()}
      </svg>
      {tip.node}
    </div>
  );
}

export default function DriversGrid(props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
      {PANELS.map((p) => <Panel key={`${p.x}-${p.y}`} p={p} {...props} />)}
    </div>
  );
}
