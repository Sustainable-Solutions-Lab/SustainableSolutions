import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line as d3Line } from 'd3-shape';
import type { ScatterData, ScatterPoint } from '../data/derive';

// Phase plot: each series is a trajectory through (x, y) measure space
// over the year range. Connecting lines show direction of motion; small
// dots mark each year, with a larger dot at the most recent year to
// anchor the eye.

type Props = {
  data: ScatterData;
};

const MARGIN = { top: 12, right: 16, bottom: 36, left: 64 };

export default function ScatterChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        const h = Math.floor(e.contentRect.height);
        if (w > 0 && h > 0) setSize({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(80, size.w - MARGIN.left - MARGIN.right);
  const innerH = Math.max(80, size.h - MARGIN.top - MARGIN.bottom);

  const { xScale, yScale, xTicks, yTicks } = useMemo(() => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of data.series) {
      for (const p of s.points) {
        if (p.x != null) {
          if (p.x < xMin) xMin = p.x;
          if (p.x > xMax) xMax = p.x;
        }
        if (p.y != null) {
          if (p.y < yMin) yMin = p.y;
          if (p.y > yMax) yMax = p.y;
        }
      }
    }
    if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; }
    if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }

    const xScale = scaleLinear().domain([Math.min(0, xMin), xMax]).range([0, innerW]).nice();
    const yScale = scaleLinear().domain([Math.min(0, yMin), yMax]).range([innerH, 0]).nice();
    return {
      xScale,
      yScale,
      xTicks: xScale.ticks(Math.min(8, Math.floor(innerW / 80))),
      yTicks: yScale.ticks(5),
    };
  }, [data, innerW, innerH]);

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* y gridlines + tick labels */}
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${yScale(t)})`}>
              <line x1={0} x2={innerW} className="chart-gridline" />
              <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">{formatTick(t)}</text>
            </g>
          ))}
          {/* x ticks */}
          {xTicks.map((t) => (
            <g key={t} transform={`translate(${xScale(t)},${innerH})`}>
              <line y1={0} y2={4} className="chart-axis-line" />
              <text y={16} textAnchor="middle" className="chart-tick">{formatTick(t)}</text>
            </g>
          ))}
          {/* axes */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="chart-axis-line" />
          <line x1={0} x2={0} y1={0} y2={innerH} className="chart-axis-line" />

          {/* axis labels */}
          <text x={innerW / 2} y={innerH + 28} textAnchor="middle" className="chart-axis-label">
            {data.xLabel} ({data.xUnits})
          </text>
          <text
            transform={`translate(${-MARGIN.left + 16},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="chart-axis-label"
          >
            {data.yLabel} ({data.yUnits})
          </text>

          {/* trajectories */}
          {data.series.map((s) => {
            const validPts = s.points.filter((p) => p.x != null && p.y != null) as Array<
              ScatterPoint & { x: number; y: number }
            >;
            const path = d3Line<{ x: number; y: number }>()
              .x((p) => xScale(p.x))
              .y((p) => yScale(p.y))(validPts);
            const lastPoint = validPts[validPts.length - 1];
            return (
              <g key={s.key}>
                <path d={path ?? ''} fill="none" stroke={s.color} strokeWidth={1.25} opacity={0.6} />
                {validPts.map((p) => (
                  <circle
                    key={p.year}
                    cx={xScale(p.x)}
                    cy={yScale(p.y)}
                    r={1.5}
                    fill={s.color}
                  />
                ))}
                {lastPoint && (
                  <g>
                    <circle cx={xScale(lastPoint.x)} cy={yScale(lastPoint.y)} r={4} fill={s.color} stroke="var(--paper-2)" strokeWidth={1.5} />
                    <text
                      x={xScale(lastPoint.x) + 6}
                      y={yScale(lastPoint.y) - 4}
                      className="chart-scatter-label"
                      style={{ fill: s.color }}
                    >
                      {s.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <style>{styles}</style>
    </div>
  );
}

function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  if (abs >= 10) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  if (abs === 0) return '0';
  return v.toPrecision(2);
}

const styles = `
  .chart-axis-label {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    fill: var(--ink-3);
  }
  .chart-scatter-label {
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    font-size: 10px;
    font-weight: 600;
    pointer-events: none;
  }
`;
