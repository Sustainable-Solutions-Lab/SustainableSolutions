import { useEffect, useMemo, useState } from 'react';
import type { ChartType, ExplorerConfig, MeasureName, PresetSpec, Spec } from '../types';
import { useSpecStoreHook } from '../store/context';
import { useLazyLayer } from '../data/lazy-context';

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
  countries?: string[];
};

export default function Sidebar({ config, meta, countries }: Props) {
  const useStore = useSpecStoreHook();
  const spec = useStore((s: { spec: Spec }) => s.spec);
  const geoLevel = spec.geoLevel ?? 'world';

  return (
    <div className="explorer-sidebar-inner">
      {config.presets.length > 0 && (
        <Section title="Preset">
          <PresetSelect presets={config.presets} activeId={spec.preset} />
        </Section>
      )}

      <Section title="Chart">
        <ChartTypeToggle chartTypes={config.chartTypes} active={spec.chart} />
      </Section>

      <Section title={spec.chart === 'scatter' ? 'Y measure' : 'Measure'}>
        <MeasurePicker config={config} active={spec.measure} field="measure" geoLevel={geoLevel} />
      </Section>

      {spec.chart === 'scatter' && (
        <Section title="X measure">
          <MeasurePicker
            config={config}
            active={spec.scatterX ?? 'per_gdp'}
            field="scatterX"
            geoLevel={geoLevel}
          />
        </Section>
      )}

      {(spec.chart === 'treemap' || spec.chart === 'choropleth') && (
        <Section title="Year">
          <SingleYearPicker
            min={meta.years[0]}
            max={meta.years[meta.years.length - 1]}
            value={spec.singleYear ?? meta.years[meta.years.length - 1]}
          />
        </Section>
      )}

      <Section title="Geography">
        <GeoLevelToggle active={geoLevel} />
        {geoLevel === 'world' && <p className="explorer-hint">Showing world total.</p>}
        {geoLevel === 'region' && (
          <RegionPicker regions={meta.regions} selected={spec.filters.geo ?? []} />
        )}
        {geoLevel === 'country' && (
          <CountryPicker countries={countries} selected={spec.filters.geo ?? []} />
        )}
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

// ── Preset selector (dropdown — keeps the sidebar compact) ────────────────

function PresetSelect({ presets, activeId }: { presets: PresetSpec[]; activeId?: string }) {
  const useStore = useSpecStoreHook();
  const loadPreset = useStore(
    (s: { loadPreset: (spec: PresetSpec['spec']) => void }) => s.loadPreset,
  );
  const active = presets.find((p) => p.id === activeId);
  return (
    <>
      <select
        className="explorer-preset-select"
        value={activeId ?? ''}
        onChange={(e) => {
          const next = presets.find((p) => p.id === e.target.value);
          if (next) loadPreset({ ...next.spec, preset: next.id });
        }}
      >
        <option value="" disabled>
          {activeId ? '— custom (modified) —' : 'Pick a starting view…'}
        </option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      {active && <p className="explorer-hint">{active.blurb}</p>}
    </>
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

function MeasurePicker({
  config,
  active,
  field,
  geoLevel,
}: {
  config: ExplorerConfig;
  active: MeasureName;
  field: 'measure' | 'scatterX';
  geoLevel: 'world' | 'region' | 'country';
}) {
  const useStore = useSpecStoreHook();
  const setMeasure = useStore((s: { setMeasure: (m: MeasureName) => void }) => s.setMeasure);
  const setScatterX = useStore((s: { setScatterX: (m: MeasureName) => void }) => s.setScatterX);
  const setter = field === 'scatterX' ? setScatterX : setMeasure;
  void geoLevel;
  return (
    <div className="explorer-chip-group" role="radiogroup">
      {config.measures.map((m) => (
        <button
          key={m.name}
          role="radio"
          aria-checked={m.name === active}
          className={`explorer-chip ${m.name === active ? 'is-active' : ''}`}
          onClick={() => setter(m.name)}
          type="button"
          title={m.units}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function SingleYearPicker({ min, max, value }: { min: number; max: number; value: number }) {
  const useStore = useSpecStoreHook();
  const setSingleYear = useStore((s: { setSingleYear: (y: number) => void }) => s.setSingleYear);
  return (
    <div className="explorer-year-range">
      <div className="explorer-year-readout">
        <span>{value}</span>
      </div>
      <div className="explorer-range-track">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setSingleYear(Number(e.target.value))}
          aria-label="Year"
        />
      </div>
      <div className="explorer-year-bounds">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function GeoLevelToggle({ active }: { active: 'world' | 'region' | 'country' }) {
  const useStore = useSpecStoreHook();
  const setGeoLevel = useStore(
    (s: { setGeoLevel: (l: 'world' | 'region' | 'country') => void }) => s.setGeoLevel,
  );
  return (
    <div className="explorer-toggle-row">
      {(['world', 'region', 'country'] as const).map((level) => (
        <button
          key={level}
          type="button"
          className={`explorer-toggle ${active === level ? 'is-active' : ''}`}
          onClick={() => setGeoLevel(level)}
        >
          {level === 'world' ? 'World' : level === 'region' ? 'Regions' : 'Countries'}
        </button>
      ))}
    </div>
  );
}

function RegionPicker({ regions, selected }: { regions: string[]; selected: string[] }) {
  const useStore = useSpecStoreHook();
  const toggle = useStore(
    (s: { toggleFilterValue: (dim: string, v: string) => void }) => s.toggleFilterValue,
  );
  const setFilter = useStore(
    (s: { setFilter: (dim: string, v: string[]) => void }) => s.setFilter,
  );
  const allSelected = selected.length === 0;
  return (
    <>
      <div className="explorer-chip-group">
        <button
          type="button"
          className={`explorer-chip ${allSelected ? 'is-active' : ''}`}
          onClick={() => setFilter('geo', [])}
        >
          All
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
        {allSelected ? 'All 8 regions' : `${selected.length} region${selected.length === 1 ? '' : 's'} selected`}
      </p>
    </>
  );
}

const COUNTRY_SOFT_CAP = 15;

function CountryPicker({
  countries,
  selected,
}: {
  countries: string[] | undefined;
  selected: string[];
}) {
  const useStore = useSpecStoreHook();
  const toggle = useStore(
    (s: { toggleFilterValue: (dim: string, v: string) => void }) => s.toggleFilterValue,
  );
  const setFilter = useStore(
    (s: { setFilter: (dim: string, v: string[]) => void }) => s.setFilter,
  );
  const lazy = useLazyLayer('flowsCountries');
  const [query, setQuery] = useState('');

  useEffect(() => {
    lazy.request();
  }, [lazy]);

  const lc = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!countries) return [];
    if (!lc) return countries.slice(0, 12);
    return countries.filter((c) => c.toLowerCase().includes(lc)).slice(0, 20);
  }, [countries, lc]);

  return (
    <>
      {selected.length > 0 && (
        <div className="explorer-chip-group">
          {selected.map((c) => (
            <button
              key={c}
              type="button"
              className="explorer-chip is-active"
              onClick={() => toggle('geo', c)}
              title="Click to remove"
            >
              {c} ×
            </button>
          ))}
          <button
            type="button"
            className="explorer-chip"
            onClick={() => setFilter('geo', [])}
            title="Clear all"
          >
            Clear
          </button>
        </div>
      )}
      <input
        type="text"
        className="explorer-search-input"
        placeholder={countries ? `Search ${countries.length} countries…` : 'Loading countries…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={!countries}
      />
      {lazy.loading && !countries && <p className="explorer-hint">Loading ~7 MB country layer…</p>}
      {lazy.error && <p className="explorer-hint" style={{ color: '#b00020' }}>Failed to load: {lazy.error}</p>}
      {countries && (
        <div className="explorer-chip-group">
          {matches.map((c) => {
            const isSelected = selected.includes(c);
            const atCap = !isSelected && selected.length >= COUNTRY_SOFT_CAP;
            return (
              <button
                key={c}
                type="button"
                className={`explorer-chip explorer-chip-small ${isSelected ? 'is-active' : ''}`}
                onClick={() => toggle('geo', c)}
                disabled={atCap}
                title={atCap ? `Soft cap of ${COUNTRY_SOFT_CAP}; remove one first` : undefined}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}
      <p className="explorer-hint">
        {selected.length === 0
          ? 'Pick countries to compare. World totals show if none selected.'
          : `${selected.length} selected${selected.length >= COUNTRY_SOFT_CAP ? ' (soft cap)' : ''}.`}
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
