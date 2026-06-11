import { useEffect, useRef } from 'react';
import type { DataBundle, ExplorerConfig, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';
import { useLazyLayer } from '../data/lazy-context';
import {
  derive,
  deriveTreemap,
  deriveScatter,
  deriveChoropleth,
  deriveContour,
} from '../data/derive';
import LineChart from '../charts/LineChart';
import AreaChart from '../charts/AreaChart';
import BarChart from '../charts/BarChart';
import TreemapChart from '../charts/TreemapChart';
import ScatterChart from '../charts/ScatterChart';
import Choropleth from '../charts/Choropleth';
import ContourChart from '../charts/ContourChart';
import Legend from '../charts/Legend';
import ChartToolbar from './ChartToolbar';

type Meta = {
  yearRange: [number, number];
  years: number[];
  regions: string[];
  materials: { id: string; label: string; group: string | null }[];
  groups: { id: string; label: string; members: string[] }[];
};

type Props = {
  config: ExplorerConfig;
  data: DataBundle;
  meta: Meta;
};

export default function ChartArea({ config, data, meta }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Choropleth always needs the country layer; trigger the lazy fetch.
  const countriesLayer = useLazyLayer('flowsCountries');
  useEffect(() => {
    if (spec.chart === 'choropleth') countriesLayer.request();
  }, [spec.chart, countriesLayer]);

  return (
    <div className="explorer-chart-pane">
      <div className="explorer-chart-headerbar">
        <ChartHeader spec={spec} config={config} meta={meta} />
        <ChartToolbar spec={spec} data={data} containerRef={bodyRef} />
      </div>
      <div className="explorer-chart-body" ref={bodyRef}>
        <ChartSwitch spec={spec} data={data} countriesLoading={countriesLayer.loading} />
      </div>
      <ChartFooter spec={spec} data={data} />
      <style>{styles}</style>
    </div>
  );
}

function ChartSwitch({
  spec,
  data,
  countriesLoading,
}: {
  spec: Spec;
  data: DataBundle;
  countriesLoading: boolean;
}) {
  const geoLevel = spec.geoLevel ?? 'world';
  if (geoLevel === 'country' && (spec.filters.geo ?? []).length === 0 && spec.chart !== 'choropleth') {
    return <EmptyState>Pick one or more countries from the sidebar to draw the chart.</EmptyState>;
  }

  switch (spec.chart) {
    case 'line':
    case 'area':
    case 'bar': {
      const derived = derive(data, spec);
      if (derived.series.length === 0) return <EmptyState>No data for the current selection.</EmptyState>;
      if (spec.chart === 'line') return <LineChart data={derived} />;
      if (spec.chart === 'area') return <AreaChart data={derived} />;
      return <BarChart data={derived} />;
    }
    case 'treemap': {
      const derived = deriveTreemap(data, spec);
      const totalValue = derived.slices.reduce((sum, s) => sum + s.value, 0);
      if (totalValue === 0)
        return <EmptyState>No data for {derived.year} with the current filters.</EmptyState>;
      return <TreemapChart data={derived} />;
    }
    case 'scatter': {
      const derived = deriveScatter(data, spec);
      if (derived.series.length === 0) return <EmptyState>No data for the current selection.</EmptyState>;
      return <ScatterChart data={derived} />;
    }
    case 'contour': {
      const derived = deriveContour(data, spec);
      if (derived.series.length === 0)
        return <EmptyState>No data for the current selection.</EmptyState>;
      return <ContourChart data={derived} />;
    }
    case 'choropleth': {
      if (!data.flowsCountries) {
        return (
          <EmptyState>
            {countriesLoading ? 'Loading ~7 MB country layer…' : 'Country layer not yet loaded.'}
          </EmptyState>
        );
      }
      const derived = deriveChoropleth(data, spec);
      if (derived.matched === 0)
        return <EmptyState>No country values for {derived.year} with the current filters.</EmptyState>;
      return <Choropleth data={derived} />;
    }
    default:
      return (
        <EmptyState>
          <strong>{labelFor(spec.chart)}</strong> arrives in a later milestone.
        </EmptyState>
      );
  }
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="explorer-chart-empty">{children}</div>;
}

function labelFor(chart: Spec['chart']): string {
  return chart.charAt(0).toUpperCase() + chart.slice(1);
}

function ChartHeader({
  spec,
  config,
  meta,
}: {
  spec: Spec;
  config: ExplorerConfig;
  meta: Meta;
}) {
  const measure = config.measures.find((m) => m.name === spec.measure);
  const title = buildChartTitle(spec, meta);
  let subtitle = '';
  if (spec.chart === 'treemap' || spec.chart === 'choropleth') {
    subtitle = `${spec.singleYear ?? spec.yearRange[1]} snapshot · ${measure?.label ?? spec.measure}`;
  } else if (spec.chart === 'scatter' || spec.chart === 'contour') {
    const xMeasure = config.measures.find((m) => m.name === (spec.scatterX ?? 'per_gdp'));
    const contourTag =
      spec.chart === 'contour'
        ? ` · contours = ${xMeasure?.label ?? 'X'} × ${measure?.label ?? 'Y'}`
        : '';
    subtitle = `${spec.yearRange[0]}–${spec.yearRange[1]} · ${xMeasure?.label ?? 'X'} vs ${measure?.label ?? 'Y'}${contourTag}`;
  } else {
    subtitle = `${spec.yearRange[0]}–${spec.yearRange[1]} · ${measure?.label ?? spec.measure}`;
  }
  return (
    <div className="explorer-chart-header">
      <h2 className="explorer-chart-title">{title}</h2>
      <p className="explorer-chart-subtitle">{subtitle}</p>
    </div>
  );
}

function buildChartTitle(spec: Spec, meta: Meta): string {
  const matPart = materialTitlePart(spec, meta);
  const geoPart = geographyTitlePart(spec);
  return geoPart ? `${matPart} in ${geoPart}` : matPart;
}

function materialTitlePart(spec: Spec, meta: Meta): string {
  const grouping = spec.groupings?.material ?? 'category';
  const sel = spec.filters.material ?? [];
  if (sel.length === 0) return 'All materials';
  const lookup = grouping === 'group' ? meta.groups : meta.materials;
  const labels = sel.map((id) => lookup.find((x) => x.id === id)?.label ?? id);
  if (labels.length === 1) return labels[0];
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.length} ${grouping === 'group' ? 'groups' : 'materials'}`;
}

function geographyTitlePart(spec: Spec): string | null {
  const level = spec.geoLevel ?? 'world';
  if (level === 'world') return null;
  const sel = spec.filters.geo ?? [];
  if (sel.length === 0) return null;
  if (sel.length === 1) return sel[0];
  if (sel.length <= 3) return sel.join(', ');
  return `${sel.length} ${level === 'country' ? 'countries' : 'regions'}`;
}

function ChartFooter({ spec, data }: { spec: Spec; data: DataBundle }) {
  // Treemap legend is the rects themselves; scatter labels each series on
  // the chart already; choropleth has its own color-bar legend in-chart.
  if (
    spec.chart === 'treemap' ||
    spec.chart === 'scatter' ||
    spec.chart === 'choropleth' ||
    spec.chart === 'contour'
  )
    return null;
  const derived = derive(data, spec);
  if (derived.series.length === 0) return null;
  return <Legend series={derived.series} />;
}

const styles = `
  .explorer-chart-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    gap: 8px;
    overflow: hidden;
  }
  .explorer-chart-headerbar {
    flex: 0 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .explorer-chart-header { flex: 1 1 auto; min-width: 0; }
  .explorer-chart-title {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--ink-2);
    margin: 0 0 2px 0;
  }
  .explorer-chart-subtitle {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--ink-3);
    margin: 0;
  }
  .explorer-chart-body {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
  .explorer-chart-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-3);
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
  }
`;
