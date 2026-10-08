import { area as d3Area, line as d3Line } from 'd3-shape';
import ChartFrame from './ChartFrame';
import type { DerivedData, Point } from '../data/derive';

type Props = {
  data: DerivedData;
};

// A series that runs past the observed record is drawn in two strokes —
// solid through the last historical year, dashed after it — over as many as
// two uncertainty bands (inner darker, outer lighter). Series with no
// projection render exactly as before: one solid line, no bands.

function hasBand(p: Point): boolean {
  return p.lo != null || p.loOuter != null;
}

export default function LineChart({ data }: Props) {
  const splitYear = data.historicalEnd;

  return (
    <ChartFrame data={data} enableHover>
      {({ xScale, yScale }) => {
        const gen = d3Line<Point>()
          .defined((p) => p.value != null)
          .x((p) => xScale(p.year))
          .y((p) => yScale(p.value ?? 0));

        const bandGen = (loKey: 'lo' | 'loOuter', hiKey: 'hi' | 'hiOuter') =>
          d3Area<Point>()
            .defined((p) => p[loKey] != null && p[hiKey] != null)
            .x((p) => xScale(p.year))
            .y0((p) => yScale(p[loKey] ?? 0))
            .y1((p) => yScale(p[hiKey] ?? 0));

        return (
          <g>
            {data.series.map((s) => {
              // The dashed segment starts at the last historical point so the
              // two strokes meet rather than leaving a gap at the divider.
              const historical =
                splitYear == null ? s.points : s.points.filter((p) => p.year <= splitYear);
              const projected =
                splitYear == null ? [] : s.points.filter((p) => p.year >= splitYear);
              const banded = projected.filter(hasBand);
              // Anchor the band at the divider so it opens from the line.
              const bandPoints =
                banded.length > 0 && projected[0] && !hasBand(projected[0])
                  ? [
                      {
                        ...projected[0],
                        lo: projected[0].value,
                        hi: projected[0].value,
                        loOuter: projected[0].value,
                        hiOuter: projected[0].value,
                      },
                      ...banded,
                    ]
                  : banded;

              return (
                <g key={s.key}>
                  {bandPoints.length > 0 && (
                    <>
                      <path
                        d={bandGen('loOuter', 'hiOuter')(bandPoints) ?? ''}
                        fill={s.color}
                        fillOpacity={0.12}
                        stroke="none"
                      />
                      <path
                        d={bandGen('lo', 'hi')(bandPoints) ?? ''}
                        fill={s.color}
                        fillOpacity={0.28}
                        stroke="none"
                      />
                    </>
                  )}
                  <path
                    d={gen(historical) ?? ''}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {projected.length > 1 && (
                    <path
                      d={gen(projected) ?? ''}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      }}
    </ChartFrame>
  );
}
