import type { DataBundle, ExplorerConfig, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';
import { derive, deriveTreemap, deriveScatter } from '../data/derive';
import LineChart from '../charts/LineChart';
import AreaChart from '../charts/AreaChart';
import BarChart from '../charts/BarChart';
import TreemapChart from '../charts/TreemapChart';
import ScatterChart from '../charts/ScatterChart';
import Legend from '../charts/Legend';

type Props = {
  config: ExplorerConfig;
  data: DataBundle;
};

export default function ChartArea({ config, data }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);

  return (
    <div className="explorer-chart-pane">
      <ChartHeader spec={spec} config={config} />
      <div className="explorer-chart-body">
        <ChartSwitch spec={spec} data={data} />
      </div>
      <ChartFooter spec={spec} data={data} />
      <style>{styles}</style>
    </div>
  );
}

function ChartSwitch({ spec, data }: { spec: Spec; data: DataBundle }) {
  const geoLevel = spec.geoLevel ?? 'world';
  const countryMeasureGated =
    geoLevel === 'country' && (spec.measure === 'per_capita' || spec.measure === 'per_gdp');

  if (countryMeasureGated) {
    return (
      <EmptyState>
        <strong>Per-capita and per-GDP measures are not yet available at country level.</strong>
        <br />
        Switch the measure to Absolute or Cumulative, or step down to Region geography.
      </EmptyState>
    );
  }
  if (geoLevel === 'country' && (spec.filters.geo ?? []).length === 0) {
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
      if (geoLevel === 'country') {
        return (
          <EmptyState>
            The phase plot needs GDP and population, which we don't ship at country level
            yet. Switch geography to Region to view scatter trajectories.
          </EmptyState>
        );
      }
      const derived = deriveScatter(data, spec);
      if (derived.series.length === 0) return <EmptyState>No data for the current selection.</EmptyState>;
      return <ScatterChart data={derived} />;
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

function ChartHeader({ spec, config }: { spec: Spec; config: ExplorerConfig }) {
  const measure = config.measures.find((m) => m.name === spec.measure);
  let subtitle = '';
  if (spec.chart === 'treemap') {
    subtitle = `${spec.singleYear ?? spec.yearRange[1]} snapshot`;
  } else if (spec.chart === 'scatter') {
    const xMeasure = config.measures.find((m) => m.name === (spec.scatterX ?? 'per_gdp'));
    subtitle = `${spec.yearRange[0]}–${spec.yearRange[1]} · ${xMeasure?.label ?? 'X'} vs ${measure?.label ?? 'Y'}`;
  } else {
    subtitle = `${spec.yearRange[0]}–${spec.yearRange[1]} · ${measure?.label ?? spec.measure}`;
  }
  return (
    <div className="explorer-chart-header">
      <p className="explorer-chart-subtitle">{subtitle}</p>
    </div>
  );
}

function ChartFooter({ spec, data }: { spec: Spec; data: DataBundle }) {
  // Treemap legend is the rects themselves; scatter labels each series on
  // the chart already. Time-series charts (line/area/bar) get the legend.
  if (spec.chart === 'treemap' || spec.chart === 'scatter') return null;
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
  .explorer-chart-header { flex: 0 0 auto; }
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
