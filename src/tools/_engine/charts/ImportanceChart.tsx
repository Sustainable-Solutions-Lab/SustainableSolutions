import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImportanceData } from '../data/derive';
import Tooltip from '../ui/Tooltip';

// Which levers explain the spread in material growth, and how that changes
// with the growth rate itself. One 100%-stacked bar per growth bin, so the
// bars answer "within runs that land here, what moved the outcome" rather
// than "how likely is this outcome".
//
// Bars are shares of attributed importance, renormalised per bin — they say
// nothing about how many runs fall in each bin, which is why the run count
// rides along under each label.

type Props = {
  data: ImportanceData;
};

const MARGIN = { top: 16, right: 16, bottom: 44, left: 104 };
const LEGEND_W = 176;
const BAR_GAP = 0.34;

export default function ImportanceChart({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [hover, setHover] = useState<{
    bin: string;
    label: string;
    pct: number;
    color: string;
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

  const innerW = Math.max(120, size.w - MARGIN.left - MARGIN.right - LEGEND_W);
  const innerH = Math.max(80, size.h - MARGIN.top - MARGIN.bottom);
  const bandH = innerH / Math.max(1, data.bins.length);
  const barH = bandH * (1 - BAR_GAP);

  // Cumulative offsets per bin, in percent.
  const stacks = useMemo(
    () =>
      data.bins.map((bin) => {
        let acc = 0;
        return {
          ...bin,
          cells: bin.cells.map((c) => {
            const x0 = acc;
            acc += c.pct;
            return { ...c, x0, x1: acc };
          }),
        };
      }),
    [data],
  );

  const xPct = (v: number) => (v / 100) * innerW;

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t} transform={`translate(${xPct(t)},0)`}>
              <line y1={0} y2={innerH} className="chart-gridline" />
              <text y={innerH + 16} textAnchor="middle" className="chart-tick">{t}%</text>
            </g>
          ))}
          <text x={innerW / 2} y={innerH + 36} textAnchor="middle" className="chart-axis-label">
            Share of attributed importance
          </text>

          {stacks.map((bin, bi) => {
            const y = bi * bandH + (bandH - barH) / 2;
            return (
              <g key={bin.bin}>
                <text x={-12} y={y + barH / 2 - 4} dy="0.32em" textAnchor="end" className="imp-bin">
                  {bin.bin}
                </text>
                <text x={-12} y={y + barH / 2 + 8} dy="0.32em" textAnchor="end" className="imp-count">
                  {bin.n} runs
                </text>
                {bin.cells.map((c) => (
                  <rect
                    key={c.label}
                    x={xPct(c.x0)}
                    y={y}
                    width={Math.max(0.5, xPct(c.pct))}
                    height={barH}
                    fill={c.color}
                    onMouseMove={(e) => {
                      const frame = ref.current?.getBoundingClientRect();
                      setHover({
                        bin: bin.bin,
                        label: c.label,
                        pct: c.pct,
                        color: c.color,
                        mouseX: e.clientX - (frame?.left ?? 0),
                        mouseY: e.clientY - (frame?.top ?? 0),
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </g>
            );
          })}

          {/* legend, in stack order so it reads against the bars */}
          <g transform={`translate(${innerW + 20},2)`}>
            {data.legend.map((l, i) => (
              <g key={l.label} transform={`translate(0,${i * 14})`}>
                <rect x={0} y={0} width={9} height={9} fill={l.color} />
                <text x={14} y={4.5} dy="0.32em" className="imp-legend">{l.label}</text>
              </g>
            ))}
          </g>
        </g>
      </svg>
      {hover && (
        <Tooltip visible x={hover.mouseX} y={hover.mouseY}>
          <div className="tt-title">
            <span className="tt-swatch" style={{ background: hover.color }} />
            {hover.label}
          </div>
          <div className="tt-row">
            <span>Material growth</span>
            <span>{hover.bin}</span>
          </div>
          <div className="tt-row">
            <span>Share of importance</span>
            <span>{hover.pct.toFixed(1)}%</span>
          </div>
        </Tooltip>
      )}
      <style>{styles}</style>
    </div>
  );
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
  .imp-bin {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
    fill: var(--ink-2);
  }
  .imp-count {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 8.5px;
    fill: var(--ink-3);
  }
  .imp-legend {
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    font-size: 10px;
    fill: var(--ink-2);
  }
`;
