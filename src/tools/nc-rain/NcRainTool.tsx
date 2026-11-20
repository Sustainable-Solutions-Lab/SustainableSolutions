/**
 * How often it rains in North Carolina, 1976–2025. Daily precipitation from
 * six long-record NOAA GHCN-Daily airport stations (mountains to coast),
 * summarised by scripts/build-nc-rain.mjs into data/rain.json. Three views
 * of the same counts: days with rain each year (with a 10-year running mean
 * and linear trend), the share of rainy days by month and year, and each
 * month's share in the first 25 years against the last 25.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ToolShell from '../_shell/ToolShell';
import raw from './data/rain.json';

type Year = { year: number; missing?: boolean; days?: number[]; totalIn?: number; monthly?: (number[] | null)[] };
type Station = { id: string; name: string; region: string; series: Year[] };
const DATA = raw as { start: number; end: number; thresholds: number[]; stations: Station[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const THRESH_LABEL = ['Any rain (≥ 0.01 in)', 'Moderate (≥ 0.5 in)', 'Heavy (≥ 1 in)'];
const THRESH_SHORT = ['days with any rain', 'days with at least 0.5 in of rain', 'days with at least 1 in of rain'];
const ALL = 'all';
const SPLIT = 2000; // first half 1976–2000, second 2001–2025

// Wet half of ColorBrewer Spectral (same constants as --spectral-6…11);
// interpolated per cell, so read as numbers rather than CSS tokens.
const RAMP = ['#FFFFBF', '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD', '#5E4FA2'];
function rampColor(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  const a = RAMP[i], b = RAMP[i + 1];
  const ch = (h: string, k: number) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16);
  return `rgb(${[0, 1, 2].map((k) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * f)).join(',')})`;
}

/* ---------------- data ---------------- */

type Row = { year: number; days: number; monthly: number[] };

function seriesFor(stationId: string, k: number): Row[] {
  const sts = stationId === ALL ? DATA.stations : DATA.stations.filter((s) => s.id === stationId);
  const rows: Row[] = [];
  for (let y = DATA.start; y <= DATA.end; y++) {
    const ys = sts.map((s) => s.series.find((r) => r.year === y)).filter((r): r is Year => !!r && !r.missing);
    if (!ys.length) continue;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    rows.push({
      year: y,
      days: mean(ys.map((r) => r.days![k])),
      monthly: MONTHS.map((_, m) => mean(ys.map((r) => r.monthly![m]?.[k]).filter((v): v is number => v != null))),
    });
  }
  return rows;
}

/** OLS slope per decade with a 95% range. */
function trend(rows: Row[]) {
  const n = rows.length, xs = rows.map((r) => r.year), ys = rows.map((r) => r.days);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
  const b = sxy / sxx, a = my - b * mx;
  const sse = xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { a, b, per10: b * 10, lo: (b - 2.01 * se) * 10, hi: (b + 2.01 * se) * 10 };
}

function runningMean(rows: Row[], w = 10) {
  return rows.map((_, i) => {
    if (i < w - 1) return null;
    const s = rows.slice(i - w + 1, i + 1);
    return s.reduce((t, r) => t + r.days, 0) / w;
  });
}

const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);

/* ---------------- layout helpers ---------------- */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const eyebrow: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const figTitle: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: '2px 0 4px' };
const caption: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: '6px 0 0', maxWidth: 720 };
const axisText = { fontSize: 11, fill: 'var(--ink-3)', fontFamily: 'var(--font-sans)' } as const;

function Figure({ label, title, children, note }: { label: string; title: string; children: React.ReactNode; note: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--rule-strong)', paddingTop: 14, marginBottom: 36 }}>
      <div style={eyebrow}>{label}</div>
      <h2 style={figTitle}>{title}</h2>
      {children}
      <p style={caption}>{note}</p>
    </section>
  );
}

/* ---------------- figures ---------------- */

function AnnualChart({ rows, k, selected, onSelect }: { rows: Row[]; k: number; selected: number | null; onSelect: (y: number | null) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 280, m = { t: 12, r: 12, b: 26, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ymax = Math.ceil((Math.max(...rows.map((r) => r.days)) * 1.08) / 10) * 10;
  const x = (y: number) => m.l + ((y - DATA.start) / (DATA.end - DATA.start + 1)) * iw;
  const bw = iw / (DATA.end - DATA.start + 1);
  const y = (v: number) => m.t + ih - (v / ymax) * ih;
  const rm = runningMean(rows);
  const t = trend(rows);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((ymax / 4) * i));
  const line = rows.map((r, i) => (rm[i] == null ? null : `${x(r.year) + bw / 2},${y(rm[i]!)}`)).filter(Boolean).join(' ');
  const sel = rows.find((r) => r.year === selected);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={W} height={H} role="img" aria-label={`Bar chart of ${THRESH_SHORT[k]} per year`} onMouseLeave={() => onSelect(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" {...axisText}>{v}</text>
          </g>
        ))}
        {rows.map((r) => (
          <rect key={r.year} x={x(r.year) + 0.6} width={Math.max(1, bw - 1.2)} y={y(r.days)} height={y(0) - y(r.days)}
            fill={r.year === selected ? 'var(--spectral-11)' : 'var(--spectral-10)'} opacity={selected && r.year !== selected ? 0.55 : 0.85} />
        ))}
        <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth={2} />
        <line x1={x(DATA.start)} x2={x(DATA.end) + bw} y1={y(t.a + t.b * DATA.start)} y2={y(t.a + t.b * (DATA.end + 1))}
          stroke="var(--cardinal)" strokeWidth={1.25} strokeDasharray="5 4" />
        {[1980, 1990, 2000, 2010, 2020].map((yr) => (
          <text key={yr} x={x(yr) + bw / 2} y={H - 8} textAnchor="middle" {...axisText}>{yr}</text>
        ))}
        {/* Hit targets: hover on desktop, tap on touch. */}
        {rows.map((r) => (
          <rect key={`h${r.year}`} x={x(r.year)} width={bw} y={m.t} height={ih} fill="transparent"
            onMouseEnter={() => onSelect(r.year)} onClick={() => onSelect(selected === r.year ? null : r.year)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 18px', fontSize: 12.5, color: 'var(--ink-2)', minHeight: 20 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Swatch c="var(--spectral-10)" /> Each year</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Swatch c="var(--ink)" line /> 10-year running mean</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Swatch c="var(--cardinal)" line dash /> Linear trend</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
          {sel ? <><b>{sel.year}</b>: {fmt(sel.days)} {THRESH_SHORT[k]}</> : <span style={{ color: 'var(--ink-3)' }}>Hover or tap a year</span>}
        </span>
      </div>
    </div>
  );
}

function Swatch({ c, line, dash }: { c: string; line?: boolean; dash?: boolean }) {
  return line
    ? <svg width={18} height={10} style={{ verticalAlign: 'middle', marginRight: 4 }}><line x1={0} x2={18} y1={5} y2={5} stroke={c} strokeWidth={2} strokeDasharray={dash ? '4 3' : undefined} /></svg>
    : <span style={{ display: 'inline-block', width: 10, height: 10, background: c, verticalAlign: 'middle', marginRight: 2 }} />;
}

function Heatmap({ rows, selected, onSelect }: { rows: Row[]; selected: number | null; onSelect: (y: number | null) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const m = { t: 4, r: 12, b: 26, l: 36 };
  const cw = (W - m.l - m.r) / rows.length, ch = 17, H = m.t + ch * 12 + m.b;
  const vals = rows.flatMap((r) => r.monthly);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const [hover, setHover] = useState<{ y: number; m: number } | null>(null);
  const h = hover ? rows.find((r) => r.year === hover.y) : null;
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Heatmap of the share of rainy days by month and year" onMouseLeave={() => setHover(null)}>
        {MONTHS.map((mo, j) => (
          <text key={mo} x={m.l - 6} y={m.t + j * ch + ch / 2 + 4} textAnchor="end" {...axisText}>{W < 480 ? mo[0] : mo}</text>
        ))}
        {rows.map((r, i) => r.monthly.map((v, j) => (
          <rect key={`${r.year}-${j}`} x={m.l + i * cw} y={m.t + j * ch} width={cw + 0.5} height={ch + 0.5}
            fill={rampColor((v - lo) / (hi - lo || 1))}
            onMouseEnter={() => setHover({ y: r.year, m: j })}
            onClick={() => { setHover({ y: r.year, m: j }); onSelect(r.year); }} style={{ cursor: 'pointer' }} />
        )))}
        {selected != null && rows.some((r) => r.year === selected) && (
          <rect x={m.l + rows.findIndex((r) => r.year === selected) * cw} y={m.t} width={cw} height={ch * 12} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        )}
        {[1980, 1990, 2000, 2010, 2020].map((yr) => (
          <text key={yr} x={m.l + (yr - DATA.start + 0.5) * cw} y={H - 8} textAnchor="middle" {...axisText}>{yr}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink-2)' }}>
        <span>{fmt(lo * 100)}%</span>
        <span style={{ width: 120, height: 8, background: `linear-gradient(to right, ${RAMP.join(',')})`, border: '1px solid var(--rule)' }} />
        <span>{fmt(hi * 100)}% of days</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: h ? 'var(--ink)' : 'var(--ink-3)' }}>
          {h && hover ? <><b>{MONTHS[hover.m]} {h.year}</b>: rain on {fmt(h.monthly[hover.m] * 100)}% of days</> : 'Hover or tap a cell'}
        </span>
      </div>
    </div>
  );
}

function MonthCompare({ rows }: { rows: Row[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 230, m = { t: 12, r: 12, b: 26, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const avg = (sub: Row[]) => MONTHS.map((_, j) => sub.reduce((t, r) => t + r.monthly[j], 0) / sub.length);
  const a = avg(rows.filter((r) => r.year <= SPLIT)), b = avg(rows.filter((r) => r.year > SPLIT));
  const ymax = Math.ceil(Math.max(...a, ...b) * 10) / 10; // next 10%
  const x = (j: number) => m.l + ((j + 0.5) / 12) * iw;
  const y = (v: number) => m.t + ih - (v / ymax) * ih;
  const step = ymax > 0.3 ? 0.1 : ymax > 0.12 ? 0.05 : 0.02;
  const ticks = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => +(i * step).toFixed(2));
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Share of rainy days by month, 1976–2000 against 2001–2025">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" {...axisText}>{fmt(v * 100)}%</text>
          </g>
        ))}
        {MONTHS.map((mo, j) => (
          <g key={mo}>
            <line x1={x(j)} x2={x(j)} y1={y(a[j])} y2={y(b[j])} stroke="var(--ink-4)" strokeWidth={2} />
            <circle cx={x(j)} cy={y(a[j])} r={5} fill="var(--paper)" stroke="var(--spectral-4)" strokeWidth={2.5} />
            <circle cx={x(j)} cy={y(b[j])} r={5} fill="var(--spectral-10)" />
            <text x={x(j)} y={H - 8} textAnchor="middle" {...axisText}>{W < 480 ? mo[0] : mo}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12.5, color: 'var(--ink-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width={12} height={12} style={{ verticalAlign: 'middle' }}><circle cx={6} cy={6} r={4} fill="var(--paper)" stroke="var(--spectral-4)" strokeWidth={2} /></svg> 1976–2000</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width={12} height={12} style={{ verticalAlign: 'middle' }}><circle cx={6} cy={6} r={5} fill="var(--spectral-10)" /></svg> 2001–2025</span>
      </div>
    </div>
  );
}

/* ---------------- tool ---------------- */

function Choice({ active, onClick, children, sub }: { active: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left',
        padding: '7px 10px', fontSize: 13.5, borderRadius: 2, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--rule)'}`,
        background: active ? 'var(--paper)' : 'transparent', color: 'var(--ink)', fontWeight: active ? 600 : 400,
      }}>
      <span>{children}</span>{sub && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 400 }}>{sub}</span>}
    </button>
  );
}

export default function NcRainTool() {
  const [station, setStation] = useState<string>(ALL);
  const [k, setK] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const rows = useMemo(() => seriesFor(station, k), [station, k]);
  const t = useMemo(() => trend(rows), [rows]);
  const first = rows.filter((r) => r.year <= SPLIT), last = rows.filter((r) => r.year > SPLIT);
  const mean = (xs: Row[]) => xs.reduce((s, r) => s + r.days, 0) / xs.length;
  const where = station === ALL ? 'Six North Carolina stations, averaged' : DATA.stations.find((s) => s.id === station)!.name;
  const wettest = rows.reduce((a, b) => (b.days > a.days ? b : a)), driest = rows.reduce((a, b) => (b.days < a.days ? b : a));
  const clearTrend = t.lo > 0 || t.hi < 0;
  const monthMean = MONTHS.map((_, j) => rows.reduce((s, r) => s + r.monthly[j], 0) / rows.length);
  const order = MONTHS.map((_, j) => j).sort((x, y) => monthMean[y] - monthMean[x]);
  const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const rail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ ...eyebrow, marginBottom: 6 }}>Station</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Choice active={station === ALL} onClick={() => setStation(ALL)}>All six, averaged</Choice>
          {DATA.stations.map((s) => (
            <Choice key={s.id} active={station === s.id} onClick={() => setStation(s.id)} sub={s.region}>{s.name}</Choice>
          ))}
        </div>
      </div>
      <div>
        <div style={{ ...eyebrow, marginBottom: 6 }}>Count a day as rainy if</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {THRESH_LABEL.map((l, i) => <Choice key={l} active={k === i} onClick={() => setK(i)}>{l}</Choice>)}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 12, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        <div style={{ ...eyebrow, marginBottom: 6 }}>{where}</div>
        <Stat label="1976–2000 average" value={`${fmt(mean(first))} days`} />
        <Stat label="2001–2025 average" value={`${fmt(mean(last))} days`} />
        <Stat label="Linear trend" value={`${signed(t.per10)} days/decade`} />
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
          95% range {signed(t.lo)} to {signed(t.hi)}; {clearTrend ? 'distinguishable from zero.' : 'not distinguishable from zero.'}
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, margin: 0 }}>
        Daily precipitation from NOAA GHCN-Daily, airport stations with complete 1976–2025 records. Years with a few missing days are scaled to a full year.
      </p>
    </div>
  );

  return (
    <ToolShell eyebrow="Climate data" title="Rain in North Carolina"
      summary="How often it rained, from fifty years of daily gauge records (1976–2025)." rail={rail} mainScroll surface="paper-2">
      <div style={{ padding: '20px clamp(16px, 3vw, 36px) 40px', maxWidth: 1100 }}>
        <Figure label="Figure 1" title={`${THRESH_SHORT[k][0].toUpperCase()}${THRESH_SHORT[k].slice(1)}, by year`}
          note={<>{where}. Average {fmt(mean(first))} days a year in 1976–2000 and {fmt(mean(last))} in 2001–2025; most in {wettest.year} ({fmt(wettest.days)}), fewest in {driest.year} ({fmt(driest.days)}). Year-to-year swings are larger than the 50-year change.</>}>
          <AnnualChart rows={rows} k={k} selected={selected} onSelect={setSelected} />
        </Figure>
        <Figure label="Figure 2" title="Share of days with rain, by month and year"
          note={<>Each column is a year, each row a month. Over the 50 years, {MONTH_NAME[order[0]]} {k === 0 ? 'had rain' : 'reached the threshold'} most often ({fmt(monthMean[order[0]] * 100)}% of days) and {MONTH_NAME[order[11]]} least often ({fmt(monthMean[order[11]] * 100)}%).</>}>
          <Heatmap rows={rows} selected={selected} onSelect={setSelected} />
        </Figure>
        <Figure label="Figure 3" title="Each month, first 25 years against the last 25"
          note="Share of days in each month that met the threshold, averaged over 1976–2000 and over 2001–2025.">
          <MonthCompare rows={rows} />
        </Figure>
      </div>
    </ToolShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
