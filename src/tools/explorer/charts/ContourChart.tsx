import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import { contours as d3contours } from 'd3-contour';
import { line as d3Line } from 'd3-shape';
import type { ContourData, ContourPoint } from '../data/derive';

// Two-measure phase plot with an iso-curve heatmap underneath. The
// heatmap field z(x, y) = combineOp(x, y); contour bands fill the plane
// at evenly spaced thresholds, with iso-lines + numeric labels overlaid.
// Observed (x, y) trajectories per geography sit on top, anchored by a
// labeled dot at the most recent year.

type Props = {
  data: ContourData;
};

const MARGIN = { top: 16, right: 72, bottom: 44, left: 72 };
const GRID = 80; // resolution of the heatmap grid (80x80)
const N_BANDS = 9; // number of contour bands

export default function ContourChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

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

  const { xScale, yScale, xTicks, yTicks, bands, zMin, zMax } = useMemo(() => {
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
    // Pad bounds so points don't sit on the chart edge and the iso-lines
    // extend visibly past the cloud of points.
    const xPad = (xMax - xMin) * 0.1 || 1;
    const yPad = (yMax - yMin) * 0.1 || 1;
    const xDom: [number, number] = [Math.max(0, xMin - xPad), xMax + xPad];
    const yDom: [number, number] = [Math.max(0, yMin - yPad), yMax + yPad];

    const xScale = scaleLinear().domain(xDom).range([0, innerW]).nice();
    const yScale = scaleLinear().domain(yDom).range([innerH, 0]).nice();
    const [xDom0, xDom1] = xScale.domain();
    const [yDom0, yDom1] = yScale.domain();

    // Sample z on a GRID×GRID lattice over the (x, y) domain.
    const values = new Float64Array(GRID * GRID);
    const dx = (xDom1 - xDom0) / (GRID - 1);
    const dy = (yDom1 - yDom0) / (GRID - 1);
    let zMin = Infinity, zMax = -Infinity;
    for (let j = 0; j < GRID; j++) {
      const yv = yDom0 + j * dy;
      for (let i = 0; i < GRID; i++) {
        const xv = xDom0 + i * dx;
        const zv = data.combineOp === 'product' ? xv * yv : xv + yv;
        values[j * GRID + i] = zv;
        if (zv < zMin) zMin = zv;
        if (zv > zMax) zMax = zv;
      }
    }
    if (!Number.isFinite(zMin)) zMin = 0;
    if (!Number.isFinite(zMax) || zMax === zMin) zMax = zMin + 1;

    // Evenly-spaced thresholds for the bands.
    const thresholds = Array.from(
      { length: N_BANDS },
      (_, i) => zMin + ((zMax - zMin) * (i + 1)) / (N_BANDS + 1),
    );
    const bandsRaw = d3contours().size([GRID, GRID]).thresholds(thresholds)(
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
    const bands = bandsRaw.map((b) => ({
      value: b.value,
      polygons: b.coordinates.map(transformPolygon),
    }));

    const xTicks = xScale.ticks(Math.min(8, Math.floor(innerW / 80)));
    const yTicks = yScale.ticks(5);
    return { xScale, yScale, xTicks, yTicks, bands, zMin, zMax };
  }, [data, innerW, innerH]);

  const color = scaleLinear<string>()
    .domain([zMin, zMax])
    .range(['#ffffe5', '#7f0000'])
    .interpolate(() => (t: number) => interpolateYlOrRd(t));

  const linePath = d3Line<{ x: number; y: number }>()
    .x((p) => xScale(p.x))
    .y((p) => yScale(p.y));

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Heatmap bands */}
          <g>
            {bands.map((band, i) => (
              <path
                key={i}
                d={polygonsToPath(band.polygons)}
                fill={color(band.value)}
                fillOpacity={0.55}
                stroke="none"
              />
            ))}
          </g>
          {/* Iso-curves */}
          <g>
            {bands.map((band, i) => (
              <g key={i}>
                <path
                  d={polygonsToPath(band.polygons)}
                  fill="none"
                  stroke="var(--ink-3)"
                  strokeOpacity={0.5}
                  strokeWidth={0.5}
                />
                {band.polygons.length > 0 && (
                  <IsoLabel
                    polygons={band.polygons}
                    label={formatZ(band.value)}
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
                  <circle key={p.year} cx={xScale(p.x)} cy={yScale(p.y)} r={1.5} fill={s.color} />
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
            heatmap: {data.zLabel}
          </text>
        </g>
      </svg>
    </div>
  );
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
