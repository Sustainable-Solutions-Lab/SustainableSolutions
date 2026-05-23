import { line as d3Line } from 'd3-shape';
import ChartFrame from './ChartFrame';
import Legend from './Legend';
import type { DerivedData, Point } from '../data/derive';

type Props = {
  data: DerivedData;
  height?: number;
};

export default function LineChart({ data, height = 480 }: Props) {
  return (
    <div className="chart-with-legend">
      <ChartFrame data={data} height={height}>
        {({ xScale, yScale }) => {
          const gen = d3Line<Point>()
            .defined((p) => p.value != null)
            .x((p) => xScale(p.year))
            .y((p) => yScale(p.value ?? 0));

          return (
            <g>
              {data.series.map((s) => (
                <path
                  key={s.key}
                  d={gen(s.points) ?? ''}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
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
