/**
 * One industry in detail (general equilibrium, full AI progress): a KPI
 * scorecard with jobs and average real wage, what decides its outcome, a
 * tornado of the ensemble parameters, and a contour of its jobs over
 * productivity growth and AI reach. Data: ./data/tool.json.
 */
import { useMemo, useState } from 'react';
import { contours } from 'd3-contour';
import { Chips, VERDICT, mono11, pctChange, svgText, useTip } from './ui.jsx';
import { FORCES } from './ForceMix';

function Kpi({ v, l, accent }) {
  return (
    <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 23, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: accent ? 'var(--accent-brand)' : 'var(--ink)' }}>{v}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.35 }}>{l}</span>
    </div>
  );
}

const range = (q) => `${pctChange(q[0])} to ${pctChange(q[2])}`;

export function Scorecard({ s, nOutcomes }) {
  const g0 = s.by_growth.none, g1 = s.by_growth.growth;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      <Kpi accent v={pctChange(s.jobs_all[1])} l={`jobs, median of all ${nOutcomes.toLocaleString()} outcomes (5–95%: ${range(s.jobs_all)})`} />
      <Kpi v={`${pctChange(g0.jobs[1])} / ${pctChange(g1.jobs[1])}`} l="jobs without / with extra growth (medians)" />
      <Kpi v={`${pctChange(g0.wage[1])} / ${pctChange(g1.wage[1])}`} l="average real wage without / with extra growth (medians)" />
      <Kpi v={`${pctChange(s.worlds.concentrated)} / ${pctChange(s.worlds.broad)}`} l="jobs if capital ownership stays concentrated / becomes broad" />
    </div>
  );
}

export function DecidesBar({ s }) {
  const parts = [
    { k: 'cap', lab: 'AI capability', color: 'var(--spectral-11)' },
    { k: 'dem', lab: 'Demand (growth, saturation)', color: 'var(--positive)' },
    { k: 'own', lab: 'Who owns capital', color: 'var(--brand-orange)' },
  ];
  let x = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)' }}>
        This industry {VERDICT[s.verdict].lab.toLowerCase().replace('≥', 'at least ')}. What decides where in its range it lands:
      </p>
      <svg viewBox="0 0 640 18" style={{ display: 'block', width: '100%', height: 'auto' }} role="img"
        aria-label="Shares of this industry's outcome uncertainty explained by capability, demand and ownership">
        <rect x="0" y="0" width="640" height="18" fill="var(--paper-3)" />
        {parts.map((p) => {
          const w = 640 * Math.max(0, s.shares[p.k] ?? 0);
          const r = <rect key={p.k} x={x} y="0" width={w} height="18" fill={p.color} />;
          x += w;
          return r;
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5, color: 'var(--ink-2)' }}>
        {parts.map((p) => (
          <span key={p.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, background: p.color, display: 'inline-block' }} />
            {p.lab} {Math.round(100 * (s.shares[p.k] ?? 0))}%
          </span>
        ))}
      </div>
    </div>
  );
}

function fmtMult(lnv) {
  const m = Math.exp(lnv);
  if (m >= 1.95) return `×${m.toFixed(1)}`;
  const pc = 100 * (m - 1);
  return `${pc >= 0 ? '+' : ''}${pc.toFixed(0)}%`;
}

/** The selected industry's exact GE force decomposition (same forces and
 *  colours as the skyline), bars adding in logs to the net change. */
export function ForceBars({ s, growth }) {
  const f = s.by_growth[growth].forces;
  const rows = [...FORCES.map(([k, lab, color]) => [lab, f[k], color]), ['Net change in jobs', f.lnJ, null]];
  const W = 640, rh = 26, pad = 8, top = 10, x0 = 210, x1 = W - 70;
  const H = top + rows.length * (rh + pad) + 6;
  const span = Math.max(0.4, ...rows.map((r) => Math.abs(r[1])));
  const bx = (v) => x0 + (x1 - x0) / 2 + (v / (span * 1.08)) * ((x1 - x0) / 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
      aria-label="This industry's change in jobs split into the forces behind it">
      <line x1={bx(0)} y1={top - 4} x2={bx(0)} y2={H - 4} stroke="var(--rule-strong)" />
      {rows.map(([lab, v, color], i) => {
        const y = top + i * (rh + pad);
        const net = color === null;
        return (
          <g key={lab}>
            {net && <line x1={x0} x2={x1 + 40} y1={y - pad / 2} y2={y - pad / 2} stroke="var(--rule)" />}
            <text x={x0 - 10} y={y + rh / 2 + 4} textAnchor="end"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fill: 'var(--ink-2)', fontWeight: net ? 600 : 400 }}>{lab}</text>
            {net
              ? <circle cx={bx(v)} cy={y + rh / 2} r="6" fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'} stroke="var(--paper)" />
              : <rect x={Math.min(bx(0), bx(v))} y={y + 4} width={Math.max(Math.abs(bx(v) - bx(0)), 1.5)} height={rh - 8} rx="3" fill={color} />}
            {(() => {
              // a long negative bar would run its label into the row name:
              // put that label just right of the zero line instead
              const flip = v < 0 && bx(v) - 10 - 40 < x0;
              return (
                <text x={flip ? bx(0) + 8 : bx(v) + (v >= 0 ? 10 : -10)} y={y + rh / 2 + 4}
                  textAnchor={flip || v >= 0 ? 'start' : 'end'}
                  style={{ ...svgText, fontWeight: net ? 600 : 400, fill: net ? 'var(--ink)' : 'var(--ink-3)' }}>{fmtMult(v)}</text>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

const EDGES = [-1.204, -0.693, -0.357, -0.105, 0.095, 0.336, 0.693, 1.194];
const LABELS = ['−70%', '−50%', '−30%', '−10%', '+10%', '+40%', '+100%', '+230%'];
const FILLS = ['#9E0142', '#D53E4F', '#F46D43', '#FDAE61', '#FFFFBF', '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD'];

export function GEContour({ s }) {
  const [dial, setDial] = useState('g_C');
  const tip = useTip();
  const c = s.contours[dial];
  const NY = c.reach.length, NX = c.J[0].length;
  const W = 640, H = 330, M = { l: 58, r: 120, t: 10, b: 44 };
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const outCols = c.output[0].map((_, j) => c.output.reduce((t, row) => t + row[j], 0) / NY);
  const { paths, zero } = useMemo(() => {
    const vals = new Float64Array(NX * NY);
    for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) vals[i * NX + j] = Math.log(c.J[i][j]);
    const toPath = (mp) => mp.coordinates.map((poly) => poly.map((ring) => ring.map(([gx, gy], k) =>
      `${k ? 'L' : 'M'}${(M.l + ((gx - 0.5) / (NX - 1)) * pw).toFixed(1)},${(M.t + ph - ((gy - 0.5) / (NY - 1)) * ph).toFixed(1)}`
    ).join('') + 'Z').join('')).join('');
    const gen = contours().size([NX, NY]);
    return { paths: gen.thresholds(EDGES)(vals).map(toPath), zero: toPath(gen.thresholds([0])(vals)[0]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.code, dial]);
  const yLab = dial === 'g_C' ? 'AI reach into creative tasks' : 'AI reach into physical tasks';
  const central = dial === 'g_C' ? 0.6 : 0.25;
  const ry = (v) => M.t + ph - ((v - c.reach[0]) / (c.reach[NY - 1] - c.reach[0])) * ph;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Chips label="Reach" value={dial} onChange={setDial}
        options={[['g_C', 'Creative tasks'], ['g_P', 'Physical tasks (robotics)']]} />
      <div ref={tip.ref} style={{ position: 'relative' }}
        onPointerMove={(ev) => {
          const box = ev.currentTarget.querySelector('svg').getBoundingClientRect();
          const fx = ((ev.clientX - box.left) / box.width) * W, fy = ((ev.clientY - box.top) / box.height) * H;
          if (fx < M.l || fx > M.l + pw || fy < M.t || fy > M.t + ph) return tip.hide();
          const j = Math.round(((fx - M.l) / pw) * (NX - 1)), i = Math.round(((M.t + ph - fy) / ph) * (NY - 1));
          tip.show(ev, `output ×${outCols[j].toFixed(1)}, reach ${Math.round(100 * c.reach[i])}%: jobs ${pctChange(c.J[i][j])}`);
        }}
        onPointerLeave={tip.hide}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
          aria-label={`Change in this industry's jobs across productivity growth and ${yLab}`}>
          <clipPath id={`gec-${s.code}`}><rect x={M.l} y={M.t} width={pw} height={ph} /></clipPath>
          <g clipPath={`url(#gec-${s.code})`}>
            <rect x={M.l} y={M.t} width={pw} height={ph} fill={FILLS[0]} />
            {paths.map((d, i) => d && <path key={i} d={d} fill={FILLS[i + 1]} />)}
            {zero && <path d={zero} fill="none" stroke="var(--ink)" strokeWidth="1.5" />}
          </g>
          <rect x={M.l} y={M.t} width={pw} height={ph} fill="none" stroke="var(--rule-strong)" />
          <circle cx={M.l} cy={ry(central)} r="5" fill="var(--accent-brand)" stroke="var(--paper)" strokeWidth="1.5" />
          {outCols.filter((_, j) => j % 2 === 0).map((o, k) => (
            <text key={k} x={M.l + ((2 * k) / (NX - 1)) * pw} y={H - M.b + 15} textAnchor="middle" style={svgText}>×{o.toFixed(1)}</text>
          ))}
          {[0, Math.floor(NY / 2), NY - 1].map((i) => (
            <text key={i} x={M.l - 7} y={ry(c.reach[i]) + 3.5} textAnchor="end" style={svgText}>{Math.round(100 * c.reach[i])}%</text>
          ))}
          <text x={M.l + pw / 2} y={H - 6} textAnchor="middle" style={{ ...svgText, fill: 'var(--ink-2)' }}>real output per person (× today)</text>
          <text transform={`translate(13 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" style={{ ...svgText, fill: 'var(--ink-2)' }}>{yLab}</text>
          {FILLS.map((col, i) => {
            const lh = ph / FILLS.length, y = M.t + ph - (i + 1) * lh;
            return (
              <g key={col}>
                <rect x={W - M.r + 16} y={y} width={13} height={lh - 1} fill={col} />
                {i < EDGES.length && <text x={W - M.r + 35} y={y + 3.5} style={{ ...svgText, fontSize: 10 }}>{LABELS[i]}</text>}
              </g>
            );
          })}
          <text x={W - M.r + 16} y={M.t + ph + 20} style={{ ...svgText, fontSize: 10 }}>— no change</text>
        </svg>
        {tip.node}
      </div>
      <p style={{ ...mono11, fontSize: 10, margin: 0, textTransform: 'none', letterSpacing: 0 }}>
        Dot: central case. Other parameters at central values.
      </p>
    </div>
  );
}
