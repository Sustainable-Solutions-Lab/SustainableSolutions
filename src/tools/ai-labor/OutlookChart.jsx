/**
 * Sector outlook in general equilibrium — the paper's Fig. 1 as a compact,
 * clickable strip. Each industry is a dot at its median change in jobs at
 * full AI progress across 1,944 scenario-ownership combinations, in one of
 * three lanes by verdict (loses / contested / gains in >= 90% of them),
 * sized by employment. The selected industry shows its 5-95% range.
 * Data: ./data/outlook.json (ai-labor analysis/ws4-ces-model/ge_sectors.py).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

const LANES = [
  { v: 'gains', lab: 'Gains in ≥90% of scenarios', color: 'var(--positive)' },
  { v: 'contested', lab: 'Contested', color: 'var(--ink-3)' },
  { v: 'loses', lab: 'Loses in ≥90% of scenarios', color: 'var(--negative)' },
];
const svgText = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--ink-3)' };
const svgLabel = { fontFamily: 'var(--font-sans)', fontSize: 11.5, fill: 'var(--ink-2)' };

const SHORT = {
  'Monetary authorities and depository credit intermediation': 'Banking',
  'Securities and commodity contracts intermediation and brokerage': 'Securities brokerage',
  'Other financial investment activities': 'Investment services',
  'Insurance carriers, except direct life': 'Insurance carriers',
};
const short = (n) => SHORT[n] ?? (n.length > 30 ? `${n.slice(0, 28)}…` : n);

const pctChange = (j) => `${j >= 1 ? '+' : ''}${Math.round(100 * (j - 1))}%`;

/** Stable small vertical offset per industry so dots in a lane don't stack. */
function jitter(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h / 997 - 0.5) * 2;
}

export default function OutlookChart({ outlook, sectors, selCode, onPick }) {
  const wrapRef = useRef(null);
  // Narrow containers get a smaller viewBox, so the same type sizes render
  // legibly on phones, plus fewer ticks and labels.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = narrow ? 380 : 640, H = narrow ? 300 : 260, M = { l: 8, r: 8, t: 22, b: 40 };
  const laneH = (H - M.t - M.b) / LANES.length;
  const xmin = -0.9, xmax = 1.45;
  const sx = (j) => M.l + ((j - 1 - xmin) / (xmax - xmin)) * (W - M.l - M.r);
  const svgRef = useRef(null);
  const [tip, setTip] = useState(null);

  const pts = useMemo(() => {
    const byCode = Object.fromEntries(sectors.map((s) => [s.code, s]));
    return outlook.filter((o) => byCode[o.code]).map((o) => {
      const lane = LANES.findIndex((l) => l.v === o.v);
      return {
        ...o, name: byCode[o.code].name, emp: byCode[o.code].emp,
        x: sx(o.med),
        y: M.t + laneH * (lane + 0.5) + jitter(o.code) * laneH * 0.3,
        r: 2.5 + 2.2 * Math.sqrt(byCode[o.code].emp),
        color: LANES[lane].color,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlook, sectors, narrow]);
  const sel = pts.find((p) => p.code === selCode);
  // Label the largest industry in each lane (desktop only) plus the selection.
  const labelled = new Set(narrow ? [] : LANES.map((l) => [...pts].filter((p) => p.v === l.v)
    .sort((a, b) => b.emp - a.emp)[0]?.code));

  const nearest = (ev) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const fx = ((ev.clientX - box.left) / box.width) * W;
    const fy = ((ev.clientY - box.top) / box.height) * H;
    let best = null, bd = 18;
    for (const p of pts) {
      const d = Math.hypot(p.x - fx, p.y - fy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
        style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer' }}
        aria-label="Each industry's median change in jobs at full AI progress, grouped by whether it loses, is contested, or gains across scenarios; click a dot to select that industry"
        onPointerMove={(ev) => {
          const p = nearest(ev);
          const fig = wrapRef.current?.getBoundingClientRect();
          if (!p || !fig) return setTip(null);
          let x = ev.clientX - fig.left + 14;
          if (x > fig.width - 300) x -= 320;
          setTip({ x, y: ev.clientY - fig.top - 10,
            text: `${p.name}: ${pctChange(p.med)} (range ${pctChange(p.p05)} to ${pctChange(p.p95)})` });
        }}
        onPointerLeave={() => setTip(null)}
        onPointerUp={(ev) => { const p = nearest(ev); if (p) onPick(p.code); }}>
        {LANES.map((l, i) => (
          <g key={l.v}>
            <line x1={M.l} x2={W - M.r} y1={M.t + laneH * (i + 1)} y2={M.t + laneH * (i + 1)}
              stroke="var(--rule)" />
            <text x={M.l} y={M.t + laneH * i + 12} style={{ ...svgText, fill: l.color }}>{l.lab}</text>
          </g>
        ))}
        {(narrow ? [-0.5, 0.5, 1.0] : [-0.75, -0.5, -0.25, 0.25, 0.5, 1.0]).map((t) => (
          <g key={t}>
            <line x1={sx(1 + t)} x2={sx(1 + t)} y1={M.t} y2={H - M.b} stroke="var(--rule)" strokeWidth="0.6" />
            <text x={sx(1 + t)} y={H - M.b + 15} textAnchor="middle" style={svgText}>{pctChange(1 + t)}</text>
          </g>
        ))}
        <line x1={sx(1)} x2={sx(1)} y1={M.t} y2={H - M.b} stroke="var(--ink)" strokeWidth="1.1" />
        <text x={sx(1)} y={H - M.b + 15} textAnchor="middle" style={{ ...svgText, fill: 'var(--ink)' }}>0</text>
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" style={svgLabel}>
          {narrow ? 'median change in jobs at full AI progress' : "change in the industry's jobs at full AI progress (median across scenarios)"}
        </text>
        {sel && (
          <line x1={sx(sel.p05)} x2={sx(sel.p95)} y1={sel.y} y2={sel.y} stroke={sel.color}
            strokeWidth="3" strokeOpacity="0.45" strokeLinecap="round" />
        )}
        {pts.map((p) => (
          <circle key={p.code} cx={p.x} cy={p.y} r={p.r} fill={p.color}
            fillOpacity={p.code === selCode ? 1 : 0.55}
            stroke={p.code === selCode ? 'var(--ink)' : 'var(--paper)'}
            strokeWidth={p.code === selCode ? 1.6 : 0.8} />
        ))}
        {pts.filter((p) => labelled.has(p.code) || p.code === selCode).map((p) => (
          <text key={`l-${p.code}`} x={Math.min(Math.max(p.x, M.l + 60), W - M.r - 60)}
            y={p.y - p.r - 4} textAnchor="middle"
            style={{ ...svgLabel, fontSize: 10.5, fontWeight: p.code === selCode ? 600 : 400,
                     paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
            {short(p.name)}
          </text>
        ))}
      </svg>
      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, padding: '6px 9px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 4 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/** What decides the selected industry: shares of outcome variance. */
export function DecidesBar({ o }) {
  const parts = [
    { k: 'cap', lab: 'AI capability', color: 'var(--spectral-11)' },
    { k: 'dem', lab: 'Demand (growth, saturation)', color: 'var(--positive)' },
    { k: 'own', lab: 'Who owns capital', color: 'var(--brand-orange)' },
  ];
  let x = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg viewBox="0 0 640 22" style={{ display: 'block', width: '100%', height: 'auto' }}
        role="img" aria-label="Shares of this industry's outcome uncertainty explained by capability, demand and ownership">
        <rect x="0" y="0" width="640" height="22" fill="var(--paper-3)" />
        {parts.map((p) => {
          const w = 640 * Math.max(0, o[p.k]);
          const r = <rect key={p.k} x={x} y="0" width={w} height="22" fill={p.color} />;
          x += w;
          return r;
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5, color: 'var(--ink-2)' }}>
        {parts.map((p) => (
          <span key={p.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, background: p.color, display: 'inline-block' }} />
            {p.lab} {Math.round(100 * o[p.k])}%
          </span>
        ))}
      </div>
    </div>
  );
}
