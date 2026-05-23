import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import type { DerivedData } from '../data/derive';

// Shared wrapper for line / area / bar charts. Handles responsive sizing,
// margins, x/y scales, axes, and the y-units label. Children render the
// series-specific marks in the inner plot region via a render prop.

type Props = {
  data: DerivedData;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  /** If provided, overrides the auto-computed y domain. Useful for stacked charts. */
  yDomain?: [number, number];
  /** Force y axis to start at zero (default true). */
  zeroBased?: boolean;
  children: (ctx: {
    xScale: ScaleLinear<number, number>;
    yScale: ScaleLinear<number, number>;
    innerWidth: number;
    innerHeight: number;
  }) => React.ReactNode;
};

const DEFAULT_MARGIN = { top: 12, right: 16, bottom: 28, left: 56 };

export default function ChartFrame({
  data,
  height = 480,
  margin = DEFAULT_MARGIN,
  yDomain,
  zeroBased = true,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.floor(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerWidth = Math.max(80, width - margin.left - margin.right);
  const innerHeight = Math.max(80, height - margin.top - margin.bottom);

  const xScale = useMemo(() => {
    const years = data.years;
    return scaleLinear()
      .domain([years[0] ?? 0, years[years.length - 1] ?? 1])
      .range([0, innerWidth]);
  }, [data.years, innerWidth]);

  const yScale = useMemo(() => {
    if (yDomain) return scaleLinear().domain(yDomain).range([innerHeight, 0]).nice();
    let min = 0;
    let max = 0;
    for (const s of data.series) {
      for (const p of s.points) {
        if (p.value == null) continue;
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      }
    }
    const lo = zeroBased ? Math.min(0, min) : min;
    const hi = max === 0 ? 1 : max;
    return scaleLinear().domain([lo, hi]).range([innerHeight, 0]).nice();
  }, [data.series, innerHeight, yDomain, zeroBased]);

  const xTicks = useMemo(() => xScale.ticks(Math.min(8, Math.floor(innerWidth / 80))), [xScale, innerWidth]);
  const yTicks = useMemo(() => yScale.ticks(5), [yScale]);

  return (
    <div className="chart-frame" ref={containerRef}>
      <svg width={width} height={height} className="chart-svg" role="img">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Y gridlines + ticks */}
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${yScale(t)})`}>
              <line x1={0} x2={innerWidth} className="chart-gridline" />
              <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
                {formatTick(t)}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTicks.map((t) => (
            <g key={t} transform={`translate(${xScale(t)},${innerHeight})`}>
              <line y1={0} y2={4} className="chart-axis-line" />
              <text y={16} textAnchor="middle" className="chart-tick">
                {Math.round(t)}
              </text>
            </g>
          ))}

          {/* X / Y axis baselines */}
          <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} className="chart-axis-line" />
          <line x1={0} x2={0} y1={0} y2={innerHeight} className="chart-axis-line" />

          {/* Y units label */}
          <text x={-margin.left + 4} y={-4} className="chart-y-units">
            {data.units}
          </text>

          {children({ xScale, yScale, innerWidth, innerHeight })}
        </g>
      </svg>
      <style>{frameStyles}</style>
    </div>
  );
}

// Tick formatter — large values get k/M suffixes; smaller get fixed precision.
function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  if (abs >= 10) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  if (abs === 0) return '0';
  return v.toPrecision(2);
}

const frameStyles = `
  .chart-frame {
    width: 100%;
    overflow: hidden;
  }
  .chart-svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .chart-gridline {
    stroke: var(--rule);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .chart-axis-line {
    stroke: var(--ink-3);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .chart-tick {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    fill: var(--ink-3);
  }
  .chart-y-units {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.04em;
    fill: var(--ink-3);
  }
`;
