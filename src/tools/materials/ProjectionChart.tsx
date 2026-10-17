/**
 * The tool's one chart: history to 2024, then a projection to 2060.
 *
 * Shaped after Figure 2 of the paper — a measured series running into a band of
 * modelled futures — with one addition the figure cannot have: the line someone
 * has built with the controls, drawn over the paper's own spread so the two can
 * be read against each other.
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

export interface ProjectionChartProps {
  historyYears: number[];
  history: (number | null)[];
  projectionYears: number[];
  scenario: number[];
  band: Band | null;
  unit: string;
  /** Printed under the chart; the place to put a basis caveat. */
  caption?: React.ReactNode;
  /** Label for the scenario line in the key. */
  scenarioLabel: string;
  format: (v: number) => string;
}

const MARGIN = { top: 16, right: 18, bottom: 34, left: 62 };

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

export default function ProjectionChart({
  historyYears,
  history,
  projectionYears,
  scenario,
  band,
  unit,
  caption,
  scenarioLabel,
  format,
}: ProjectionChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 760, h: 420 });
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

  let hi = 0;
  for (const v of history) if (v != null && Number.isFinite(v)) hi = Math.max(hi, v);
  for (const v of scenario) if (Number.isFinite(v)) hi = Math.max(hi, v);
  if (band) for (const v of band.max) hi = Math.max(hi, v);
  let lo = 0;
  for (const v of history) if (v != null && v < lo) lo = v;
  for (const v of scenario) if (v < lo) lo = v;
  if (band) for (const v of band.min) if (v < lo) lo = v;
  const top = hi > 0 ? hi * 1.06 : 1;
  const bottom = lo < 0 ? lo * 1.06 : 0;
  const yScale = (v: number) => MARGIN.top + innerH - ((v - bottom) / (top - bottom)) * innerH;

  const path = (years: number[], values: (number | null)[]) => {
    let d = '';
    let open = false;
    for (let i = 0; i < years.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) {
        open = false;
        continue;
      }
      d += `${open ? 'L' : 'M'}${xScale(years[i]).toFixed(2)},${yScale(v).toFixed(2)}`;
      open = true;
    }
    return d;
  };

  const ribbon = (lower: number[], upper: number[]) => {
    if (lower.length === 0) return '';
    let d = '';
    for (let i = 0; i < projectionYears.length; i++) {
      d += `${i === 0 ? 'M' : 'L'}${xScale(projectionYears[i]).toFixed(2)},${yScale(upper[i]).toFixed(2)}`;
    }
    for (let i = projectionYears.length - 1; i >= 0; i--) {
      d += `L${xScale(projectionYears[i]).toFixed(2)},${yScale(lower[i]).toFixed(2)}`;
    }
    return `${d}Z`;
  };

  const yTicks = niceTicks(bottom, top, 5);
  const xTicks = [1970, 1980, 1990, 2000, 2010, 2020, 2030, 2040, 2050, 2060].filter(
    (y) => y >= x0 && y <= x1,
  );

  // Hover reads the nearest year on either series.
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
    setHoverYear(Math.round(x0 + frac * (x1 - x0)));
  };
  const hi2 = hoverYear == null ? null : hoverYear;
  const histAt = hi2 == null ? null : history[historyYears.indexOf(hi2)] ?? null;
  const projIdx = hi2 == null ? -1 : projectionYears.indexOf(hi2);
  const scenAt = projIdx >= 0 ? scenario[projIdx] : null;
  const medAt = projIdx >= 0 && band ? band.p50[projIdx] : null;

  return (
    <figure className="mat-chart" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div ref={host} className="mat-chart-frame" style={{ flex: '1 1 auto', minHeight: 220, position: 'relative' }}>
        <svg
          className="mat-chart-svg"
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          role="img"
          aria-label={`Material use, history and projection, in ${unit}`}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + innerW}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="var(--rule)"
                strokeWidth={t === 0 ? 1.2 : 0.6}
              />
              <text
                x={MARGIN.left - 8}
                y={yScale(t)}
                textAnchor="end"
                dominantBaseline="middle"
                style={{ font: '400 10.5px var(--font-mono)', fill: 'var(--ink-3)' }}
              >
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={xScale(t)}
              y={MARGIN.top + innerH + 16}
              textAnchor="middle"
              style={{ font: '400 10.5px var(--font-mono)', fill: 'var(--ink-3)' }}
            >
              {t}
            </text>
          ))}

          {band && (
            <>
              <path d={ribbon(band.min, band.max)} fill="var(--ink)" opacity={0.07} />
              <path d={ribbon(band.p05, band.p95)} fill="var(--ink)" opacity={0.1} />
              <path d={ribbon(band.p25, band.p75)} fill="var(--ink)" opacity={0.13} />
              <path
                d={path(projectionYears, band.p50)}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth={1.3}
                strokeDasharray="4 3"
              />
            </>
          )}

          {/* 2024/2025 seam: history is measured, everything right of it is modelled. */}
          <line
            x1={xScale(2024.5)}
            x2={xScale(2024.5)}
            y1={MARGIN.top}
            y2={MARGIN.top + innerH}
            stroke="var(--rule-strong)"
            strokeWidth={0.8}
            strokeDasharray="2 3"
          />

          <path d={path(historyYears, history)} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
          <path d={path(projectionYears, scenario)} fill="none" stroke="var(--cardinal)" strokeWidth={2.4} />

          {hi2 != null && (histAt != null || scenAt != null) && (
            <line
              x1={xScale(hi2)}
              x2={xScale(hi2)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerH}
              stroke="var(--ink)"
              strokeWidth={0.7}
              opacity={0.35}
            />
          )}
          {hi2 != null && scenAt != null && (
            <circle cx={xScale(hi2)} cy={yScale(scenAt)} r={3.5} fill="var(--cardinal)" />
          )}
          {hi2 != null && histAt != null && (
            <circle cx={xScale(hi2)} cy={yScale(histAt)} r={3.5} fill="var(--ink)" />
          )}

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverYear(null)}
            style={{ cursor: 'crosshair' }}
          />
        </svg>
      </div>

      <div
        className="mat-chart-key"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center', marginTop: 6 }}
      >
        <KeyItem swatch={<Rule color="var(--ink)" width={2} />} label="Measured, 1970–2024" />
        <KeyItem swatch={<Rule color="var(--cardinal)" width={2.6} />} label={scenarioLabel} />
        {band && <KeyItem swatch={<Rule color="var(--ink-2)" width={1.4} dashed />} label="Median of the paper’s 1,000 runs" />}
        {band && <KeyItem swatch={<Patch />} label="Their middle half, 5th–95th, and full range" />}
        <span style={{ marginLeft: 'auto', font: '400 11px var(--font-mono)', color: 'var(--ink-3)' }}>
          {hi2 == null
            ? unit
            : `${hi2} · ${scenAt != null ? format(scenAt) : histAt != null ? format(histAt) : '—'}${
                medAt != null ? ` (median ${format(medAt)})` : ''
              } ${unit}`}
        </span>
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
      `}</style>
    </figure>
  );
}

function Rule({ color, width, dashed }: { color: string; width: number; dashed?: boolean }) {
  return (
    <svg width={18} height={6} aria-hidden="true">
      <line
        x1={0}
        x2={18}
        y1={3}
        y2={3}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
    </svg>
  );
}

function Patch() {
  return (
    <svg width={18} height={10} aria-hidden="true">
      <rect x={0} y={0} width={18} height={10} fill="var(--ink)" opacity={0.07} />
      <rect x={0} y={2} width={18} height={6} fill="var(--ink)" opacity={0.1} />
      <rect x={0} y={3.5} width={18} height={3} fill="var(--ink)" opacity={0.13} />
    </svg>
  );
}

function KeyItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-2)' }}>
      {swatch}
      {label}
    </span>
  );
}
