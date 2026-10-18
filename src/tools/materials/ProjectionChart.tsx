/**
 * The tool's first figure: what the world has used, and what it uses next.
 *
 * Shaped after Figure 2 of the paper, with two departures. It is stacked, so
 * the four material groups (or the materials inside one of them) are visible
 * as parts of the total rather than as one line whose movements have no
 * attribution — a single line bends and nobody can say which material bent it.
 * And the projection is drawn in the same colours at lower opacity, so the
 * boundary between measurement and model is a property of the ink rather than
 * a caption someone has to remember.
 *
 * Components are stacked largest at the bottom, "other" categories at the top,
 * and coloured along a spectral ramp from bottom to top.
 *
 * A component may be negative: domestic material consumption is extraction plus
 * net imports, so a large net exporter of a fuel can report less than nothing.
 * Cumulative sums handle that on their own — the band for such a series runs
 * downward — so nothing here clamps, and the y axis opens below zero when it
 * has to.
 */
import { useEffect, useRef, useState } from 'react';

export interface Band {
  p05: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  min: number[];
  max: number[];
}

export interface StackSeries {
  key: string;
  label: string;
  color: string;
  /** Measured, one per history year; null where the measure cannot be formed. */
  past: (number | null)[];
  /** Modelled, one per projection year. */
  future: number[];
}

export interface ProjectionChartProps {
  historyYears: number[];
  projectionYears: number[];
  series: StackSeries[];
  band: Band | null;
  unit: string;
  caption?: React.ReactNode;
  format: (v: number) => string;
}

const MARGIN = { top: 14, right: 16, bottom: 32, left: 62 };

/** Axis ticks on 1, 2 or 5 x 10^n, the steps that read as round numbers. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Spectral, sampled to however many components there are.
 *
 * Diverging rather than sequential on purpose: adjacent bands have to be told
 * apart at a glance, and a sequential ramp of four or five steps does not
 * manage it once the bands are thin.
 */
const SPECTRAL = [
  '#3288BD', '#5AA3C4', '#80BFA9', '#A6D96A', '#D9E86E',
  '#FEE08B', '#FDAE61', '#F4794A', '#D53E4F',
];
export function spectral(i: number, n: number): string {
  if (n <= 1) return SPECTRAL[0];
  const t = (i / (n - 1)) * (SPECTRAL.length - 1);
  return SPECTRAL[Math.round(t)];
}

export default function ProjectionChart({
  historyYears,
  projectionYears,
  series,
  band,
  unit,
  caption,
  format,
}: ProjectionChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 760, h: 400 });
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(80, size.w - MARGIN.left - MARGIN.right);
  const innerH = Math.max(80, size.h - MARGIN.top - MARGIN.bottom);

  const x0 = historyYears[0] ?? 1970;
  const x1 = projectionYears[projectionYears.length - 1] ?? 2060;
  const xScale = (year: number) => MARGIN.left + ((year - x0) / (x1 - x0)) * innerW;

  // Cumulative edges. A history year is drawn only where every component has a
  // value, so a measure that cannot be formed early on simply starts later.
  const pastOk = historyYears.map((_, i) => series.every((s) => {
    const v = s.past[i];
    return v != null && Number.isFinite(v);
  }));
  const pastEdges: number[][] = [];
  const futureEdges: number[][] = [];
  for (let k = 0; k <= series.length; k++) {
    pastEdges.push(historyYears.map((_, i) => {
      let acc = 0;
      for (let j = 0; j < k; j++) acc += (series[j].past[i] as number) ?? 0;
      return acc;
    }));
    futureEdges.push(projectionYears.map((_, i) => {
      let acc = 0;
      for (let j = 0; j < k; j++) acc += series[j].future[i] ?? 0;
      return acc;
    }));
  }

  let hi = 0;
  let lo = 0;
  for (let i = 0; i < historyYears.length; i++) {
    if (!pastOk[i]) continue;
    for (let k = 0; k <= series.length; k++) {
      hi = Math.max(hi, pastEdges[k][i]);
      lo = Math.min(lo, pastEdges[k][i]);
    }
  }
  for (let i = 0; i < projectionYears.length; i++) {
    for (let k = 0; k <= series.length; k++) {
      hi = Math.max(hi, futureEdges[k][i]);
      lo = Math.min(lo, futureEdges[k][i]);
    }
  }
  // The 5th-95th of the paper's runs, not their full range: the extremes are a
  // handful of runs and they push the axis far enough to flatten everything.
  if (band) for (const v of band.p95) hi = Math.max(hi, v);
  if (band) for (const v of band.p05) lo = Math.min(lo, v);
  const top = hi > 0 ? hi * 1.06 : 1;
  const bottom = lo < 0 ? lo * 1.08 : 0;
  const yScale = (v: number) => MARGIN.top + innerH - ((v - bottom) / (top - bottom)) * innerH;

  // The last drawn history year, which the projection's areas start from so the
  // stack is continuous across the seam.
  let lastPast = -1;
  for (let i = 0; i < historyYears.length; i++) if (pastOk[i]) lastPast = i;

  /** One component's area: its lower edge out, its upper edge back. */
  const area = (k: number, which: 'past' | 'future') => {
    const edges = which === 'past' ? pastEdges : futureEdges;
    const years = which === 'past' ? historyYears : projectionYears;
    const idx: number[] = [];
    if (which === 'past') {
      for (let i = 0; i < years.length; i++) if (pastOk[i]) idx.push(i);
    } else {
      for (let i = 0; i < years.length; i++) idx.push(i);
    }
    if (idx.length < 2 && !(which === 'future' && lastPast >= 0)) return '';
    const pts: [number, number][] = [];
    // Join the seam: the projection opens at the last measured point.
    const seamLo = which === 'future' && lastPast >= 0 ? pastEdges[k][lastPast] : null;
    const seamHi = which === 'future' && lastPast >= 0 ? pastEdges[k + 1][lastPast] : null;
    if (seamLo != null) pts.push([historyYears[lastPast], seamLo]);
    for (const i of idx) pts.push([years[i], edges[k][i]]);
    // The upper edge in the SAME left-to-right order, so that walking it
    // backwards closes the ring at the seam rather than across the figure.
    const back: [number, number][] = [];
    if (seamHi != null) back.push([historyYears[lastPast], seamHi]);
    for (const i of idx) back.push([years[i], edges[k + 1][i]]);
    let d = '';
    pts.forEach(([yr, v], j) => { d += `${j ? 'L' : 'M'}${xScale(yr).toFixed(2)},${yScale(v).toFixed(2)}`; });
    for (let j = back.length - 1; j >= 0; j--) {
      d += `L${xScale(back[j][0]).toFixed(2)},${yScale(back[j][1]).toFixed(2)}`;
    }
    return `${d}Z`;
  };

  /** The top edge of a component, for the line that keeps thin bands legible. */
  const edgeLine = (k: number, which: 'past' | 'future') => {
    const edges = which === 'past' ? pastEdges : futureEdges;
    const years = which === 'past' ? historyYears : projectionYears;
    let d = '';
    let open = false;
    if (which === 'future' && lastPast >= 0) {
      d += `M${xScale(historyYears[lastPast]).toFixed(2)},${yScale(pastEdges[k][lastPast]).toFixed(2)}`;
      open = true;
    }
    for (let i = 0; i < years.length; i++) {
      if (which === 'past' && !pastOk[i]) { open = false; continue; }
      d += `${open ? 'L' : 'M'}${xScale(years[i]).toFixed(2)},${yScale(edges[k][i]).toFixed(2)}`;
      open = true;
    }
    return d;
  };

  const line = (years: number[], values: number[]) => {
    let d = '';
    for (let i = 0; i < years.length; i++) {
      if (!Number.isFinite(values[i])) continue;
      d += `${i ? 'L' : 'M'}${xScale(years[i]).toFixed(2)},${yScale(values[i]).toFixed(2)}`;
    }
    return d;
  };

  const yTicks = niceTicks(bottom, top, 5);
  const xTicks = [1970, 1980, 1990, 2000, 2010, 2020, 2030, 2040, 2050, 2060].filter(
    (y) => y >= x0 && y <= x1,
  );

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
    setHoverYear(Math.round(x0 + frac * (x1 - x0)));
  };

  // What the key shows: the hovered year, or 2060 when nothing is hovered.
  const readYear = hoverYear ?? projectionYears[projectionYears.length - 1];
  const hIdx = historyYears.indexOf(readYear);
  const pIdx = projectionYears.indexOf(readYear);
  const valueAt = (s: StackSeries): number | null =>
    pIdx >= 0 ? s.future[pIdx] : hIdx >= 0 && pastOk[hIdx] ? (s.past[hIdx] as number) : null;
  const totalAt = pIdx >= 0
    ? futureEdges[series.length][pIdx]
    : hIdx >= 0 && pastOk[hIdx] ? pastEdges[series.length][hIdx] : null;
  const medAt = pIdx >= 0 && band ? band.p50[pIdx] : null;

  return (
    <figure className="mat-chart" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div ref={host} className="mat-chart-frame" style={{ flex: '1 1 auto', minHeight: 200, position: 'relative' }}>
        <svg
          className="mat-chart-svg"
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          role="img"
          aria-label={`Material use by material, measured to 2024 and modelled to 2060, in ${unit}`}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + innerW} y1={yScale(t)} y2={yScale(t)}
                stroke="var(--rule)" strokeWidth={t === 0 ? 1.2 : 0.6} />
              <text x={MARGIN.left - 8} y={yScale(t)} textAnchor="end" dominantBaseline="middle"
                style={{ font: '400 10.5px var(--font-mono)', fill: 'var(--ink-3)' }}>
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={xScale(t)} y={MARGIN.top + innerH + 15} textAnchor="middle"
              style={{ font: '400 10.5px var(--font-mono)', fill: 'var(--ink-3)' }}>
              {t}
            </text>
          ))}

          {/* Measured: full strength. */}
          {series.map((s, k) => (
            <path key={`p${s.key}`} d={area(k, 'past')} fill={s.color} fillOpacity={0.95} />
          ))}
          {/* Modelled: the same colours, lightened, so the change of basis is
              visible without reading anything. */}
          {series.map((s, k) => (
            <path key={`f${s.key}`} d={area(k, 'future')} fill={s.color} fillOpacity={0.42} />
          ))}
          {series.map((s, k) => (
            <path key={`e${s.key}`} d={edgeLine(k + 1, 'future')} fill="none" stroke={s.color}
              strokeWidth={0.9} opacity={0.9} />
          ))}

          {/* The paper's own spread for this total, over the top. */}
          {band && (
            <>
              <path d={line(projectionYears, band.p05)} fill="none" stroke="var(--ink)" strokeWidth={1}
                strokeDasharray="5 4" opacity={0.55} />
              <path d={line(projectionYears, band.p95)} fill="none" stroke="var(--ink)" strokeWidth={1}
                strokeDasharray="5 4" opacity={0.55} />
              <path d={line(projectionYears, band.p50)} fill="none" stroke="var(--ink)" strokeWidth={1.1}
                strokeDasharray="1.5 3" opacity={0.7} />
            </>
          )}

          {/* Total, drawn over everything: the number the page argues about. */}
          <path d={edgeLine(series.length, 'past')} fill="none" stroke="var(--ink)" strokeWidth={1.6} />
          <path d={edgeLine(series.length, 'future')} fill="none" stroke="var(--ink)" strokeWidth={1.6}
            opacity={0.75} />

          {/* 2024/2025 seam: everything left of it is measured. */}
          <line x1={xScale(2024.5)} x2={xScale(2024.5)} y1={MARGIN.top} y2={MARGIN.top + innerH}
            stroke="var(--rule-strong)" strokeWidth={0.8} strokeDasharray="2 3" />

          {hoverYear != null && (
            <line x1={xScale(hoverYear)} x2={xScale(hoverYear)} y1={MARGIN.top} y2={MARGIN.top + innerH}
              stroke="var(--ink)" strokeWidth={0.7} opacity={0.4} />
          )}

          <rect x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHoverYear(null)}
            style={{ cursor: 'crosshair' }} />
        </svg>
      </div>

      <div className="mat-chart-key">
        <span className="mat-key-year">{readYear}{hoverYear == null ? '' : ' ·'}</span>
        {[...series].reverse().map((s) => {
          const v = valueAt(s);
          return (
            <span key={s.key} className="mat-key-item">
              <span className="mat-key-swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
              <b>{v == null ? '—' : format(v)}</b>
            </span>
          );
        })}
        {series.length > 1 && (
          <span className="mat-key-item">
            <span className="mat-key-swatch mat-key-rule" aria-hidden="true" />
            Total<b>{totalAt == null ? '—' : format(totalAt)}</b>
          </span>
        )}
        {band && (
          <span className="mat-key-item">
            <span className="mat-key-swatch mat-key-dash" aria-hidden="true" />
            Paper’s 1,000 runs: median{medAt == null ? '' : ' '}
            <b>{medAt == null ? '—' : format(medAt)}</b>, and 5th–95th
          </span>
        )}
        <span className="mat-key-unit">{unit}</span>
      </div>

      {caption && (
        <figcaption style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-2)', marginTop: 8 }}>
          {caption}
        </figcaption>
      )}

      <style>{`
        /* The frame's own size rules live here rather than in a shared sheet, so
           this chart fills its pane whether or not any other chart is mounted. */
        .mat-chart-frame { width: 100%; height: 100%; }
        .mat-chart-svg { width: 100%; height: 100%; display: block; }
        .mat-chart-key { display: flex; flex-wrap: wrap; gap: 3px 14px; align-items: center;
                         margin-top: 7px; font-size: 11px; color: var(--ink-2); }
        .mat-key-year { font: 500 11px var(--font-mono); color: var(--ink-3); }
        .mat-key-item { display: inline-flex; align-items: center; gap: 5px; }
        .mat-key-item b { font: 500 11px var(--font-mono); color: var(--ink); }
        .mat-key-swatch { width: 11px; height: 11px; border-radius: 2px; flex: none; }
        .mat-key-rule { height: 2px; border-radius: 0; background: var(--ink); }
        .mat-key-dash { height: 0; border-top: 1px dashed var(--ink); border-radius: 0;
                        background: none; opacity: 0.7; }
        .mat-key-unit { margin-left: auto; font: 400 11px var(--font-mono); color: var(--ink-3); }
      `}</style>
    </figure>
  );
}
