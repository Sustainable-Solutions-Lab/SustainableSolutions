import type { ExplorerConfig, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';

// Placeholder chart surface for milestone 4. Renders a readable summary of
// the current spec so we can verify URL→spec→UI→URL round-trips work as
// the user mutates knobs. Real chart components arrive in milestones 5+.

type Props = {
  config: ExplorerConfig;
};

export default function ChartArea({ config }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);

  const measure = config.measures.find((m) => m.name === spec.measure);
  const geoFilter = spec.filters.geo ?? [];
  const matFilter = spec.filters.material ?? [];
  const matGrouping = spec.groupings?.material ?? 'category';

  return (
    <div className="explorer-chart-placeholder">
      <p className="explorer-chart-status">Chart coming in milestone 5</p>

      <dl className="explorer-spec-readout">
        <Row label="Chart type" value={spec.chart} />
        <Row
          label="Measure"
          value={measure ? `${measure.label} (${measure.units})` : spec.measure}
        />
        <Row
          label="Geography"
          value={geoFilter.length === 0 ? 'World total' : geoFilter.join(', ')}
        />
        <Row
          label="Material"
          value={
            matFilter.length === 0
              ? `All ${matGrouping === 'group' ? '6 groups' : '22 categories'}`
              : `${matFilter.join(', ')} (as ${matGrouping})`
          }
        />
        <Row label="Years" value={`${spec.yearRange[0]} – ${spec.yearRange[1]}`} />
        {spec.preset && <Row label="Preset" value={spec.preset} />}
      </dl>

      <details className="explorer-spec-raw">
        <summary>Raw spec</summary>
        <pre>{JSON.stringify(spec, null, 2)}</pre>
      </details>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="explorer-spec-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
