import { useMemo } from 'react';
import { stack, stackOrderNone, stackOffsetNone, area as d3Area } from 'd3-shape';
import ChartFrame from './ChartFrame';
import Legend from './Legend';
import type { DerivedData } from '../data/derive';

// Stacked area chart. Each year becomes a stacked column of series values.
// Nulls are treated as zero for the stack (an unaligned chart would
// otherwise leave a gap that misleads the eye).

type Props = {
  data: DerivedData;
  height?: number;
};

type Row = { year: number } & Record<string, number>;

export default function AreaChart({ data, height = 480 }: Props) {
  const { rows, keys, stackedSeries, stackMax } = useMemo(() => {
    const keys = data.series.map((s) => s.key);
    const rows: Row[] = data.years.map((year, i) => {
      const row: Row = { year };
      for (const s of data.series) {
        const p = s.points[i];
        row[s.key] = p?.value ?? 0;
      }
      return row;
    });
    const stacker = stack<Row>().keys(keys).order(stackOrderNone).offset(stackOffsetNone);
    const stackedSeries = stacker(rows);
    let stackMax = 0;
    for (const layer of stackedSeries) {
      for (const segment of layer) {
        if (segment[1] > stackMax) stackMax = segment[1];
      }
    }
    return { rows, keys, stackedSeries, stackMax };
  }, [data]);

  void rows;
  void keys;

  return (
    <div className="chart-with-legend">
      <ChartFrame data={data} height={height} yDomain={[0, stackMax]}>
        {({ xScale, yScale }) => {
          const gen = d3Area<{ data: Row; 0: number; 1: number }>()
            .x((d) => xScale(d.data.year))
            .y0((d) => yScale(d[0]))
            .y1((d) => yScale(d[1]));
          return (
            <g>
              {stackedSeries.map((layer, i) => (
                <path
                  key={data.series[i]?.key ?? i}
                  d={gen(layer as unknown as { data: Row; 0: number; 1: number }[]) ?? ''}
                  fill={data.series[i]?.color ?? '#999'}
                  stroke="var(--paper-2)"
                  strokeWidth={0.5}
                />
              ))}
            </g>
          );
        }}
      </ChartFrame>
      <Legend series={data.series} />
    </div>
  );
}
