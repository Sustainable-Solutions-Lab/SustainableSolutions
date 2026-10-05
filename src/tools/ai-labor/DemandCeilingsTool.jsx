/**
 * AI and labor — jobs in one real industry as the AI frontier advances
 * (sector lens). Bespoke tool (no _engine/_map); standard ToolShell chrome,
 * rail = sector picker + levers, main = scrolling results.
 *
 * Models live in ./model.js (sector lens; verified against the ai-labor
 * Python reference) and ./km.js (Kording & Marinescu aggregate replication).
 * Data in ./data/ — see its README for provenance and regeneration.
 *
 * The K&M aggregate panel is built but hidden (SHOW_KM) per SD 2026-10-05
 * ("maybe drop for now but save ability to bring it back") — flip the flag
 * to restore it below the sector lens.
 */
import { useMemo, useRef, useState } from 'react';
import { contours } from 'd3-contour';
import ToolShell from '../_shell/ToolShell';
import MethodsPane from './MethodsPane';
import ForcesChart from './ForcesChart';
import { ETA, sectorJobs, decompose, sectorSweep } from './model.js';
import * as km from './km.js';
import SECTORS from './data/sectors.json';
import GE from './data/ge.json';

const SHOW_KM = false;

/* ---------------- shared bits ---------------- */

const mono11 = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const figTitle = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: 0 };
const caption = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: 0, maxWidth: '68ch' };

/** Tick marks under a slider rail. A thumb's center travels from half its
 *  width inside one end of the track to half inside the other, so a tick at
 *  value fraction f sits at f·(100% − thumb) + thumb/2 (same geometry as the
 *  magnet explorer's Slider). Cardinal ticks mark measured values. */
function Ticks({ min, max, marks }) {
  const hasLabels = marks.some((m) => m.label);
  return (
    <div style={{ position: 'relative', height: hasLabels ? 16 : 7, marginTop: 1 }} aria-hidden="true">
      {marks.map((m, i) => {
        const f = Math.min(Math.max((m.v - min) / (max - min), 0), 1);
        const left = `calc(${f} * (100% - var(--dc-thumb)) + var(--dc-thumb) / 2)`;
        return (
          <span key={i}>
            <span style={{ position: 'absolute', left, top: 0, width: 2, height: 6, marginLeft: -1, background: m.accent ? 'var(--cardinal)' : 'var(--ink-4)' }} />
            {m.label && (
              <span style={{ position: 'absolute', left, top: 6, transform: `translateX(${f < 0.12 ? '0%' : f > 0.88 ? '-100%' : '-50%'})`, fontFamily: 'var(--font-mono)', fontSize: 9, color: m.accent ? 'var(--cardinal)' : 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                {m.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Ctl({ k, lab, min, max, step, value, fmt, sub, onChange, extra, ticks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <label htmlFor={`dc-${k}`} style={{ fontSize: 13, color: 'var(--ink-2)' }}>{lab}</label>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmt(value)}{extra}
        </span>
      </div>
      <input id={`dc-${k}`} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)} />
      {ticks && ticks.length > 0 && <Ticks min={min} max={max} marks={ticks} />}
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

function GroupHead({ children }) {
  return <h3 style={{ ...mono11, fontWeight: 500, margin: 0, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>{children}</h3>;
}

function Tile({ v, l, accent }) {
  return (
    <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: accent ? 'var(--accent-brand)' : 'var(--ink)' }}>{v}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.35 }}>{l}</span>
    </div>
  );
}

/** Crosshair-tooltip wrapper for an SVG chart with a shared x domain. */
function HoverFig({ children, width, xToData, format }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const onMove = (ev) => {
    const box = ref.current?.querySelector('svg')?.getBoundingClientRect();
    const fig = ref.current?.getBoundingClientRect();
    if (!box || !fig) return;
    const fx = ((ev.clientX - box.left) / box.width) * width;
    const d = xToData(fx);
    if (!d) return setTip(null);
    let x = ev.clientX - fig.left + 14;
    if (x > fig.width - 230) x -= 250;
    setTip({ x, y: ev.clientY - fig.top - 10, text: format(d) });
  };
  return (
    <div ref={ref} style={{ position: 'relative' }} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
      {children}
      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, padding: '6px 9px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 4 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

const svgText = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--ink-3)' };
const svgLabel = { fontFamily: 'var(--font-sans)', fontSize: 12, fill: 'var(--ink-2)' };

/* ---------------- sector lens ---------------- */

const CT_NAMES = { physical: 'Physical ceiling', time_budget: 'Time-budget ceiling', open_ended: 'Open-ended', provenance: 'Provenance' };
const SDEF = { eps: 1.0, lint: 0.35, thP: 0.6, thA: 0.25, thC: 0.15, gP: 0.25, gA: 0.95, gC: 0.6, phi: 0.0, chi: 0.3 };
const pct = (v) => `${Math.round(100 * v)}%`;

function fmtMult(lnv) {
  const m = Math.exp(lnv);
  if (m >= 1.95) return `×${m.toFixed(1)}`;
  const pc = 100 * (m - 1);
  return `${pc >= 0 ? '+' : ''}${pc.toFixed(0)}%`;
}

function JobsChart({ data, noceil, astar, at, onScrub, hairlines, selCode, onPickSector }) {
  const W = 640, H = 330, M = { l: 46, r: 96, t: 14, b: 36 };
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [drag, setDrag] = useState(null);   // {fx, fy, moved}
  const [near, setNear] = useState(null);   // nearest hairline {code, name, J}
  const [tip, setTip] = useState(null);
  const sx = (a) => M.l + a * (W - M.l - M.r);
  const allJ = [...data.map((d) => d.J), ...noceil.map((d) => d.J)];
  const useLog = Math.max(...allJ) > 8;
  const tf = useLog ? Math.log : (v) => v;
  const jmin = useLog ? tf(Math.min(...allJ, 1)) * 1.02 - 0.05 : 0;
  const jmax = Math.max(...allJ.map(tf)) * 1.06;
  const yof = (v) => H - M.b - ((tf(v) - jmin) / (jmax - jmin)) * (H - M.b - M.t);
  const line = (arr) => arr.map((d, i) => `${i ? 'L' : 'M'}${sx(d.a).toFixed(1)},${yof(d.J).toFixed(1)}`).join('');
  const ticks = (useLog ? [0.5, 2, 5, 10, 20, 50, 100, 200] : [0.5, 1.5, 2, 3, 4, 6, 8])
    .filter((v) => tf(v) > jmin && tf(v) < jmax);
  const peak = data.reduce((a, b) => (b.J > a.J ? b : a));
  const interiorPeak = peak.a > 0.02 && peak.a < 0.99 && peak.J > data[0].J && peak.J > data[data.length - 1].J;
  const end = data[data.length - 1], endN = noceil[noceil.length - 1];

  const toXY = (ev) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    return [((ev.clientX - box.left) / box.width) * W,
            ((ev.clientY - box.top) / box.height) * H];
  };
  const toA = (fx) => Math.min(1, Math.max(0.01, (fx - M.l) / (W - M.l - M.r)));
  const lineAt = (pts, a) => pts[Math.round(a * (pts.length - 1))];
  const nearestLine = (fx, fy) => {
    const a = toA(fx);
    let best = null, bestDist = 13;
    for (const hl of hairlines) {
      const d = Math.abs(yof(lineAt(hl.pts, a).J) - fy);
      if (d < bestDist) { bestDist = d; best = { code: hl.code, name: hl.name, J: lineAt(hl.pts, a).J }; }
    }
    return best;
  };
  const showTip = (ev, fx, fy, hit) => {
    const fig = wrapRef.current?.getBoundingClientRect();
    if (!fig) return;
    const a = toA(fx);
    const d = lineAt(data, a);
    let x = ev.clientX - fig.left + 14;
    if (x > fig.width - 260) x -= 280;
    setTip({
      x, y: ev.clientY - fig.top - 10,
      text: hit && hit.code !== selCode
        ? `${hit.name} — jobs ${hit.J.toFixed(2)} (click to select)`
        : `progress ${pct(a)}  jobs ${d.J.toFixed(2)}  human ${pct(d.h)}  demand ${d.D.toFixed(1)}×`,
    });
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: near ? 'pointer' : 'col-resize' }}
        aria-label="Sector jobs index against AI frontier progress; drag to move the evaluation point, click a line to switch sector"
        onPointerDown={(ev) => {
          const xy = toXY(ev);
          if (!xy) return;
          setDrag({ fx: xy[0], fy: xy[1], moved: false });
          // Capture keeps the drag alive if the pointer leaves the chart.
          // WebKit can throw on SVG pointer capture; dragging merely degrades.
          try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* noop */ }
        }}
        onPointerMove={(ev) => {
          const xy = toXY(ev);
          if (!xy) return;
          const [fx, fy] = xy;
          if (drag) {
            const moved = drag.moved || Math.abs(fx - drag.fx) > 3;
            if (moved !== drag.moved) setDrag({ ...drag, moved });
            if (moved) { onScrub(toA(fx)); setNear(null); setTip(null); }
            return;
          }
          const hit = nearestLine(fx, fy);
          setNear(hit);
          showTip(ev, fx, fy, hit);
        }}
        onPointerUp={(ev) => {
          const xy = toXY(ev);
          if (drag && !drag.moved && xy) {
            const hit = nearestLine(xy[0], xy[1]);
            if (hit && hit.code !== selCode) onPickSector(hit.code);
            else onScrub(toA(xy[0]));
          }
          setDrag(null);
          try { ev.currentTarget.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
        }}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => { setNear(null); setTip(null); }}>
        <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--rule-strong)" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={sx(t)} y={H - M.b + 16} textAnchor="middle" style={svgText}>{pct(t)}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" style={svgLabel}>
          AI frontier progress (100% ≈ analytic tasks fully automated)
        </text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} y1={yof(t)} x2={W - M.r} y2={yof(t)} stroke="var(--rule)" strokeWidth="0.7" />
            <text x={M.l - 7} y={yof(t) + 3.5} textAnchor="end" style={svgText}>{t}</text>
          </g>
        ))}
        {/* the break-even line: above it a sector gains jobs, below it loses */}
        {tf(1) > jmin && tf(1) < jmax && (
          <g>
            <line x1={M.l} y1={yof(1)} x2={W - M.r} y2={yof(1)} stroke="var(--ink)" strokeWidth="1.1" />
            <text x={M.l - 7} y={yof(1) + 3.5} textAnchor="end" style={{ ...svgText, fill: 'var(--ink)', fontWeight: 600 }}>1</text>
            <text x={M.l + 5} y={yof(1) - 5} style={{ ...svgText, fontSize: 10 }}>today's jobs — above gains, below losses</text>
          </g>
        )}
        <text x={M.l - 34} y={M.t + 2} style={svgLabel}>jobs index (today = 1{useLog ? ', log scale' : ''})</text>
        <clipPath id="dc-jobs-clip"><rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} /></clipPath>
        <g clipPath="url(#dc-jobs-clip)">
          {hairlines.map((hl) => (
            <path key={hl.code} d={line(hl.pts)} fill="none"
              stroke={near?.code === hl.code ? 'var(--ink-2)' : 'var(--ink-4)'}
              strokeOpacity={near?.code === hl.code ? 0.95 : 0.22}
              strokeWidth={near?.code === hl.code ? 1.6 : 0.7} />
          ))}
        </g>
        <line x1={sx(astar)} y1={M.t + 10} x2={sx(astar)} y2={H - M.b} stroke="var(--accent-brand)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={sx(astar)} y={M.t + 6} textAnchor="middle" style={{ ...svgText, fill: 'var(--accent-brand)' }}>
          {pct(astar)}: jobs {fmtMult(Math.log(at.J))}
        </text>
        <path d={line(noceil)} fill="none" stroke="var(--ink-4)" strokeWidth="1.3" strokeDasharray="4 4" />
        <path d={line(data)} fill="none" stroke="var(--ink)" strokeWidth="2.2" />
        {interiorPeak && <circle cx={sx(peak.a)} cy={yof(peak.J)} r="4" fill="var(--accent-brand)" />}
        <text x={sx(1) + 6} y={yof(end.J) + 4} style={svgLabel}>this sector</text>
        <text x={sx(1) + 6} y={yof(endN.J) + 4} style={svgText}>ε = 1, χ = 1</text>
        <circle cx={sx(astar)} cy={yof(at.J)} r="4.5" fill="var(--accent-brand)" />
      </svg>
      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, padding: '6px 9px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 4 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

function DecompChart({ dec }) {
  const W = 640, H = 250;
  const rows = [
    ['Income growth (broad)', dec.income],
    ['Who gets the gains', dec.dist],
    ['Cheaper output', dec.cheaper],
    ['AI does the tasks', dec.displace],
    ['Provenance shield', dec.prov],
    ['Net jobs change', dec.total],
  ];
  const span = Math.max(0.4, ...rows.map((r) => Math.abs(r[1])));
  const x0 = 230, x1 = W - 70;
  const bx = (v) => x0 + (x1 - x0) / 2 + (v / (span * 1.08)) * ((x1 - x0) / 2);
  const rh = 26, pad = 9, top = 18;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
      aria-label="Decomposition of the jobs change into five forces">
      <line x1={bx(0)} y1={top - 6} x2={bx(0)} y2={top + 6 * (rh + pad) - pad + 6} stroke="var(--rule-strong)" />
      {rows.map(([lab, v], i) => {
        const y = top + i * (rh + pad);
        const net = i === rows.length - 1;
        return (
          <g key={lab}>
            <text x={x0 - 10} y={y + rh / 2 + 4} textAnchor="end" style={{ ...svgLabel, fontWeight: net ? 600 : 400 }}>{lab}</text>
            {net ? (
              <>
                <line x1={x0} y1={y - pad / 2} x2={x1 + 40} y2={y - pad / 2} stroke="var(--rule)" />
                {/* Dot matches the bar fills; the number uses the darker
                    text-safe variants of the same hues (design-system rule). */}
                <circle cx={bx(v)} cy={y + rh / 2} r="6" fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'} stroke="var(--paper)" strokeWidth="1" />
                <text x={bx(v) + (v >= 0 ? 12 : -12)} y={y + rh / 2 + 4} textAnchor={v >= 0 ? 'start' : 'end'}
                  style={{ ...svgText, fontWeight: 600, fill: v >= 0 ? 'var(--system-food-text)' : 'var(--system-health-text)' }}>{fmtMult(v)}</text>
              </>
            ) : (
              <>
                <rect x={Math.min(bx(0), bx(v))} y={y + 4} width={Math.max(Math.abs(bx(v) - bx(0)), 1.5)} height={rh - 8}
                  rx="4" fill={v >= 0 ? 'var(--positive)' : 'var(--negative)'} />
                {/* a long negative bar would run its label into the row name:
                    flip the label to the right of the zero line instead */}
                {v >= 0 || bx(v) > x0 + 55 ? (
                  <text x={bx(v) + (v >= 0 ? 6 : -6)} y={y + rh / 2 + 4} textAnchor={v >= 0 ? 'start' : 'end'} style={svgText}>{fmtMult(v)}</text>
                ) : (
                  <text x={bx(0) + 6} y={y + rh / 2 + 4} textAnchor="start" style={svgText}>{fmtMult(v)}</text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- two-lever contour sweep ---------------- */

const SWEEP_VARS = {
  a: { lab: 'AI frontier progress', min: 0, max: 1, fmt: pct },
  eps: { lab: 'Demand ceiling ε', min: -0.5, max: 2.5, fmt: (v) => v.toFixed(2) },
  phi: { lab: 'Provenance premium φ', min: 0, max: 0.6, fmt: pct },
  lint: { lab: 'Labor intensity ℓ', min: 0.05, max: 0.85, fmt: pct },
  chi: { lab: "Workers' capital share χ", min: 0, max: 1, fmt: pct },
  gA: { lab: 'AI reach, analytic', min: 0, max: 1, fmt: pct },
  gC: { lab: 'AI reach, creative', min: 0, max: 1, fmt: pct },
  gP: { lab: 'AI reach, physical', min: 0, max: 1, fmt: pct },
};
// Spectral diverging fills around no change (the lab's signature palette used
// as a diverging scale); band edges in ln(jobs index), labeled as percents.
const C_EDGES = [-1.204, -0.693, -0.357, -0.105, 0.095, 0.336, 0.693, 1.194];
const C_LABELS = ['−70%', '−50%', '−30%', '−10%', '+10%', '+40%', '+100%', '+230%'];
const C_FILLS = ['#9E0142', '#D53E4F', '#F46D43', '#FDAE61', '#FFFFBF',
                 '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD'];

function ContourChart({ sd, astar }) {
  const [cx, setCx] = useState('a');
  const [cy, setCy] = useState('eps');
  const [tip, setTip] = useState(null);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);

  const W = 640, H = 400, M = { l: 60, r: 148, t: 14, b: 48 };
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const NX = 49, NY = 37;
  const X = SWEEP_VARS[cx], Y = SWEEP_VARS[cy];

  const evalJ = (xv, yv) => {
    const dial = { ...sd };
    let a = astar;
    if (cx === 'a') a = xv; else dial[cx] = xv;
    if (cy === 'a') a = yv; else dial[cy] = yv;
    return sectorJobs(GE, a, dial).J;
  };

  const { fillPaths, zeroPath } = useMemo(() => {
    const vals = new Float64Array(NX * NY);
    for (let j = 0; j < NY; j++) {
      const yv = Y.min + (j / (NY - 1)) * (Y.max - Y.min);
      for (let i = 0; i < NX; i++) {
        const xv = X.min + (i / (NX - 1)) * (X.max - X.min);
        vals[j * NX + i] = Math.log(evalJ(xv, yv));
      }
    }
    const toPath = (mp) => mp.coordinates.map((poly) =>
      poly.map((ring) =>
        ring.map(([gx, gy], k) =>
          `${k ? 'L' : 'M'}${(M.l + (gx / NX) * pw).toFixed(1)},${(M.t + ph - (gy / NY) * ph).toFixed(1)}`
        ).join('') + 'Z'
      ).join('')
    ).join('');
    const gen = contours().size([NX, NY]);
    return {
      fillPaths: gen.thresholds(C_EDGES)(vals).map(toPath),
      zeroPath: toPath(gen.thresholds([0])(vals)[0]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sd, astar, cx, cy]);

  const pxx = (v) => M.l + ((v - X.min) / (X.max - X.min)) * pw;
  const pxy = (v) => M.t + ph - ((v - Y.min) / (Y.max - Y.min)) * ph;
  const curX = cx === 'a' ? astar : sd[cx];
  const curY = cy === 'a' ? astar : sd[cy];

  const onMove = (ev) => {
    const box = svgRef.current?.getBoundingClientRect();
    const fig = wrapRef.current?.getBoundingClientRect();
    if (!box || !fig) return;
    const fx = ((ev.clientX - box.left) / box.width) * W;
    const fy = ((ev.clientY - box.top) / box.height) * H;
    if (fx < M.l || fx > W - M.r || fy < M.t || fy > H - M.b) return setTip(null);
    const xv = X.min + ((fx - M.l) / pw) * (X.max - X.min);
    const yv = Y.min + ((M.t + ph - fy) / ph) * (Y.max - Y.min);
    const J = evalJ(xv, yv);
    let x = ev.clientX - fig.left + 14;
    if (x > fig.width - 250) x -= 270;
    setTip({
      x, y: ev.clientY - fig.top - 10,
      text: `${X.lab.toLowerCase()} ${X.fmt(xv)}  ·  ${Y.lab.toLowerCase()} ${Y.fmt(yv)}  →  jobs ${fmtMult(Math.log(J))}`,
    });
  };

  const axisTicks = (V, n = 5) =>
    Array.from({ length: n }, (_, i) => V.min + (i / (n - 1)) * (V.max - V.min));
  const selStyle = { font: '12px/1.4 var(--font-sans)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 2, padding: '3px 6px' };
  const opts = (other, cur) => Object.entries(SWEEP_VARS).map(([k, v]) => (
    <option key={k} value={k} disabled={k === other && k !== cur}>{v.lab}</option>
  ));

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
          across
          <select value={cx} onChange={(e) => setCx(e.target.value)} style={selStyle} aria-label="Horizontal sweep variable">
            {opts(cy, cx)}
          </select>
        </label>
        <label style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
          against
          <select value={cy} onChange={(e) => setCy(e.target.value)} style={selStyle} aria-label="Vertical sweep variable">
            {opts(cx, cy)}
          </select>
        </label>
      </div>
      <div ref={wrapRef} style={{ position: 'relative' }} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
          aria-label={`Jobs change versus today across ${X.lab} and ${Y.lab}; dashed lines mark the current slider values`}>
          <rect x={M.l} y={M.t} width={pw} height={ph} fill={C_FILLS[0]} />
          {fillPaths.map((d, i) => d && <path key={i} d={d} fill={C_FILLS[i + 1]} />)}
          {zeroPath && <path d={zeroPath} fill="none" stroke="var(--ink)" strokeWidth="1.5" />}
          <rect x={M.l} y={M.t} width={pw} height={ph} fill="none" stroke="var(--rule-strong)" />
          {/* dashed crosshair at the current slider values */}
          <line x1={pxx(curX)} y1={M.t} x2={pxx(curX)} y2={M.t + ph} stroke="var(--ink)" strokeWidth="1.1" strokeDasharray="3 4" />
          <line x1={M.l} y1={pxy(curY)} x2={M.l + pw} y2={pxy(curY)} stroke="var(--ink)" strokeWidth="1.1" strokeDasharray="3 4" />
          <circle cx={pxx(curX)} cy={pxy(curY)} r="5" fill="var(--accent-brand)" stroke="var(--paper)" strokeWidth="1.5" />
          {axisTicks(X).map((t) => (
            <text key={t} x={pxx(t)} y={H - M.b + 16} textAnchor="middle" style={svgText}>{X.fmt(t)}</text>
          ))}
          {axisTicks(Y).map((t) => (
            <text key={t} x={M.l - 7} y={pxy(t) + 3.5} textAnchor="end" style={svgText}>{Y.fmt(t)}</text>
          ))}
          <text x={M.l + pw / 2} y={H - 6} textAnchor="middle" style={svgLabel}>{X.lab}</text>
          <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" style={svgLabel}>{Y.lab}</text>
          {/* legend */}
          {C_FILLS.map((c, i) => {
            const lh = ph / C_FILLS.length;
            const y = M.t + ph - (i + 1) * lh;
            return (
              <g key={c}>
                <rect x={W - M.r + 18} y={y} width={14} height={lh - 1} fill={c} />
                {i < C_EDGES.length && (
                  <text x={W - M.r + 38} y={y + 3.5} style={svgText}>{C_LABELS[i]}</text>
                )}
              </g>
            );
          })}
          <text x={W - M.r + 18} y={M.t - 2} style={{ ...svgLabel, fontSize: 11 }}>jobs vs today</text>
          <line x1={W - M.r + 18} y1={M.t + ph + 32} x2={W - M.r + 32} y2={M.t + ph + 32} stroke="var(--ink)" strokeWidth="1.5" />
          <text x={W - M.r + 38} y={M.t + ph + 35.5} style={svgText}>no change</text>
        </svg>
        {tip && (
          <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, padding: '6px 9px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 4 }}>
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- K&M aggregate panel (hidden behind SHOW_KM) ---------------- */

const KM_SLIDERS = [
  { k: 'sig', lab: 'σ — physical vs intelligence', min: 0.3, max: 3, step: 0.01, fmt: (v) => v.toFixed(2), sub: 'Below 1: complements (intelligence saturates). Above 1: substitutes.' },
  { k: 'sigI', lab: 'σᴵ — within intelligence tasks', min: 0.6, max: 5, step: 0.05, fmt: (v) => v.toFixed(2) },
  { k: 'sigP', lab: 'σᴾ — capital vs labor in physical', min: 0.3, max: 3, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'thI', lab: 'θᴵ — returns to scale in intelligence', min: 0.5, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'tau', lab: 'τ — weight on the physical sector', min: 0.05, max: 0.5, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'aP', lab: 'αᴾ — capital weight in physical', min: 0.3, max: 0.9, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'KI', lab: 'Kᴵ — AI capital stock', min: 0.5, max: 50, step: 0.5, fmt: (v) => v.toFixed(1) },
  { k: 'KP', lab: 'Kᴾ — physical capital stock', min: 0.3, max: 5, step: 0.02, fmt: (v) => v.toFixed(2) },
];
const KM_PRESETS = [
  { name: 'K&M baseline', v: { ...km.BASE } },
  { name: 'Substitutable sectors', v: { ...km.BASE, sig: 1.5 } },
  { name: 'Hard intelligence tasks', v: { ...km.BASE, sigI: 0.9 } },
  { name: 'AI abundance', v: { ...km.BASE, KI: 40 } },
];
const KM_BASE_SWEEP = km.sweep(km.params(km.BASE));

function kmPath(data, yof, ymin, ymax, M, W, H, keepAbundant) {
  const sx = (a) => M.l + a * (W - M.l - M.r);
  let s = '', pen = false;
  for (const d of data) {
    const on = keepAbundant === null || d.abundant === keepAbundant;
    if (on) {
      const y = H - M.b - ((yof(d) - ymin) / (ymax - ymin)) * (H - M.b - M.t);
      s += `${pen ? 'L' : 'M'}${sx(d.aI).toFixed(1)},${y.toFixed(1)}`;
      pen = true;
    } else pen = false;
  }
  return s;
}

function KmCharts({ cur }) {
  const data = useMemo(() => km.sweep(km.params(cur)), [cur]);
  const W = 640, H = 330, M = { l: 46, r: 88, t: 14, b: 36 };
  const sx = (a) => M.l + a * (W - M.l - M.r);
  const wAll = [...data.map((d) => d.w), ...KM_BASE_SWEEP.map((d) => d.w)];
  const wmin = Math.min(...wAll) * 0.96, wmax = Math.max(...wAll) * 1.04;
  const peak = data.reduce((a, b) => (b.w > a.w ? b : a));
  const interior = peak.aI > data[0].aI && peak.aI < 1 && peak.w > data[0].w && peak.w > data[data.length - 1].w;
  const bad = data.filter((d) => !d.abundant);
  const yW = (v) => H - M.b - ((v - wmin) / (wmax - wmin)) * (H - M.b - M.t);
  const ymax2 = Math.max(...data.map((d) => d.Y)) * 1.05;
  const yL = (v) => H - M.b - (v / ymax2) * (H - M.b - M.t);
  const last = data[data.length - 1];
  const bEnd = KM_BASE_SWEEP[Math.floor(KM_BASE_SWEEP.length * 0.72)];
  const axisX = (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={sx(t)} y={H - M.b + 16} textAnchor="middle" style={svgText}>{t}</text>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" style={svgLabel}>Automation share of intelligence tasks α_I</text>
    </>
  );
  const shade = bad.length > 0 && (
    <>
      <rect x={sx(Math.min(...bad.map((d) => d.aI)))} y={M.t}
        width={Math.max(2, sx(Math.max(...bad.map((d) => d.aI))) - sx(Math.min(...bad.map((d) => d.aI))))}
        height={H - M.t - M.b} fill="var(--paper-3)" />
      <text x={(sx(Math.min(...bad.map((d) => d.aI))) + sx(Math.max(...bad.map((d) => d.aI)))) / 2} y={M.t + 12}
        textAnchor="middle" style={svgText}>AI scarce</text>
    </>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ ...mono11, margin: 0 }}>Wage = marginal product of labor · K&M eq. 17</p>
        <HoverFig width={W}
          xToData={(fx) => {
            const a = Math.min(1, Math.max(0, (fx - M.l) / (W - M.l - M.r)));
            return data.reduce((p, c) => (Math.abs(c.aI - a) < Math.abs(p.aI - a) ? c : p));
          }}
          format={(d) => `α ${d.aI.toFixed(2)}  wage ${d.w.toFixed(3)}${d.abundant ? '' : '  (AI scarce)'}`}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
            aria-label="Wage against automation share, current parameters and the published baseline">
            {shade}
            <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--rule-strong)" />
            {axisX}
            <text x={M.l - 34} y={M.t + 2} style={svgLabel}>wage</text>
            <path d={kmPath(KM_BASE_SWEEP, (d) => d.w, wmin, wmax, M, W, H, null)} fill="none" stroke="var(--ink-4)" strokeWidth="1.3" strokeDasharray="4 4" />
            <path d={kmPath(data, (d) => d.w, wmin, wmax, M, W, H, false)} fill="none" stroke="var(--ink)" strokeOpacity="0.3" strokeWidth="2" />
            <path d={kmPath(data, (d) => d.w, wmin, wmax, M, W, H, true)} fill="none" stroke="var(--ink)" strokeWidth="2.2" />
            <text x={sx(bEnd.aI) + 4} y={yW(bEnd.w) + 14} style={svgText}>K&M baseline</text>
            {interior && (
              <>
                <circle cx={sx(peak.aI)} cy={yW(peak.w)} r="4" fill="var(--accent-brand)" />
                <text x={Math.min(sx(peak.aI) + 8, W - M.r - 10)} y={Math.max(yW(peak.w) - 8, M.t + 10)}
                  style={{ ...svgText, fill: 'var(--accent-brand)' }}>peak α={peak.aI.toFixed(2)}</text>
              </>
            )}
          </svg>
        </HoverFig>
        <figcaption style={caption}>
          {interior
            ? `The wage rises until α = ${peak.aI.toFixed(2)}, then falls: early automation lifts every worker's product, late automation crowds workers into physical tasks faster than output grows. Dashed: the published baseline (peak at 0.30).`
            : 'The wage moves monotonically under these parameters — no hump. Dashed: the published baseline, whose wage peaks at α = 0.30 and then declines.'}
        </figcaption>
      </figure>
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ ...mono11, margin: 0 }}>Allocation and output · K&M fig. 2</p>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
          aria-label="Share of labor in the physical sector and total output against automation share">
          {shade}
          <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--rule-strong)" />
          {axisX}
          <text x={M.l - 34} y={M.t + 2} style={svgLabel}>level</text>
          <path d={kmPath(data, (d) => d.Y, 0, ymax2, M, W, H, true)} fill="none" stroke="var(--negative)" strokeWidth="2.2" />
          <path d={kmPath(data, (d) => d.Y, 0, ymax2, M, W, H, false)} fill="none" stroke="var(--negative)" strokeOpacity="0.3" strokeWidth="2" />
          <path d={kmPath(data, (d) => d.beta, 0, ymax2, M, W, H, true)} fill="none" stroke="var(--info)" strokeWidth="2.2" />
          <path d={kmPath(data, (d) => d.beta, 0, ymax2, M, W, H, false)} fill="none" stroke="var(--info)" strokeOpacity="0.3" strokeWidth="2" />
          <text x={sx(1) + 6} y={yL(last.Y) + 4} style={{ ...svgLabel, fill: 'var(--negative)' }}>Y output</text>
          <text x={sx(1) + 6} y={yL(last.beta) + 4} style={{ ...svgLabel, fill: 'var(--info)' }}>β* physical</text>
        </svg>
        <figcaption style={caption}>
          β* is the share of labor in the physical sector once wages equalize; Y is total output.
          Both rise with automation under every parameterization — the action for workers is in
          the wage, not in output.
        </figcaption>
      </figure>
    </div>
  );
}

function KmSection() {
  const [cur, setCur] = useState({ ...km.BASE });
  return (
    <section aria-label="Aggregate model" style={{ borderTop: '2px solid var(--ink)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ ...mono11, margin: 0 }}>The aggregate model · Kording & Marinescu (2025)</p>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 23, fontWeight: 600, lineHeight: 1.2, margin: '4px 0 6px', color: 'var(--ink)' }}>
          When does automating intelligence help workers?
        </h2>
        <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-2)', maxWidth: '72ch', lineHeight: 1.5 }}>
          The baseline our project extends: two complementary sectors, physical and intelligence,
          with labor flowing between them. Output always rises with automation, yet the wage can
          rise and then fall. Drag the parameters to see which worlds produce the hump.
        </p>
      </div>
      <div className="dc-km-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--rule)', borderRadius: 4, padding: '14px 14px 16px', background: 'var(--paper-2)', alignSelf: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {KM_PRESETS.map((p) => {
              const on = KM_SLIDERS.every((s) => Math.abs(p.v[s.k] - cur[s.k]) < 1e-9);
              return (
                <button key={p.name} type="button" onClick={() => setCur({ ...p.v })}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 9px', cursor: 'pointer',
                    border: '1px solid var(--rule-strong)', borderRadius: 2,
                    background: on ? 'var(--ink)' : 'var(--paper)', color: on ? 'var(--paper)' : 'var(--ink-2)',
                  }}>
                  {p.name}
                </button>
              );
            })}
          </div>
          {KM_SLIDERS.map((s) => (
            <Ctl key={s.k} k={`km-${s.k}`} lab={s.lab} min={s.min} max={s.max} step={s.step}
              value={cur[s.k]} fmt={s.fmt} sub={s.sub}
              onChange={(v) => setCur((c) => ({ ...c, [s.k]: v }))} />
          ))}
        </div>
        <KmCharts cur={cur} />
      </div>
    </section>
  );
}

/* ---------------- the tool ---------------- */

export default function DemandCeilingsTool() {
  const [sd, setSd] = useState(() => {
    const def = SECTORS.find((s) => s.code === '722110') ?? SECTORS[0];
    return { ...SDEF, eps: def.eps, lint: def.lint, thP: def.thP, thA: def.thA, thC: def.thC };
  });
  const [selCode, setSelCode] = useState(SECTORS.find((s) => s.code === '722110') ? '722110' : SECTORS[0]?.code ?? '');
  const [astar, setAstar] = useState(0.6);
  const [methodsOpen, setMethodsOpen] = useState(false);

  const sel = selCode ? SECTORS.find((x) => x.code === selCode) : null;

  const set = (k, v, keepSector = false) => {
    setSd((d) => {
      const n = { ...d, [k]: v };
      if (k === 'thA' || k === 'thC') {
        const other = k === 'thA' ? 'thC' : 'thA';
        if (n.thA + n.thC > 1) n[other] = 1 - v;
        n.thP = 1 - n.thA - n.thC;
      }
      return n;
    });
    if (!keepSector) setSelCode('');
  };

  const pickSector = (code) => {
    setSelCode(code);
    const s = SECTORS.find((x) => x.code === code);
    if (s) setSd((d) => ({ ...d, eps: s.eps, lint: s.lint, thP: s.thP, thA: s.thA, thC: s.thC }));
  };

  const data = useMemo(() => sectorSweep(GE, sd), [sd]);
  const noceil = useMemo(() => sectorSweep(GE, { ...sd, eps: 1, chi: 1 }, 60), [sd]);
  // Every industry under the same scenario dials, each at its own measured
  // eps / labor intensity / task mix — the hairline backdrop.
  const hairlines = useMemo(() => {
    const scen = { gP: sd.gP, gA: sd.gA, gC: sd.gC, phi: sd.phi, chi: sd.chi };
    return SECTORS.map((s) => ({
      code: s.code, name: s.name,
      pts: sectorSweep(
        GE, { ...scen, eps: s.eps, lint: s.lint, thP: s.thP, thA: s.thA, thC: s.thC }, 60),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sd.gP, sd.gA, sd.gC, sd.phi, sd.chi]);
  const at = sectorJobs(GE, astar, sd);
  const dec = decompose(GE, astar, sd);
  const secName = sel ? sel.name : 'Custom sector';
  const peak = data.reduce((a, b) => (b.J > a.J ? b : a));
  const interiorPeak = peak.a > 0.02 && peak.a < 0.99 && peak.J > data[0].J && peak.J > data[data.length - 1].J;
  const jpc = 100 * (at.J - 1);

  const groups = useMemo(() => {
    const g = {};
    for (const s of SECTORS) (g[s.ct] = g[s.ct] || []).push(s);
    return g;
  }, []);

  const measured = (v) => (sel ? [{ v, accent: true }] : []);

  const methodsBtn = (label) => (
    <button type="button" onClick={() => setMethodsOpen(true)}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', letterSpacing: 'inherit', textTransform: 'inherit' }}>
      {label}
    </button>
  );

  const rail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label htmlFor="dc-sector" style={{ ...mono11, fontWeight: 500 }}>Sector</label>
      <select id="dc-sector" value={selCode} onChange={(e) => pickSector(e.target.value)}
        style={{ font: '13px/1.4 var(--font-sans)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 2, padding: '6px 8px', maxWidth: '100%' }}>
        <option value="">— Custom sector —</option>
        {['physical', 'time_budget', 'open_ended', 'provenance'].map((ct) =>
          groups[ct] ? (
            <optgroup key={ct} label={CT_NAMES[ct]}>
              {groups[ct].map((s) => (
                <option key={s.code} value={s.code}>{s.name} ({s.emp}M)</option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
      <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.35 }}>
        Cardinal tick marks under the sliders show this sector's measured values; gray ticks
        mark scenario defaults. {methodsBtn('Methods')}
      </div>

      <GroupHead>What the sector sells</GroupHead>
      <Ctl k="eps" lab="Demand ceiling ε (income elasticity)" min={-0.5} max={2.5} step={0.01} value={sd.eps} fmt={(v) => v.toFixed(2)}
        ticks={[{ v: 0, label: 'saturated' }, { v: 1, label: 'tracks income' }, ...measured(sel?.eps ?? 1)]}
        sub="Each 1% of income growth moves the quantity demanded by about ε%. At ε = 0 the ceiling binds: richer households buy no more. At ε = 2, demand grows twice as fast as income — a doubling of income roughly quadruples demand. Measured per sector from 66 years of US consumption data."
        onChange={(v) => set('eps', v)} />
      <Ctl k="phi" lab="Provenance premium φ" min={0} max={0.6} step={0.01} value={sd.phi} fmt={pct}
        sub="Share of the sector's demand that insists on attested human work — it keeps its labor and its cost."
        onChange={(v) => set('phi', v, true)} />

      <GroupHead>How it's made</GroupHead>
      <Ctl k="lint" lab="Labor intensity ℓ" min={0.05} max={0.85} step={0.01} value={sd.lint} fmt={pct}
        ticks={measured(sel?.lint ?? SDEF.lint)}
        sub="Compensation share of output value — how much automation can cut the price."
        onChange={(v) => set('lint', v)} />
      <Ctl k="thA" lab="Analytic task share" min={0} max={1} step={0.01} value={sd.thA} fmt={pct}
        ticks={measured(sel?.thA ?? SDEF.thA)}
        onChange={(v) => set('thA', v)} />
      <Ctl k="thC" lab="Creative task share" min={0} max={1} step={0.01} value={sd.thC} fmt={pct}
        extra={` (physical ${pct(sd.thP)})`}
        ticks={measured(sel?.thC ?? SDEF.thC)}
        sub="Physical is the remainder. Measured from occupation staffing × task content (OEWS × O*NET)."
        onChange={(v) => set('thC', v)} />

      <GroupHead>AI frontier (exposure by task type)</GroupHead>
      <Ctl k="gA" lab="AI reach into analytic tasks" min={0} max={1} step={0.01} value={sd.gA} fmt={pct}
        ticks={[{ v: SDEF.gA }]}
        onChange={(v) => set('gA', v, true)} />
      <Ctl k="gC" lab="AI reach into creative tasks" min={0} max={1} step={0.01} value={sd.gC} fmt={pct}
        ticks={[{ v: SDEF.gC }]}
        onChange={(v) => set('gC', v, true)} />
      <Ctl k="gP" lab="AI reach into physical tasks" min={0} max={1} step={0.01} value={sd.gP} fmt={pct}
        ticks={[{ v: SDEF.gP }]}
        sub="Share of each task type AI can perform at full frontier progress — physical tasks lag cognitive ones while robotics catches up. Scenario dials, not measurements."
        onChange={(v) => set('gP', v, true)} />

      <GroupHead>Who gets the gains</GroupHead>
      <Ctl k="chi" lab="Workers' share of capital income χ" min={0} max={1} step={0.01} value={sd.chi} fmt={pct}
        ticks={[{ v: SDEF.chi }]}
        sub="χ = 1: automation gains reach everyone. χ = 0: wages only. Income paths from our two-group general equilibrium."
        onChange={(v) => set('chi', v, true)} />
    </div>
  );

  return (
    <div className="dc-tool" style={{ height: '100%', position: 'relative' }}>
      {methodsOpen && <MethodsPane onClose={() => setMethodsOpen(false)} />}
      <ToolShell
        eyebrow="Interactive model"
        title="AI and labor"
        rail={rail}
        headerSummary={false}
        mainScroll
      >
        <div style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div>
            <p style={{ ...mono11, margin: 0 }}>
              Sector lens · 84 US industries · {methodsBtn('methods')}
            </p>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 3.4vw, 32px)', fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.01em', margin: '4px 0 0', color: 'var(--ink)' }}>
              {secName}{sel ? ` — ${sel.emp}M jobs` : ''}
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }} aria-live="polite">
            <Tile accent v={`${Math.abs(jpc) >= 200 ? `×${at.J.toFixed(1)}` : `${jpc >= 0 ? '+' : ''}${jpc.toFixed(0)}%`}`}
              l={`jobs at ${pct(astar)} frontier progress vs today`} />
            <Tile v={pct(at.h)} l="of the work still done by humans there" />
            <Tile v={`${at.D.toFixed(1)}×`} l="demand at that point (income effect incl. distribution)" />
            {interiorPeak
              ? <Tile v={pct(peak.a)} l="frontier progress where this sector's jobs peak" />
              : <Tile v="—" l="no interior jobs peak under these settings" />}
          </div>

          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ ...mono11, margin: 0 }}>Jobs index · demand × price × human task share</p>
            <JobsChart data={data} noceil={noceil} astar={astar} at={at} onScrub={setAstar}
              hairlines={hairlines} selCode={selCode} onPickSector={pickSector} />
            <figcaption style={caption}>
              Drag across the chart to move the evaluation point; click any thin line to switch
              to that industry. Bold: the selected sector, at income elasticity
              ε = {sd.eps.toFixed(2)} and workers' capital share χ = {pct(sd.chi)}. Thin lines:
              all 84 industries under the same scenario dials, each at its own measured ε, labor
              intensity, and task mix. The solid horizontal line at 1 is today's employment —
              the border between gains and losses. Dashed curve: demand simply tracking broadly
              shared income (ε = 1, χ = 1).{' '}
              {interiorPeak
                ? `This sector's jobs peak at ${pct(peak.a)} frontier progress, then displacement outruns demand.`
                : 'No interior peak for this sector under these settings.'}
            </figcaption>
          </figure>

          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ ...mono11, margin: 0 }}>Decomposition · log contributions, exact</p>
            <h3 style={figTitle}>Why: the five forces at {pct(astar)} frontier progress</h3>
            <DecompChart dec={dec} />
            <figcaption style={caption}>
              Bars multiply to the net jobs change (they add in logs); green raises jobs, red cuts
              them. "Who gets the gains" is the demand shift from moving capital income between
              workers and capital owners; "provenance shield" nets the labor it protects against
              the price advantage it forgoes.
            </figcaption>
          </figure>

          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ ...mono11, margin: 0 }}>Two-lever sweep · surface = jobs vs today at {pct(astar)} frontier progress</p>
            <ContourChart sd={sd} astar={astar} />
            <figcaption style={caption}>
              The surface sweeps two levers at once, holding the rest at their slider values;
              colors indicate the change in jobs. Dashed crosshair: the current slider values,
              movable from the rail. When a swept axis is not frontier progress, the surface is
              evaluated at the marked point ({pct(astar)}).
            </figcaption>
          </figure>

          <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ ...mono11, margin: 0 }}>Force mix · every industry at {pct(astar)} frontier progress</p>
            <h3 style={figTitle}>Which force matters where — sectors sized by their wage bill</h3>
            <ForcesChart sd={sd} astar={astar} />
            <figcaption style={caption}>
              Each column is an industry, width proportional to its wage bill (employment ×
              average wages); the stack splits 100% by each force's share of the sector's total
              log jobs change in absolute value, at the current levers. Colors identify the
              forces; hover any column for the signed values. Wide red columns are the economy's
              economically important displacement zones; wide blue ones ride income growth.
            </figcaption>
          </figure>

          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
            <div>
              <h3 style={{ ...mono11, fontWeight: 500, margin: '0 0 6px' }}>The mechanism</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                Jobs = demand × human task share. AI progress works every lever at once: it makes
                the sector's output cheaper (more demand), automates its tasks (fewer jobs per
                unit), and raises economy-wide incomes (more demand — but only up to the sector's
                ceiling, and only for whoever receives the income). The jobs index counts human
                labor demanded — employment, not pay. The sector's wage is held fixed in this
                lens, so up to that assumption the same curve is also the sector's wage-bill
                index; wage levels are a general-equilibrium question, treated in the project's
                formal model.
              </p>
            </div>
            <div>
              <h3 style={{ ...mono11, fontWeight: 500, margin: '0 0 6px' }}>What to try</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                Load limited-service restaurants (saturated, physical) and watch displacement race
                thin demand growth. Load legal services (analytic, high ε) — demand headroom fights
                automation of its own tasks. Give any sector a 25% provenance premium. Then drag
                workers' share of capital income to 0 and watch mass-market sectors starve while
                elite demand holds up the top of the market.
              </p>
            </div>
            <div>
              <h3 style={{ ...mono11, fontWeight: 500, margin: '0 0 6px' }}>Honest caveats</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                Partial equilibrium on a general-equilibrium backdrop: the income paths come from
                our two-group model (calibrated Engel parameters), but each sector's own wages and
                prices don't feed back. Elasticities are measured 1959–2025 and extrapolated far
                out of sample; task exposure is a judgment dial, not a measurement. The tool
                illustrates mechanisms — it is not a forecast. Full details in the{' '}
                {methodsBtn('methods pane')}.
              </p>
            </div>
          </div>

          {SHOW_KM && <KmSection />}

          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, borderTop: '1px solid var(--rule)', paddingTop: 12, margin: 0 }}>
            Sector data: BEA 2017 detail benchmark × BLS QCEW 2025 employment × OEWS/O*NET task
            decomposition × PCE Engel slopes (1959–2025), with income paths from the project's
            two-group general equilibrium. Constants: price elasticity of demand η = {ETA}; AI
            performs an automated task at 10% of the human cost. The aggregate framework builds
            on{' '}
            <a href="https://www.brookings.edu/articles/artificial-intelligence-saturation-and-the-future-of-work/">
              Kording & Marinescu (2025)
            </a>. Full {methodsBtn('methods')} in the tool; the{' '}
            <a href="/tools/ai-labor-methods">model schematic</a> page carries the equations and
            data provenance. Part of the lab's AI, demand ceilings, and the future of work
            project.
          </p>
        </div>
      </ToolShell>
    </div>
  );
}
