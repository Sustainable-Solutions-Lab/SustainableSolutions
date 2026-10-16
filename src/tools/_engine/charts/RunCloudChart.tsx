import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import type { RunPoint, RunsData } from '../data/derive';
import Tooltip from '../ui/Tooltip';

// One dot per Monte Carlo run: the GDP growth it was drawn with against the
// material growth it produced. The point of the view is the shape of the
// cloud, not any single run — how tightly material growth tracks GDP growth,
// and how few runs escape below zero.
//
// Three reference lines carry the reading:
//   y = 0   consumption falls outright below it (absolute decoupling)
//   y = x   material intensity is flat along it; below it is relative decoupling
//   fit     the regression through the cloud, and the 1σ band that defines
//           which runs are doing better than their own growth implies

type Props = {
  data: RunsData;
};

const MARGIN = { top: 16, right: 24, bottom: 56, left: 64 };
const HOVER_RADIUS = 18;

type Placed = RunPoint & { px: number; py: number; color: string; group: string };

export default function RunCloudChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [hover, setHover] = useState<{ run: Placed; mouseX: number; mouseY: number } | null>(null);

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

  const { xScale, yScale, xTicks, yTicks, placed, rampScale } = useMemo(() => {
    const all = data.groups.flatMap((g) => g.runs);
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of all) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    // Pad a little, and always keep zero in view on y — the whole question is
    // which runs get below it.
    const xPad = (xMax - xMin) * 0.05 || 0.1;
    const yPad = (yMax - yMin) * 0.05 || 0.1;
    const xScale = scaleLinear().domain([xMin - xPad, xMax + xPad]).range([0, innerW]).nice();
    const yScale = scaleLinear()
      .domain([Math.min(0, yMin - yPad), yMax + yPad])
      .range([innerH, 0])
      .nice();

    const rampScale = data.ramp
      ? scaleLinear<string>()
          .domain(
            data.ramp.stops.map(
              (_, i) =>
                data.ramp!.min +
                ((data.ramp!.max - data.ramp!.min) * i) / (data.ramp!.stops.length - 1),
            ),
          )
          .range(data.ramp.stops)
          .clamp(true)
      : null;

    const placed: Placed[] = [];
    for (const g of data.groups) {
      for (const p of g.runs) {
        const color =
          rampScale && p.t2060 != null ? rampScale(p.t2060) : g.color;
        placed.push({ ...p, px: xScale(p.x), py: yScale(p.y), color, group: g.label });
      }
    }

    return {
      xScale,
      yScale,
      xTicks: xScale.ticks(Math.min(8, Math.floor(innerW / 70))),
      yTicks: yScale.ticks(6),
      placed,
      rampScale,
    };
  }, [data, innerW, innerH]);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const frame = ref.current?.getBoundingClientRect();
    if (!frame) return;
    const mx = e.clientX - frame.left - MARGIN.left;
    const my = e.clientY - frame.top - MARGIN.top;
    let best: Placed | null = null;
    let bestDist = HOVER_RADIUS * HOVER_RADIUS;
    for (const p of placed) {
      const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    setHover(
      best ? { run: best, mouseX: e.clientX - frame.left, mouseY: e.clientY - frame.top } : null,
    );
  };

  const fit = data.fit;
  const xDomain = xScale.domain() as [number, number];
  const fitAt = (x: number) => (fit ? fit.slope * x + fit.intercept : 0);
  // The 1σ line is only explanatory when it is what the colours mean.
  const showThreshold = fit != null && data.colorBy === 'selected';

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${yScale(t)})`}>
              <line x1={0} x2={innerW} className="chart-gridline" />
              <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">{fmtPct(t)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={t} transform={`translate(${xScale(t)},${innerH})`}>
              <line y1={0} y2={4} className="chart-axis-line" />
              <text y={16} textAnchor="middle" className="chart-tick">{fmtPct(t)}</text>
            </g>
          ))}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="chart-axis-line" />
          <line x1={0} x2={0} y1={0} y2={innerH} className="chart-axis-line" />

          <text x={innerW / 2} y={innerH + 42} textAnchor="middle" className="chart-axis-label">
            {data.xLabel} ({data.units})
          </text>
          <text
            transform={`translate(${-MARGIN.left + 16},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="chart-axis-label"
          >
            {data.yLabel} ({data.units})
          </text>

          {/* 1:1 — material use grows exactly as fast as GDP */}
          <line
            x1={xScale(xDomain[0])}
            y1={yScale(xDomain[0])}
            x2={xScale(xDomain[1])}
            y2={yScale(xDomain[1])}
            className="run-ref-faint"
          />
          <text
            x={xScale(Math.min(xDomain[1], yScale.domain()[1])) - 4}
            y={yScale(Math.min(xDomain[1], yScale.domain()[1])) - 5}
            textAnchor="end"
            className="run-ref-label"
          >
            1:1
          </text>

          {/* the regression through the cloud, and the selection threshold */}
          {fit && (
            <>
              <line
                x1={xScale(xDomain[0])}
                y1={yScale(fitAt(xDomain[0]))}
                x2={xScale(xDomain[1])}
                y2={yScale(fitAt(xDomain[1]))}
                className="run-ref-fit"
              />
              {showThreshold && (
                <line
                  x1={xScale(xDomain[0])}
                  y1={yScale(fitAt(xDomain[0]) - fit.seMult * fit.residSigma)}
                  x2={xScale(xDomain[1])}
                  y2={yScale(fitAt(xDomain[1]) - fit.seMult * fit.residSigma)}
                  className="run-ref-threshold"
                />
              )}
            </>
          )}

          {/* zero — consumption falls outright below this line */}
          <line x1={0} x2={innerW} y1={yScale(0)} y2={yScale(0)} className="run-ref-zero" />
          <text x={innerW - 4} y={yScale(0) - 5} textAnchor="end" className="run-ref-label">
            no growth
          </text>

          {/* runs: plain groups first, emphasised ones last so six in a
              thousand are still visible */}
          {data.groups.map((g) => (
            <g key={g.key}>
              {g.runs.map((p) => {
                const color = rampScale && p.t2060 != null ? rampScale(p.t2060) : g.color;
                return (
                  <circle
                    key={p.id}
                    cx={xScale(p.x)}
                    cy={yScale(p.y)}
                    r={g.emphasis ? 4 : 2.4}
                    fill={color}
                    fillOpacity={g.emphasis ? 0.95 : 0.5}
                    stroke={g.emphasis ? 'var(--paper-2)' : 'none'}
                    strokeWidth={g.emphasis ? 1 : 0}
                  />
                );
              })}
            </g>
          ))}

          {hover && (
            <circle
              cx={hover.run.px}
              cy={hover.run.py}
              r={6}
              fill="none"
              stroke={hover.run.color}
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}

          <Key data={data} rampScale={rampScale} showThreshold={showThreshold} />

          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </g>
      </svg>
      {hover && (
        <Tooltip visible x={hover.mouseX} y={hover.mouseY}>
          <div className="tt-title">
            <span className="tt-swatch" style={{ background: hover.run.color }} />
            Run {hover.run.id} · {hover.run.ssp}
          </div>
          <div className="tt-row">
            <span>Material growth</span>
            <span>{hover.run.y.toFixed(2)} %/yr</span>
          </div>
          <div className="tt-row">
            <span>GDP growth</span>
            <span>{hover.run.x.toFixed(2)} %/yr</span>
          </div>
          {hover.run.t2060 != null && (
            <div className="tt-row">
              <span>Warming in 2060</span>
              <span>{hover.run.t2060.toFixed(2)} °C</span>
            </div>
          )}
          {hover.run.fossilIndex != null && (
            <div className="tt-row">
              <span>Fossil use vs 2024</span>
              <span>{hover.run.fossilIndex.toFixed(2)}×</span>
            </div>
          )}
          <div className="tt-row">
            <span>Beats its own growth</span>
            <span>{hover.run.selected ? 'yes' : 'no'}</span>
          </div>
        </Tooltip>
      )}
      <style>{styles}</style>
    </div>
  );
}

// Legend sits inside the plot: the cloud runs up the diagonal, so the
// top-left corner is always empty.
function Key({
  data,
  rampScale,
  showThreshold,
}: {
  data: RunsData;
  rampScale: ((v: number) => string) | null;
  showThreshold: boolean;
}) {
  const rows: { label: string; color: string; kind: 'dot' | 'line' | 'dash' }[] = [];
  if (!data.ramp) {
    for (const g of data.groups) {
      rows.push({ label: `${g.label} (${g.runs.length})`, color: g.color, kind: 'dot' });
    }
  }
  if (data.fit) rows.push({ label: 'regression', color: 'var(--ink-2)', kind: 'line' });
  if (showThreshold) rows.push({ label: '1σ below', color: 'var(--ink-3)', kind: 'dash' });

  return (
    <g transform="translate(8,6)">
      {data.ramp && rampScale && (
        <g>
          <defs>
            <linearGradient id="run-ramp" x1="0" x2="1">
              {data.ramp.stops.map((c, i) => (
                <stop key={c} offset={`${(i / (data.ramp!.stops.length - 1)) * 100}%`} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={110} height={8} fill="url(#run-ramp)" />
          <text x={0} y={20} className="run-key-text">{data.ramp.min.toFixed(1)}</text>
          <text x={110} y={20} textAnchor="end" className="run-key-text">
            {data.ramp.max.toFixed(1)}
          </text>
          <text x={0} y={-4} className="run-key-text">{data.ramp.label}</text>
        </g>
      )}
      {rows.map((r, i) => {
        const y = (data.ramp ? 34 : 6) + i * 14;
        return (
          <g key={r.label}>
            {r.kind === 'dot' ? (
              <circle cx={5} cy={y} r={3.5} fill={r.color} fillOpacity={0.85} />
            ) : (
              <line
                x1={0}
                x2={10}
                y1={y}
                y2={y}
                stroke={r.color}
                strokeWidth={1.5}
                strokeDasharray={r.kind === 'dash' ? '4 3' : undefined}
              />
            )}
            <text x={16} y={y} dy="0.32em" className="run-key-text">{r.label}</text>
          </g>
        );
      })}
    </g>
  );
}

function fmtPct(v: number): string {
  return v === 0 ? '0' : v.toFixed(1);
}

const styles = `
  /* .chart-frame sizing lives in ChartFrame's own style block, which only
     mounts for the line/area/bar charts — so it is restated here. */
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
  .chart-axis-line { stroke: var(--ink-3); stroke-width: 1; shape-rendering: crispEdges; }
  .chart-tick {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 9px;
    fill: var(--ink-3);
  }
  .chart-axis-label {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
    fill: var(--ink-2);
  }
  .run-ref-zero { stroke: var(--ink-2); stroke-width: 1.25; shape-rendering: crispEdges; }
  .run-ref-faint { stroke: var(--ink-4, #9A9AB0); stroke-width: 1; stroke-dasharray: 2 4; }
  .run-ref-fit { stroke: var(--ink-2); stroke-width: 1.5; }
  .run-ref-threshold { stroke: var(--ink-3); stroke-width: 1.25; stroke-dasharray: 4 3; }
  .run-ref-label {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 9px;
    fill: var(--ink-3);
    letter-spacing: 0.04em;
  }
  .run-key-text {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 9.5px;
    fill: var(--ink-2);
  }
`;
