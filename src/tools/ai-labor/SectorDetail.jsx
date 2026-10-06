/**
 * One industry in detail (general equilibrium, full AI progress): a KPI
 * scorecard with jobs and average real wage, what decides its outcome, a
 * tornado of the ensemble parameters, and a contour of its jobs over
 * productivity growth and AI reach. Data: ./data/tool.json.
 */
import { useEffect, useMemo, useState } from 'react';
import { contours } from 'd3-contour';
import { Pct, VERDICT, mono11, pctChange, svgText, useTip } from './ui.jsx';
import { FORCES } from './ForceMix';

function Kpi({ v, l }) {
  return (
    <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 23, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)' }}>{v}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.35 }}>{l}</span>
    </div>
  );
}

const range = (q) => `${pctChange(q[0])} to ${pctChange(q[2])}`;

export function Scorecard({ s, nOutcomes }) {
  const g0 = s.by_growth.none, g1 = s.by_growth.growth;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      <Kpi v={<Pct j={s.jobs_all[1]} />} l={`jobs, median of all ${nOutcomes.toLocaleString()} outcomes (5–95%: ${range(s.jobs_all)})`} />
      <Kpi v={<><Pct j={g0.jobs[1]} /> / <Pct j={g1.jobs[1]} /></>} l="jobs without / with extra growth (medians)" />
      <Kpi v={<><Pct j={g0.wage[1]} /> / <Pct j={g1.wage[1]} /></>} l="average real wage without / with extra growth (medians)" />
      <Kpi v={<><Pct j={s.worlds.concentrated} /> / <Pct j={s.worlds.broad} /></>} l="jobs if capital ownership stays concentrated / becomes broad" />
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

const BASE = '/tools/ai-labor/contours';
const cache = new Map();
function load(name) {
  if (!cache.has(name)) cache.set(name, fetch(`${BASE}/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.json();
  }));
  return cache.get(name);
}

const AXES = ['Z', 'g_C', 'g_A', 'g_P', 'psi', 'eta_K', 'chi'];

function tickLabel(key, v, meta) {
  if (key === 'Z') return `×${meta.z_output[meta.vars.Z.values.indexOf(v)] ?? v}`;
  if (key === 'eta_K') return `${v}`;
  return `${Math.round(100 * v)}%`;
}

export function GEContour({ s, metric, growth }) {
  const [xk, setXk] = useState('Z');
  const [yk, setYk] = useState('g_C');
  const [meta, setMeta] = useState(null);
  const [grid, setGrid] = useState(null);
  const [err, setErr] = useState(null);
  const tip = useTip();
  useEffect(() => { load('meta').then(setMeta).catch((e) => setErr(String(e))); }, []);
  useEffect(() => {
    setGrid(null);
    load(s.code).then(setGrid).catch((e) => setErr(String(e)));
  }, [s.code]);

  const W = 640, H = 330, M = { l: 58, r: 120, t: 10, b: 44 };
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const field = metric === 'jobs' ? 'J' : 'W';
  const g = (xk === 'Z' || yk === 'Z') ? '-' : growth;

  const surf = useMemo(() => {
    if (!meta || !grid) return null;
    const fwd = grid[`${xk}|${yk}|${g}`], rev = grid[`${yk}|${xk}|${g}`];
    const raw = fwd ?? rev;
    if (!raw) return null;
    const scale = meta.scale;
    // stored row-major: rows = second variable, columns = first
    const vals = new Float64Array(81);
    for (let iy = 0; iy < 9; iy++) {
      for (let ix = 0; ix < 9; ix++) {
        const k = fwd ? iy * 9 + ix : ix * 9 + iy;
        const v = raw[field][k];
        vals[iy * 9 + ix] = v == null ? NaN : v / scale;
      }
    }
    // fill rare unsolved points from the nearest solved neighbour
    for (let k = 0; k < 81; k++) {
      if (Number.isNaN(vals[k])) {
        const nb = [k - 1, k + 1, k - 9, k + 9].find((q) => q >= 0 && q < 81 && !Number.isNaN(vals[q]));
        vals[k] = nb === undefined ? 1 : vals[nb];
      }
    }
    return vals;
  }, [meta, grid, xk, yk, g, field]);

  const { paths, zero } = useMemo(() => {
    if (!surf) return { paths: [], zero: null };
    const lv = Float64Array.from(surf, Math.log);
    const toPath = (mp) => mp.coordinates.map((poly) => poly.map((ring) => ring.map(([gx, gy], k) =>
      `${k ? 'L' : 'M'}${(M.l + ((gx - 0.5) / 8) * pw).toFixed(1)},${(M.t + ph - ((gy - 0.5) / 8) * ph).toFixed(1)}`
    ).join('') + 'Z').join('')).join('');
    const gen = contours().size([9, 9]);
    return { paths: gen.thresholds(EDGES)(lv).map(toPath), zero: toPath(gen.thresholds([0])(lv)[0]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surf]);

  const sel = { font: '12.5px/1.4 var(--font-sans)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 2, padding: '3px 6px' };
  const opts = (other) => AXES.map((k) => (
    <option key={k} value={k} disabled={k === other}>{meta?.vars[k].label ?? k}</option>
  ));
  const pos = (key, which) => {
    const v = meta.vars[key];
    const c = key === 'Z' ? (growth === 'none' ? 1 : 3) : v.central;
    // grid position by piecewise-linear interpolation (central values can sit
    // between grid points, and capital supply is log-spaced)
    const vs = v.values;
    let f = 0;
    for (let i = 0; i < vs.length - 1; i++) {
      if (c >= vs[i] && c <= vs[i + 1]) { f = (i + (c - vs[i]) / (vs[i + 1] - vs[i])) / (vs.length - 1); break; }
    }
    return which === 'x' ? M.l + f * pw : M.t + ph - f * ph;
  };
  const what = metric === 'jobs' ? 'jobs' : 'average real wage';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--ink-2)' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          across <select value={xk} onChange={(e) => setXk(e.target.value)} style={sel} aria-label="Horizontal axis">{opts(yk)}</select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          against <select value={yk} onChange={(e) => setYk(e.target.value)} style={sel} aria-label="Vertical axis">{opts(xk)}</select>
        </label>
      </div>
      <div ref={tip.ref} style={{ position: 'relative' }}
        onPointerMove={(ev) => {
          if (!surf || !meta) return;
          const box = ev.currentTarget.querySelector('svg').getBoundingClientRect();
          const fx = ((ev.clientX - box.left) / box.width) * W, fy = ((ev.clientY - box.top) / box.height) * H;
          if (fx < M.l || fx > M.l + pw || fy < M.t || fy > M.t + ph) return tip.hide();
          const ix = Math.round(((fx - M.l) / pw) * 8), iy = Math.round(((M.t + ph - fy) / ph) * 8);
          tip.show(ev, `${tickLabel(xk, meta.vars[xk].values[ix], meta)}, ${tickLabel(yk, meta.vars[yk].values[iy], meta)}: ${what} ${pctChange(surf[iy * 9 + ix])}`);
        }}
        onPointerLeave={tip.hide}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
          aria-label={`Change in this industry's ${what} across two selected assumptions`}>
          {!surf && (
            <text x={M.l + pw / 2} y={M.t + ph / 2} textAnchor="middle" style={svgText}>{err ? 'surface unavailable' : 'loading…'}</text>
          )}
          {surf && (
            <>
              <clipPath id={`gec-${s.code}`}><rect x={M.l} y={M.t} width={pw} height={ph} /></clipPath>
              <g clipPath={`url(#gec-${s.code})`}>
                <rect x={M.l} y={M.t} width={pw} height={ph} fill={FILLS[0]} />
                {paths.map((d, i) => d && <path key={i} d={d} fill={FILLS[i + 1]} />)}
                {zero && <path d={zero} fill="none" stroke="var(--ink)" strokeWidth="1.5" />}
              </g>
              <circle cx={pos(xk, 'x')} cy={pos(yk, 'y')} r="5" fill="var(--accent-brand)" stroke="var(--paper)" strokeWidth="1.5" />
              {[0, 2, 4, 6, 8].map((i) => (
                <text key={`x${i}`} x={M.l + (i / 8) * pw} y={H - M.b + 15} textAnchor="middle" style={svgText}>{tickLabel(xk, meta.vars[xk].values[i], meta)}</text>
              ))}
              {[0, 4, 8].map((i) => (
                <text key={`y${i}`} x={M.l - 7} y={M.t + ph - (i / 8) * ph + 3.5} textAnchor="end" style={svgText}>{tickLabel(yk, meta.vars[yk].values[i], meta)}</text>
              ))}
            </>
          )}
          <rect x={M.l} y={M.t} width={pw} height={ph} fill="none" stroke="var(--rule-strong)" />
          <text x={M.l + pw / 2} y={H - 6} textAnchor="middle" style={{ ...svgText, fill: 'var(--ink-2)' }}>
            {meta ? (xk === 'Z' ? 'Productivity growth (real output per person, × today)' : meta.vars[xk].label) : ''}
          </text>
          <text transform={`translate(13 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" style={{ ...svgText, fill: 'var(--ink-2)' }}>
            {meta ? meta.vars[yk].label : ''}
          </text>
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
        Dot: central case{g === '-' ? '' : `, ${growth === 'none' ? 'no extra growth' : 'output ×3.5'}`}. Other assumptions at central values.
      </p>
    </div>
  );
}
