/**
 * ForcesChart — a 100% stacked Marimekko of the five forces across sectors.
 *
 * One column per industry, width proportional to its wage bill (employment ×
 * average wages — economic importance), sorted largest first; the column
 * splits 100% by each force's share of the total |log contribution| to that
 * sector's jobs change at the current levers and evaluation point. Colors
 * identify forces (fixed Spectral picks); magnitudes are unsigned here —
 * the decomposition bars above carry the signs, and the hover tooltip
 * reports them per sector.
 */
import { useMemo, useRef, useState } from 'react';
import { decompose } from './model.js';
import SECTORS from './data/sectors.json';
import GE from './data/ge.json';

// [key, full name (tooltip), legend label, color]
const FORCES = [
  ['income', 'Income growth', 'Income', '#3288BD'],
  ['dist', 'Who gets the gains', 'Gains split', '#66C2A5'],
  ['cheaper', 'Cheaper output', 'Cheaper output', '#FDAE61'],
  ['displace', 'AI does the tasks', 'Displacement', '#D53E4F'],
  ['prov', 'Provenance shield', 'Provenance', '#5E4FA2'],
];
const svgText = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--ink-3)' };
const svgLabel = { fontFamily: 'var(--font-sans)', fontSize: 12, fill: 'var(--ink-2)' };

function fmtMult(lnv) {
  const m = Math.exp(lnv);
  if (m >= 1.95) return `×${m.toFixed(1)}`;
  const pc = 100 * (m - 1);
  return `${pc >= 0 ? '+' : ''}${pc.toFixed(0)}%`;
}

export default function ForcesChart({ sd, astar, selCode, onPickSector }) {
  const W = 640, H = 340, M = { l: 46, r: 14, t: 14, b: 66 };
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);

  const cols = useMemo(() => {
    const rows = SECTORS.filter((s) => s.wb > 0)
      .slice()
      .sort((x, y) => y.wb - x.wb);
    const total = rows.reduce((t, s) => t + s.wb, 0);
    let cum = 0;
    return rows.map((s) => {
      const dial = { ...sd, eps: s.eps, lint: s.lint, thP: s.thP, thA: s.thA, thC: s.thC };
      const dec = decompose(GE, astar, dial);
      const auto = astar * (s.thP * sd.gP + s.thA * sd.gA + s.thC * sd.gC);
      const mags = FORCES.map(([k]) => Math.abs(dec[k]));
      const sum = Math.max(mags.reduce((a, b) => a + b, 0), 1e-12);
      const x0 = (cum / total) * pw;
      cum += s.wb;
      const x1 = (cum / total) * pw;
      return { s, dec, auto, shares: mags.map((m) => m / sum), x0, x1 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sd.gP, sd.gA, sd.gC, sd.phi, sd.chi, astar]);

  const totalWb = useMemo(() => cols.reduce((t, c) => t + c.s.wb, 0), [cols]);

  const colAt = (ev) => {
    const box = wrapRef.current?.querySelector('svg')?.getBoundingClientRect();
    if (!box) return null;
    const fx = ((ev.clientX - box.left) / box.width) * W - M.l;
    return cols.find((c) => fx >= c.x0 && fx <= c.x1) || null;
  };
  const onMove = (ev) => {
    const fig = wrapRef.current?.getBoundingClientRect();
    const col = colAt(ev);
    if (!col || !fig) return setTip(null);
    let x = ev.clientX - fig.left + 14;
    if (x > fig.width - 260) x -= 280;
    setTip({ x, y: ev.clientY - fig.top - 10, col });
  };
  const onClick = (ev) => {
    const col = colAt(ev);
    if (col && onPickSector) onPickSector(col.s.code);
  };

  const sel = selCode && cols.find((c) => c.s.code === selCode);

  return (
    <div ref={wrapRef} style={{ position: 'relative', cursor: tip ? 'pointer' : 'default' }}
      onPointerMove={onMove} onPointerLeave={() => setTip(null)} onClick={onClick}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
        aria-label="Share of each force in every sector's jobs change, columns sized by wage bill">
        {cols.map((c) => {
          let y = M.t + ph;
          const wCol = Math.max(c.x1 - c.x0 - 0.8, 0.6);
          return (
            <g key={c.s.code}>
              {FORCES.map(([k, , , color], i) => {
                const hgt = c.shares[i] * ph;
                y -= hgt;
                return (
                  <rect key={k} x={M.l + c.x0} y={y} width={wCol} height={Math.max(hgt, 0)}
                    fill={color} opacity={tip && tip.col.s.code === c.s.code ? 1 : 0.88} />
                );
              })}
            </g>
          );
        })}
        {sel && (
          <rect x={M.l + sel.x0 - 0.6} y={M.t - 2.5} width={sel.x1 - sel.x0 + 1.2} height={ph + 5}
            fill="none" stroke="var(--ink)" strokeWidth="1.4" />
        )}
        <rect x={M.l} y={M.t} width={pw} height={ph} fill="none" stroke="var(--rule-strong)" />
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={M.l - 7} y={M.t + ph - t * ph + 3.5} textAnchor="end" style={svgText}>
            {Math.round(t * 100)}%
          </text>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={M.l + t * pw} y={M.t + ph + 15} textAnchor="middle" style={svgText}>
            {`$${(t * totalWb / 1e3).toFixed(1)}T`}
          </text>
        ))}
        <text x={M.l + pw / 2} y={M.t + ph + 32} textAnchor="middle" style={svgLabel}>
          Sectors sorted by wage bill (cumulative) — widest columns matter most economically
        </text>
        {FORCES.map(([k, , short, color], i) => (
          <g key={k} transform={`translate(${M.l + i * (pw / FORCES.length)}, ${H - 12})`}>
            <rect width="10" height="10" y="-9" fill={color} />
            <text x="14" style={svgText}>{short}</text>
          </g>
        ))}
      </svg>
      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55, padding: '7px 10px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 4 }}>
          <strong>{tip.col.s.name}</strong> · ${tip.col.s.wb >= 100 ? Math.round(tip.col.s.wb) : tip.col.s.wb}B wages
          <div style={{ opacity: 0.75 }}>AI performs {Math.round(100 * tip.col.auto)}% of its tasks here</div>
          {FORCES.map(([k, name, ,], i) => (
            <div key={k}>{name}: {fmtMult(tip.col.dec[k])} ({Math.round(100 * tip.col.shares[i])}%)</div>
          ))}
          <div>net: {fmtMult(tip.col.dec.total)}</div>
          {tip.col.s.code !== selCode && <div style={{ opacity: 0.75 }}>click to load this sector</div>}
        </div>
      )}
    </div>
  );
}
