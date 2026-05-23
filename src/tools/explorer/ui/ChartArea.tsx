import type { DataBundle, ExplorerConfig, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';
import { derive } from '../data/derive';
import LineChart from '../charts/LineChart';
import AreaChart from '../charts/AreaChart';
import BarChart from '../charts/BarChart';

type Props = {
  config: ExplorerConfig;
  data: DataBundle;
};

export default function ChartArea({ config, data }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);
  const derived = derive(data, spec);

  return (
    <div className="explorer-chart-pane">
      <ChartHeader spec={spec} derived={derived} config={config} />
      <div className="explorer-chart-body">
        <RenderChart chart={spec.chart} derived={derived} />
      </div>
      <style>{styles}</style>
    </div>
  );
}

function RenderChart({
  chart,
  derived,
}: {
  chart: Spec['chart'];
  derived: ReturnType<typeof derive>;
}) {
  if (derived.series.length === 0) {
    return <div className="explorer-chart-empty">No data for the current selection.</div>;
  }
  switch (chart) {
    case 'line':
      return <LineChart data={derived} />;
    case 'area':
      return <AreaChart data={derived} />;
    case 'bar':
      return <BarChart data={derived} />;
    default:
      return (
        <div className="explorer-chart-empty">
          <strong>{chart}</strong> chart arrives in a later milestone. Try Line, Stacked area, or Bar.
        </div>
      );
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
    height: 100%;
    min-height: 0;
  }
  .explorer-chart-header {
    margin-bottom: 8px;
  }
  .explorer-chart-subtitle {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--ink-3);
    margin: 0;
  }
  .explorer-chart-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .chart-with-legend {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .explorer-chart-empty {
    padding: 24px;
    background: var(--paper-3);
    color: var(--ink-3);
    text-align: center;
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 12px;
  }
`;
