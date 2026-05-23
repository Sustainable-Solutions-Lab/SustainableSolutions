import { line as d3Line } from 'd3-shape';
import ChartFrame from './ChartFrame';
import type { DerivedData, Point } from '../data/derive';

type Props = {
  data: DerivedData;
};

export default function LineChart({ data }: Props) {
  return (
    <ChartFrame data={data}>
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
  );
}
