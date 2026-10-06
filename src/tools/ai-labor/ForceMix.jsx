/**
 * All industries at once: the exact general-equilibrium decomposition of each
 * industry's log change in jobs at full AI progress (the paper's Fig. 2b).
 * Columns are industries, width proportional to wage bill, ordered by net
 * change; bars above zero raise jobs, below cut them, and the line is the net
 * change. Displacement is split by the type of task AI takes over.
 */
import { useRef } from 'react';
import { pctChange, shortName, svgText, useTip } from './ui.jsx';

export const FORCES = [
  ['displace_P', 'AI does physical tasks', '#9E0142'],
  ['displace_A', 'AI does analytic tasks', '#D53E4F'],
  ['displace_C', 'AI does creative tasks', '#F46D43'],
  ['shield', 'Human-attention shield', '#66C2A5'],
  ['substitute', 'Labor-capital mix', '#BFBFB4'],
  ['cheaper', 'Cheaper output', '#3288BD'],
  ['spending', 'Spending shifts', '#5E4FA2'],
];

export default function ForceMix({ sectors, growth, selCode, onPick }) {
  const tip = useTip();
  const svgRef = useRef(null);
  const W = 640, H = 300, M = { l: 48, r: 8, t: 10, b: 26 };
  const rows = sectors.map((s) => ({ s, f: s.by_growth[growth].forces }))
    .sort((a, b) => a.f.lnJ - b.f.lnJ);
  const tot = rows.reduce((t, r) => t + (r.s.wb ?? 0), 0);
  let pos = 0, neg = 0;
  for (const r of rows) {
    let up = 0, dn = 0;
    for (const [k] of FORCES) { const v = r.f[k]; if (v > 0) up += v; else dn += v; }
    pos = Math.max(pos, up);
    neg = Math.min(neg, dn);
  }
  const ymax = Math.ceil(pos * 2) / 2, ymin = Math.floor(neg * 2) / 2;
  const sy = (v) => M.t + ((ymax - v) / (ymax - ymin)) * (H - M.t - M.b);
  let x0 = 0;
  const cols = rows.map((r) => {
    const w = ((r.s.wb ?? 0) / tot) * (W - M.l - M.r);
    const c = { ...r, x: M.l + x0, w };
    x0 += w;
    return c;
  });
  const colAt = (ev) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const fx = ((ev.clientX - box.left) / box.width) * W;
    return cols.find((c) => fx >= c.x && fx <= c.x + Math.max(c.w, 2)) ?? null;
  };
  const ticks = [];
  for (let v = ymin; v <= ymax + 1e-9; v += 0.5) ticks.push(+v.toFixed(2));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={tip.ref} style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label="Forces behind each industry's change in jobs, columns sized by wage bill; tap a column to select it"
          style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer', touchAction: 'manipulation' }}
          onPointerMove={(ev) => {
            if (ev.pointerType === 'touch') return;
            const c = colAt(ev);
            if (c) tip.show(ev, `${c.s.name}: jobs ${pctChange(Math.exp(c.f.lnJ))}`); else tip.hide();
          }}
          onPointerLeave={tip.hide}
          onPointerUp={(ev) => { const c = colAt(ev); if (c) { onPick(c.s.code); tip.hide(); } }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? 'var(--ink)' : 'var(--rule)'} strokeWidth={t === 0 ? 1 : 0.6} />
              <text x={M.l - 5} y={sy(t) + 3.5} textAnchor="end" style={{ ...svgText, fontSize: 10 }}>{t > 0 ? `+${t}` : t}</text>
            </g>
          ))}
          {cols.map((c) => {
            let up = 0, dn = 0;
            return (
              <g key={c.s.code} opacity={selCode && c.s.code !== selCode ? 0.8 : 1}>
                {FORCES.map(([k, , color]) => {
                  const v = c.f[k];
                  const y0 = v >= 0 ? up : dn;
                  if (v >= 0) up += v; else dn += v;
                  const yTop = sy(v >= 0 ? y0 + v : y0), yBot = sy(v >= 0 ? y0 : y0 + v);
                  return <rect key={k} x={c.x} y={yTop} width={Math.max(c.w - 0.3, 0.4)} height={Math.max(yBot - yTop, 0)} fill={color} />;
                })}
                <line x1={c.x} x2={c.x + c.w} y1={sy(c.f.lnJ)} y2={sy(c.f.lnJ)} stroke="var(--paper)" strokeWidth="2.2" />
                <line x1={c.x} x2={c.x + c.w} y1={sy(c.f.lnJ)} y2={sy(c.f.lnJ)} stroke="var(--ink)" strokeWidth="1" />
              </g>
            );
          })}
          {(() => {
            const c = cols.find((q) => q.s.code === selCode);
            if (!c) return null;
            return (
              <g>
                <rect x={c.x - 0.8} y={M.t} width={Math.max(c.w, 2) + 1.6} height={H - M.t - M.b} fill="none" stroke="var(--ink)" strokeWidth="1.3" />
                <text x={Math.min(Math.max(c.x + c.w / 2, M.l + 70), W - M.r - 70)} y={M.t + 10} textAnchor="middle"
                  style={{ ...svgText, fontSize: 10.5, fill: 'var(--ink)', fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
                  {shortName(c.s.name)} {pctChange(Math.exp(c.f.lnJ))}
                </text>
              </g>
            );
          })()}
          <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" style={{ ...svgText, fill: 'var(--ink-2)' }}>
            industries ordered by net change in jobs · width = wage bill
          </text>
          <text transform={`translate(10 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" style={{ ...svgText, fontSize: 10 }}>
            contribution to log change in jobs
          </text>
        </svg>
        {tip.node}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--ink-2)' }}>
        {FORCES.map(([k, lab, color]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, background: color, display: 'inline-block' }} />{lab}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--ink)', display: 'inline-block' }} />Net change
        </span>
      </div>
    </div>
  );
}
