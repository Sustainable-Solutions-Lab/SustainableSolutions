import { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { scaleSequential } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import type { ChoroplethData } from '../data/derive';

// World choropleth using Natural Earth (110m) boundaries augmented at build
// time with UNEP_name on each country geometry. Color scale: sequential
// YlOrRd; countries with no data render as paper-3 gray.
//
// d3-geo + SVG (not maplibre) — the explorer's other charts are SVG too and
// a static world map doesn't need tile/zoom infrastructure.

type Props = {
  data: ChoroplethData;
};

type CountryProps = { name?: string; unep_name?: string };

const TOPO_URL = '/tools/materials/world-countries-110m.json';

export default function Choropleth({ data }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [topo, setTopo] = useState<Topology | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((t: Topology) => {
        if (!cancelled) setTopo(t);
      })
      .catch((e: Error) => console.error('[choropleth] failed to load boundaries:', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reserved bottom band for the color legend.
  const LEGEND_H = 36;
  const mapH = Math.max(120, size.h - LEGEND_H);

  // Color scale + d3 projection — memoize per data + size change.
  const { features, pathFn, color } = useMemo(() => {
    if (!topo)
      return {
        features: [] as Feature<Geometry, CountryProps>[],
        pathFn: null,
        color: null as ((v: number) => string) | null,
      };
    const fc = feature(
      topo,
      topo.objects.countries as GeometryCollection<CountryProps>,
    ) as { type: string; features?: Feature<Geometry, CountryProps>[] } | Feature<Geometry, CountryProps>;
    const features: Feature<Geometry, CountryProps>[] =
      fc.type === 'FeatureCollection'
        ? (fc as { features: Feature<Geometry, CountryProps>[] }).features
        : [fc as Feature<Geometry, CountryProps>];
    const projection = geoNaturalEarth1()
      .fitSize([size.w, mapH], { type: 'Sphere' } as unknown as GeoPermissibleObjects);
    const pathFn = geoPath(projection);
    const color = scaleSequential(interpolateYlOrRd).domain([data.min, data.max || 1]) as unknown as (
      v: number,
    ) => string;
    return { features, pathFn, color };
  }, [topo, size.w, mapH, data]);

  return (
    <div className="chart-frame" ref={ref}>
      <svg width={size.w} height={size.h} className="chart-svg" role="img">
        <g>
          {/* Sphere outline for context — subtle but anchors the map */}
          {pathFn && (
            <path
              d={pathFn({ type: 'Sphere' } as unknown as GeoPermissibleObjects) ?? ''}
              fill="var(--paper)"
              stroke="var(--rule)"
              strokeWidth={0.5}
            />
          )}
          {features.map((feat, i) => {
            const unep = (feat.properties as CountryProps | undefined)?.unep_name;
            const value = unep ? data.byCountry[unep] : undefined;
            const fill =
              value != null && color ? color(value) : 'var(--paper-3)';
            return (
              <path
                key={i}
                d={(pathFn ? pathFn(feat as unknown as GeoPermissibleObjects) : '') ?? ''}
                fill={fill}
                stroke="var(--paper-2)"
                strokeWidth={0.4}
              />
            );
          })}
        </g>

        {/* Color legend (continuous bar) */}
        {color && size.w > 0 && (
          <Legend
            min={data.min}
            max={data.max}
            units={data.units}
            x={Math.max(16, size.w - 280 - 16)}
            y={size.h - LEGEND_H + 8}
            width={280}
          />
        )}
      </svg>
    </div>
  );
}

function Legend({
  min,
  max,
  units,
  x,
  y,
  width,
}: {
  min: number;
  max: number;
  units: string;
  x: number;
  y: number;
  width: number;
}) {
  const N = 24;
  const segments = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    return { t, color: interpolateYlOrRd(t) };
  });
  const segW = width / N;
  return (
    <g transform={`translate(${x},${y})`}>
      {segments.map((s, i) => (
        <rect key={i} x={i * segW} y={0} width={segW + 0.5} height={8} fill={s.color} />
      ))}
      <text x={0} y={22} className="chart-tick">
        {formatLegend(min)}
      </text>
      <text x={width} y={22} textAnchor="end" className="chart-tick">
        {formatLegend(max)}
      </text>
      <text x={width / 2} y={22} textAnchor="middle" className="chart-tick">
        {units}
      </text>
    </g>
  );
}

function formatLegend(v: number): string {
  if (!Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  if (abs >= 10) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  if (abs === 0) return '0';
  return v.toPrecision(2);
}
