import { useMemo } from 'react';
import { scaleBand } from 'd3-scale';
import ChartFrame from './ChartFrame';
import type { DerivedData } from '../data/derive';

// Grouped bar chart: each x-tick is a year, each tick gets one bar per
// series. Useful for direct year-on-year comparisons across a small number
// of series. (Single-year ranking and stacked-bar variants come later.)

type Props = {
  data: DerivedData;
};

export default function BarChart({ data }: Props) {
  const yearBand = useMemo(
    () => scaleBand<number>().domain(data.years).range([0, 1]).padding(0.2),
    [data.years],
  );

  return (
    <ChartFrame data={data}>
      {({ xScale, yScale, innerWidth, innerHeight }) => {
          // Compute pixel-space band width based on the year spacing the
          // linear xScale provides. We don't reuse yearBand directly for
          // positioning because the parent x scale is linear; instead we
          // size each cluster by the inter-year pixel gap.
          const yearGapPx =
            data.years.length > 1
              ? Math.abs(xScale(data.years[1]) - xScale(data.years[0]))
              : innerWidth;
          const clusterPad = yearGapPx * 0.2;
          const clusterWidth = Math.max(2, yearGapPx - clusterPad);
          const barWidth = Math.max(1, clusterWidth / Math.max(1, data.series.length));

          void yearBand;

          return (
            <g>
              {data.years.map((year, yi) => {
                const cx = xScale(year);
                return (
                  <g key={year}>
                    {data.series.map((s, si) => {
                      const p = s.points[yi];
                      if (p?.value == null) return null;
                      const x = cx - clusterWidth / 2 + si * barWidth;
                      const y0 = yScale(0);
                      const y1 = yScale(p.value);
                      const top = Math.min(y0, y1);
                      const h = Math.abs(y0 - y1);
                      return (
                        <rect
                          key={s.key}
                          x={x}
                          y={top}
                          width={barWidth * 0.9}
                          height={h}
                          fill={s.color}
                        />
                      );
                    })}
                  </g>
                );
              })}
              <line x1={0} x2={innerWidth} y1={yScale(0)} y2={yScale(0)} className="chart-axis-line" />
            </g>
          );
        }}
    </ChartFrame>
  );
}
