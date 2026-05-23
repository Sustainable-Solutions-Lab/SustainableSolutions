import type { DataBundle, ExplorerConfig, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';
import { derive } from '../data/derive';
import LineChart from '../charts/LineChart';
import AreaChart from '../charts/AreaChart';
import BarChart from '../charts/BarChart';
import Legend from '../charts/Legend';

type Props = {
  config: ExplorerConfig;
  data: DataBundle;
};

export default function ChartArea({ config, data }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);
  const derived = derive(data, spec);
  const supported = chartSupported(spec.chart);

  return (
    <div className="explorer-chart-pane">
      <ChartHeader spec={spec} derived={derived} config={config} />
      <div className="explorer-chart-body">
        {supported && derived.series.length > 0 ? (
          <RenderChart chart={spec.chart} derived={derived} />
        ) : (
          <div className="explorer-chart-empty">
            {derived.series.length === 0
              ? 'No data for the current selection.'
              : `${labelFor(spec.chart)} arrives in a later milestone. Try Line, Stacked area, or Bar.`}
          </div>
        )}
      </div>
      {supported && derived.series.length > 0 && <Legend series={derived.series} />}
      <style>{styles}</style>
    </div>
  );
}

function chartSupported(chart: Spec['chart']): boolean {
  return chart === 'line' || chart === 'area' || chart === 'bar';
}

function labelFor(chart: Spec['chart']): string {
  return chart.charAt(0).toUpperCase() + chart.slice(1);
}

function RenderChart({
  chart,
  derived,
}: {
  chart: Spec['chart'];
  derived: ReturnType<typeof derive>;
}) {
  switch (chart) {
    case 'line':
      return <LineChart data={derived} />;
    case 'area':
      return <AreaChart data={derived} />;
    case 'bar':
      return <BarChart data={derived} />;
    default:
      return null;
  }
}

function ChartHeader({
  spec,
  derived,
  config,
}: {
  spec: Spec;
  derived: ReturnType<typeof derive>;
  config: ExplorerConfig;
}) {
  const measure = config.measures.find((m) => m.name === spec.measure);
  const subtitle =
    `${derived.series.length} series · ` +
    `${spec.yearRange[0]}–${spec.yearRange[1]} · ` +
    (measure?.label ?? spec.measure);
  return (
    <div className="explorer-chart-header">
      <p className="explorer-chart-subtitle">{subtitle}</p>
    </div>
  );
}

const styles = `
  .explorer-chart-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    gap: 8px;
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
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
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
