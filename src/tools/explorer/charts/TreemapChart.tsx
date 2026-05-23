import { useEffect, useRef, useState } from 'react';
import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy';
import type { TreemapData, TreemapSlice } from '../data/derive';

// Squarified treemap. One rect per slice, sized by value, colored by the
// slice's pre-computed color. Labels render inside rects when there's
// enough room; small slices stay as colored tiles.

type Props = {
  data: TreemapData;
};

type Node = { name: string; value?: number; children?: Node[]; slice?: TreemapSlice };

export default function TreemapChart({ data }: Props) {
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

  const root: Node = {
    name: 'root',
    children: data.slices.filter((s) => s.value > 0).map((s) => ({
      name: s.label,
      value: s.value,
      slice: s,
    })),
  };

  const h = hierarchy(root)
    .sum((d: Node) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap<Node>().size([size.w, size.h]).padding(2).round(true)(h as HierarchyRectangularNode<Node>);
  const leaves = (h as HierarchyRectangularNode<Node>).leaves();

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        {leaves.map((leaf, i) => {
          const slice = leaf.data.slice;
          if (!slice) return null;
          const x = leaf.x0;
          const y = leaf.y0;
          const w = leaf.x1 - leaf.x0;
          const ht = leaf.y1 - leaf.y0;
          const showLabel = w >= 64 && ht >= 24;
          return (
            <g key={`${slice.key}-${i}`}>
              <rect x={x} y={y} width={w} height={ht} fill={slice.color} stroke="var(--paper-2)" strokeWidth={1} />
              {showLabel && (
                <text
                  x={x + 6}
                  y={y + 14}
                  className="chart-treemap-label"
                  style={{ fill: contrastInk(slice.color) }}
                >
                  {slice.label}
                </text>
              )}
              {showLabel && ht >= 36 && (
                <text
                  x={x + 6}
                  y={y + 28}
                  className="chart-treemap-value"
                  style={{ fill: contrastInk(slice.color) }}
                >
                  {formatMt(slice.value)} Mt
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <style>{styles}</style>
    </div>
  );
}

// Pick a readable ink color for label text against a colored background.
// Simple luminance heuristic — dark fills get cream text, light fills get
// the navy ink. Avoids importing a color library for one decision.
function contrastInk(hex: string): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#181838' : '#F8F8E8';
}

function formatMt(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + ' k';
  if (v >= 10) return v.toFixed(0);
  return v.toFixed(1);
}

const styles = `
  .chart-treemap-label {
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 600;
    pointer-events: none;
  }
  .chart-treemap-value {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 10px;
    pointer-events: none;
    opacity: 0.85;
  }
`;
