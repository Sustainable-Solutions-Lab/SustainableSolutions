import type { ChartType, ExplorerConfig, MeasureName, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';

// Knob panel for the explorer. Reads the current spec from the per-Explorer
// Zustand store; writes changes back. Chart-aware: knobs not relevant to
// the active chart are hidden rather than disabled, per EXPLORER_TOOLS_PLAN.md §4.

type Meta = {
  yearRange: [number, number];
  years: number[];
  regions: string[];
  materials: { id: string; label: string; group: string | null }[];
  groups: { id: string; label: string; members: string[] }[];
};

type Props = {
  config: ExplorerConfig;
  meta: Meta;
};

export default function Sidebar({ config, meta }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);

  return (
    <div className="explorer-sidebar-inner">
      <Section title="Chart">
        <ChartTypeToggle chartTypes={config.chartTypes} active={spec.chart} />
      </Section>

      <Section title="Measure">
        <MeasurePicker config={config} active={spec.measure} />
      </Section>

      <Section title="Geography">
        <GeoPicker regions={meta.regions} selected={spec.filters.geo ?? []} />
      </Section>

      <Section title="Material">
        <MaterialPicker
          materials={meta.materials}
          groups={meta.groups}
          grouping={spec.groupings?.material ?? 'category'}
          selected={spec.filters.material ?? []}
        />
      </Section>

      <Section title="Year range">
        <YearRangeSlider
          min={meta.years[0]}
          max={meta.years[meta.years.length - 1]}
          value={spec.yearRange}
        />
      </Section>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="explorer-section">
      <h3 className="explorer-section-title">{title}</h3>
      {children}
    </section>
  );
}

// ── Controls ───────────────────────────────────────────────────────────────

const CHART_LABELS: Record<ChartType, string> = {
  line: 'Line',
  area: 'Stacked area',
  bar: 'Bar',
  treemap: 'Treemap',
  choropleth: 'Map',
  scatter: 'Scatter',
  contour: 'Contour',
};

function ChartTypeToggle({ chartTypes, active }: { chartTypes: ChartType[]; active: ChartType }) {
  const useStore = useSpecStoreHook();
  const setChart = useStore((s: { setChart: (c: ChartType) => void }) => s.setChart);
  return (
    <div className="explorer-chip-group" role="radiogroup">
      {chartTypes.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={c === active}
          className={`explorer-chip ${c === active ? 'is-active' : ''}`}
          onClick={() => setChart(c)}
          type="button"
        >
          {CHART_LABELS[c] ?? c}
        </button>
      ))}
    </div>
  );
}

function MeasurePicker({ config, active }: { config: ExplorerConfig; active: MeasureName }) {
  const useStore = useSpecStoreHook();
  const setMeasure = useStore((s: { setMeasure: (m: MeasureName) => void }) => s.setMeasure);
  return (
    <div className="explorer-chip-group" role="radiogroup">
      {config.measures.map((m) => (
        <button
          key={m.name}
          role="radio"
          aria-checked={m.name === active}
          className={`explorer-chip ${m.name === active ? 'is-active' : ''}`}
          onClick={() => setMeasure(m.name)}
          type="button"
          title={m.units}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function GeoPicker({ regions, selected }: { regions: string[]; selected: string[] }) {
  const useStore = useSpecStoreHook();
  const toggle = useStore(
    (s: { toggleFilterValue: (dim: string, v: string) => void }) => s.toggleFilterValue,
  );
  const setFilter = useStore(
    (s: { setFilter: (dim: string, v: string[]) => void }) => s.setFilter,
  );
  const allSelected = selected.length === 0; // empty = all
  return (
    <>
      <div className="explorer-chip-group">
        <button
          type="button"
          className={`explorer-chip ${allSelected ? 'is-active' : ''}`}
          onClick={() => setFilter('geo', [])}
        >
          World
        </button>
        {regions.map((r) => (
          <button
            key={r}
            type="button"
            className={`explorer-chip ${selected.includes(r) ? 'is-active' : ''}`}
            onClick={() => toggle('geo', r)}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="explorer-hint">
        {allSelected ? 'Showing world total' : `${selected.length} region(s) selected`}
      </p>
    </>
  );
}

function MaterialPicker({
  materials,
  groups,
  grouping,
  selected,
}: {
  materials: { id: string; label: string; group: string | null }[];
  groups: { id: string; label: string; members: string[] }[];
  grouping: string;
  selected: string[];
}) {
  const useStore = useSpecStoreHook();
  const toggle = useStore(
    (s: { toggleFilterValue: (dim: string, v: string) => void }) => s.toggleFilterValue,
  );
  const setFilter = useStore(
    (s: { setFilter: (dim: string, v: string[]) => void }) => s.setFilter,
  );
  const setGrouping = useStore(
    (s: { setGrouping: (dim: string, g: string) => void }) => s.setGrouping,
  );

  const allSelected = selected.length === 0;

  return (
    <>
      <div className="explorer-toggle-row">
        <button
          type="button"
          className={`explorer-toggle ${grouping === 'group' ? 'is-active' : ''}`}
          onClick={() => setGrouping('material', 'group')}
        >
          6 groups
        </button>
        <button
          type="button"
          className={`explorer-toggle ${grouping === 'category' ? 'is-active' : ''}`}
          onClick={() => setGrouping('material', 'category')}
        >
          22 categories
        </button>
      </div>
      <div className="explorer-chip-group">
        <button
          type="button"
          className={`explorer-chip ${allSelected ? 'is-active' : ''}`}
          onClick={() => setFilter('material', [])}
        >
          All
        </button>
        {grouping === 'group'
          ? groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`explorer-chip ${selected.includes(g.id) ? 'is-active' : ''}`}
                onClick={() => toggle('material', g.id)}
              >
                {g.label}
              </button>
            ))
          : materials.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`explorer-chip explorer-chip-small ${selected.includes(m.id) ? 'is-active' : ''}`}
                onClick={() => toggle('material', m.id)}
              >
                {m.label}
              </button>
            ))}
      </div>
      <p className="explorer-hint">
        {allSelected ? `All ${grouping === 'group' ? '6 groups' : '22 categories'}` : `${selected.length} selected`}
      </p>
    </>
  );
}

function YearRangeSlider({
  min,
  max,
  value,
}: {
  min: number;
  max: number;
  value: [number, number];
}) {
  const useStore = useSpecStoreHook();
  const setYearRange = useStore(
    (s: { setYearRange: (r: [number, number]) => void }) => s.setYearRange,
  );
  const [lo, hi] = value;

  const setLo = (v: number) => setYearRange([Math.min(v, hi), hi]);
  const setHi = (v: number) => setYearRange([lo, Math.max(v, lo)]);

  return (
    <div className="explorer-year-range">
      <div className="explorer-year-readout">
        <span>{lo}</span>
        <span className="explorer-year-dash">–</span>
        <span>{hi}</span>
      </div>
      <div className="explorer-range-track">
        <input
          type="range"
          min={min}
          max={max}
          value={lo}
          onChange={(e) => setLo(Number(e.target.value))}
          aria-label="Start year"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={hi}
          onChange={(e) => setHi(Number(e.target.value))}
          aria-label="End year"
        />
      </div>
      <div className="explorer-year-bounds">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
