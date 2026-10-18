import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import type { LeversData } from '../data/derive';
import Tooltip from '../ui/Tooltip';

// What each lever is worth. Bars run right for levers that raise material
// growth and left for levers that lower it, with the 95% confidence interval
// as a whisker.
//
// The deltas are deliberately NOT uniform — a tenth of a kg/USD of wood
// intensity is not comparable to twenty years of building lifetime — so each
// row prints its own delta and the bars must be read per row, never ranked
// against each other as if they shared a scale.

type Props = {
  data: LeversData;
};

const MARGIN = { top: 14, right: 104, bottom: 48, left: 168 };
// Below this the group sub-label is dropped rather than allowed to collide.
const ROW_LABEL_MIN = 20;

export default function TornadoChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [hover, setHover] = useState<{ i: number; mouseX: number; mouseY: number } | null>(null);

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

  const innerW = Math.max(120, size.w - MARGIN.left - MARGIN.right);
  // Rows divide the frame rather than setting their own height: a taller-than-
  // frame svg would scroll, and the scrollbar then feeds back into the
  // ResizeObserver and pins the chart at its initial width.
  const innerH = Math.max(80, size.h - MARGIN.top - MARGIN.bottom);
  const rowH = innerH / Math.max(1, data.bars.length);

  const { xScale, xTicks } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const b of data.bars) {
      lo = Math.min(lo, b.lo, b.effect);
      hi = Math.max(hi, b.hi, b.effect);
    }
    const pad = (hi - lo) * 0.04 || 0.1;
    const xScale = scaleLinear().domain([lo - pad, hi + pad]).range([0, innerW]).nice();
    return { xScale, xTicks: xScale.ticks(Math.min(7, Math.floor(innerW / 60))) };
  }, [data, innerW]);

  const zero = xScale(0);

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {xTicks.map((t) => (
            <g key={t} transform={`translate(${xScale(t)},0)`}>
              <line y1={0} y2={innerH} className="chart-gridline" />
              <text y={innerH + 16} textAnchor="middle" className="chart-tick">{t}</text>
            </g>
          ))}
          <line x1={zero} x2={zero} y1={0} y2={innerH} className="lever-zero" />
          <text x={innerW / 2} y={innerH + 38} textAnchor="middle" className="chart-axis-label">
            Effect on material growth ({data.units})
          </text>

          {data.bars.map((b, i) => {
            const y = i * rowH;
            const cy = y + rowH / 2;
            const x0 = Math.min(zero, xScale(b.effect));
            const w = Math.abs(xScale(b.effect) - zero);
            const negative = b.effect < 0;
            return (
              <g
                key={`${b.order}-${b.label}`}
                onMouseMove={(e) => {
                  const frame = ref.current?.getBoundingClientRect();
                  setHover({
                    i,
                    mouseX: e.clientX - (frame?.left ?? 0),
                    mouseY: e.clientY - (frame?.top ?? 0),
                  });
                }}
                onMouseLeave={() => setHover(null)}
              >
                <rect x={-MARGIN.left} y={y} width={size.w} height={rowH} fill="transparent" />
                {/* delimit each family block, so a group label clearly heads
                    its own rows rather than floating between two */}
                {i > 0 && b.group !== data.bars[i - 1]?.group && (
                  <line x1={-MARGIN.left + 8} x2={innerW} y1={y} y2={y} className="lever-divider" />
                )}
                {/* row label: the lever, with the group it belongs to */}
                <text x={-10} y={cy - 4} dy="0.32em" textAnchor="end" className="lever-label">
                  {b.label}
                </text>
                {rowH >= ROW_LABEL_MIN && b.group !== data.bars[i - 1]?.group && (
                  <text x={-10} y={cy + 7} dy="0.32em" textAnchor="end" className="lever-group">
                    {b.group}
                  </text>
                )}
                <rect
                  x={x0}
                  y={cy - Math.min(8, rowH * 0.3)}
                  width={Math.max(1, w)}
                  height={Math.min(16, rowH * 0.6)}
                  fill={b.color}
                  fillOpacity={b.significant ? 0.85 : 0.35}
                />
                <line
                  x1={xScale(b.lo)}
                  x2={xScale(b.hi)}
                  y1={cy}
                  y2={cy}
                  stroke="var(--ink-2)"
                  strokeWidth={1}
                />
                {[b.lo, b.hi].map((v) => (
                  <line
                    key={v}
                    x1={xScale(v)}
                    x2={xScale(v)}
                    y1={cy - 3}
                    y2={cy + 3}
                    stroke="var(--ink-2)"
                    strokeWidth={1}
                  />
                ))}
                {/* the change this bar is the effect OF */}
                <text
                  x={negative ? xScale(b.lo) - 6 : xScale(b.hi) + 6}
                  y={cy}
                  dy="0.32em"
                  textAnchor={negative ? 'end' : 'start'}
                  className="lever-delta"
                >
                  {b.delta}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {hover != null && data.bars[hover.i] && (
        <Tooltip visible x={hover.mouseX} y={hover.mouseY}>
          <div className="tt-title">
            <span className="tt-swatch" style={{ background: data.bars[hover.i].color }} />
            {data.bars[hover.i].label} · {data.bars[hover.i].group}
          </div>
          <div className="tt-row">
            <span>Change applied</span>
            <span>{data.bars[hover.i].delta}</span>
          </div>
          <div className="tt-row">
            <span>Effect</span>
            <span>
              {data.bars[hover.i].effect > 0 ? '+' : ''}
              {data.bars[hover.i].effect.toFixed(3)} {data.units}
            </span>
          </div>
          <div className="tt-row">
            <span>95% CI</span>
            <span>
              {data.bars[hover.i].lo.toFixed(3)} to {data.bars[hover.i].hi.toFixed(3)}
            </span>
          </div>
          <div className="tt-row">
            <span>Family</span>
            <span>{data.bars[hover.i].family}</span>
          </div>
          {!data.bars[hover.i].significant && (
            <div className="tt-row">
              <span>Not distinguishable from zero</span>
              <span />
            </div>
          )}
        </Tooltip>
      )}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  /* As in RunCloudChart: ChartFrame owns these rules but only mounts for the
     time-series charts. */
  .chart-frame {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .chart-svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .chart-gridline { stroke: var(--rule); stroke-width: 1; shape-rendering: crispEdges; }
  .chart-tick {
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 9px;
    fill: var(--ink-3);
  }
  .chart-axis-label {
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 12px;
    fill: var(--ink-2);
  }
  .lever-divider {
    stroke: var(--rule);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .lever-zero { stroke: var(--ink-2); stroke-width: 1.25; shape-rendering: crispEdges; }
  .lever-label {
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    font-size: 10.5px;
    fill: var(--ink-2);
  }
  .lever-group {
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 8px;
    fill: var(--ink-3);
  }
  .lever-delta {
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 8.5px;
    fill: var(--ink-3);
  }
`;
