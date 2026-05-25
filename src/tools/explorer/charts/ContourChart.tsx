import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { contours as d3contours } from 'd3-contour';
import { line as d3Line } from 'd3-shape';
import type { ContourData, ContourPoint } from '../data/derive';
import Tooltip from '../ui/Tooltip';

// Two-measure phase plot with an iso-curve heatmap underneath. The
// heatmap field z(x, y) = combineOp(x, y); contour bands fill the plane
// at evenly spaced thresholds, with iso-lines + numeric labels overlaid.
// Observed (x, y) trajectories per geography sit on top, anchored by a
// labeled dot at the most recent year.

type Props = {
  data: ContourData;
};

const MARGIN = { top: 16, right: 72, bottom: 44, left: 72 };
const GRID = 96; // resolution of the contour grid (96x96)
const N_LEVELS = 10; // number of iso-lines

export default function ContourChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [hover, setHover] = useState<{
    series: string;
    color: string;
    point: ContourPoint;
    mouseX: number;
    mouseY: number;
  } | null>(null);

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

  const { xScale, yScale, xTicks, yTicks, isolines } = useMemo(() => {
    // Bounds from observed points.
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of data.series) {
      for (const p of s.points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
    }
    if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; }
    if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }
    // Extend the domain all the way to zero so iso-curves visibly approach
    // both axes — the prior 10% pad cut them off in the lower-left corner.
    const xDom: [number, number] = [0, xMax * 1.1];
    const yDom: [number, number] = [0, yMax * 1.1];

    const xScale = scaleLinear().domain(xDom).range([0, innerW]).nice();
    const yScale = scaleLinear().domain(yDom).range([innerH, 0]).nice();
    const [xDom0, xDom1] = xScale.domain();
    const [yDom0, yDom1] = yScale.domain();

    // Sample z on a GRID×GRID lattice over the (x, y) domain.
    const values = new Float64Array(GRID * GRID);
    const dx = (xDom1 - xDom0) / (GRID - 1);
    const dy = (yDom1 - yDom0) / (GRID - 1);
    let zMax = -Infinity;
    for (let j = 0; j < GRID; j++) {
      const yv = yDom0 + j * dy;
      for (let i = 0; i < GRID; i++) {
        const xv = xDom0 + i * dx;
        // v1 supports only product (x * y) — sum mode is dropped for now
        // since it's only useful when both axes share units.
        const zv = xv * yv;
        values[j * GRID + i] = zv;
        if (zv > zMax) zMax = zv;
      }
    }
    if (!Number.isFinite(zMax) || zMax <= 0) zMax = 1;

    // Logarithmically-spaced thresholds so the lower-end iso-lines
    // (closer to the axes) get representation alongside the higher-z
    // ones in the upper-right.
    const minZ = zMax / 200;
    const thresholds = Array.from({ length: N_LEVELS }, (_, i) => {
      const t = i / (N_LEVELS - 1);
      return minZ * Math.exp(t * Math.log(zMax / minZ));
    });
    const linesRaw = d3contours().size([GRID, GRID]).thresholds(thresholds)(
      Array.from(values),
    );

    // Map grid coords back to screen coords.
    const gridToScreen = (gx: number, gy: number): [number, number] => {
      const xv = xDom0 + (gx / (GRID - 1)) * (xDom1 - xDom0);
      const yv = yDom0 + (gy / (GRID - 1)) * (yDom1 - yDom0);
      return [xScale(xv), yScale(yv)];
    };
    const transformPolygon = (poly: number[][][]): number[][][] =>
      poly.map((ring) => ring.map(([gx, gy]) => gridToScreen(gx, gy)));
    const isolines = linesRaw.map((b) => ({
      value: b.value,
      polygons: b.coordinates.map(transformPolygon),
    }));

    const xTicks = xScale.ticks(Math.min(8, Math.floor(innerW / 80)));
    const yTicks = yScale.ticks(5);
    return { xScale, yScale, xTicks, yTicks, isolines };
  }, [data, innerW, innerH]);

  const linePath = d3Line<{ x: number; y: number }>()
    .x((p) => xScale(p.x))
    .y((p) => yScale(p.y));

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Iso-curves only — no filled heatmap. */}
          <g>
            {isolines.map((iso, i) => (
              <g key={i}>
                <path
                  d={polygonsToPath(iso.polygons)}
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeOpacity={0.55}
                  strokeWidth={0.6}
                />
                {iso.polygons.length > 0 && (
                  <IsoLabel
                    polygons={iso.polygons}
                    label={formatZ(iso.value)}
                    innerW={innerW}
                    innerH={innerH}
                  />
                )}
              </g>
            ))}
          </g>

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

          {/* Observed trajectories */}
          {data.series.map((s) => {
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.key}>
                <path
                  d={linePath(s.points) ?? ''}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.25}
                  opacity={0.55}
                />
                {s.points.map((p: ContourPoint) => (
                  <circle
                    key={`hit-${p.year}`}
                    cx={xScale(p.x)}
                    cy={yScale(p.y)}
                    r={5}
                    fill="transparent"
                    onMouseEnter={(e) => {
                      const frame = ref.current?.getBoundingClientRect();
                      setHover({
                        series: s.label,
                        color: s.color,
                        point: p,
                        mouseX: e.clientX - (frame?.left ?? 0),
                        mouseY: e.clientY - (frame?.top ?? 0),
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
                {s.points.map((p: ContourPoint) => (
                  <circle key={p.year} cx={xScale(p.x)} cy={yScale(p.y)} r={1.5} fill={s.color} pointerEvents="none" />
                ))}
                {last && (
                  <g>
                    <circle
                      cx={xScale(last.x)}
                      cy={yScale(last.y)}
                      r={4}
                      fill={s.color}
                      stroke="var(--paper-2)"
                      strokeWidth={1.5}
                    />
                    <text
                      x={xScale(last.x) + 6}
                      y={yScale(last.y) - 4}
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

          {/* z label corner caption */}
          <text x={innerW - 4} y={-2} textAnchor="end" className="chart-y-units">
            contours: {data.zLabel}
          </text>
        </g>
      </svg>
      {hover && (
        <Tooltip visible x={hover.mouseX} y={hover.mouseY}>
          <div className="tt-title">
            <span className="tt-swatch" style={{ background: hover.color }} />
            {hover.series} · {hover.point.year}
          </div>
          <div className="tt-row">
            <span>X ({data.xUnits})</span>
            <span>{formatVal(hover.point.x)}</span>
          </div>
          <div className="tt-row">
            <span>Y ({data.yUnits})</span>
            <span>{formatVal(hover.point.y)}</span>
          </div>
          <div className="tt-row">
            <span>z = x {data.combineOp === 'product' ? '×' : '+'} y</span>
            <span>
              {formatVal(
                data.combineOp === 'product'
                  ? hover.point.x * hover.point.y
                  : hover.point.x + hover.point.y,
              )}
            </span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

function formatVal(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000) return (v / 1_000).toFixed(2) + 'k';
  if (abs >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}

// d3-contour returns MultiPolygon-style coordinates: outer rings + holes.
// SVG handles holes via even-odd fill of a single path with subpaths.
function polygonsToPath(polygons: number[][][][]): string {
  let path = '';
  for (const poly of polygons) {
    for (const ring of poly) {
      if (ring.length === 0) continue;
      path += `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`;
    }
  }
  return path;
}

// Place a label along the longest segment of an iso-line, biased toward
// the chart center so labels don't crowd the edges.
function IsoLabel({
  polygons,
  label,
  innerW,
  innerH,
}: {
  polygons: number[][][][];
  label: string;
  innerW: number;
  innerH: number;
}) {
  // Find a point reasonably interior to the chart from the iso-line ring.
  let best: { x: number; y: number; dist: number } | null = null;
  const cx = innerW / 2;
  const cy = innerH / 2;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < 4 || x > innerW - 4 || y < 4 || y > innerH - 4) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (!best || d < best.dist) best = { x, y, dist: d };
      }
    }
  }
  if (!best) return null;
  return (
    <text x={best.x} y={best.y} className="chart-tick" style={{ paintOrder: 'stroke', stroke: 'var(--paper)', strokeWidth: 3 }}>
      {label}
    </text>
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

function formatZ(v: number): string {
  return formatTick(v);
}
