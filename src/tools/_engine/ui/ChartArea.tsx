import { useEffect, useRef } from 'react';
import type { DataBundle, ExplorerConfig, Spec } from '../types';
import { DRIVER_LABELS, isEnsembleChart } from '../types';
import { useSpecStoreHook } from '../store/context';
import { useLazyLayer } from '../data/lazy-context';
import {
  derive,
  deriveTreemap,
  deriveScatter,
  deriveChoropleth,
  deriveContour,
  deriveImportance,
  deriveLevers,
  deriveRuns,
} from '../data/derive';
import LineChart from '../charts/LineChart';
import AreaChart from '../charts/AreaChart';
import BarChart from '../charts/BarChart';
import TreemapChart from '../charts/TreemapChart';
import ScatterChart from '../charts/ScatterChart';
import Choropleth from '../charts/Choropleth';
import ContourChart from '../charts/ContourChart';
import RunCloudChart from '../charts/RunCloudChart';
import TornadoChart from '../charts/TornadoChart';
import ImportanceChart from '../charts/ImportanceChart';
import Legend from '../charts/Legend';
import ChartToolbar from './ChartToolbar';

type Meta = {
  yearRange: [number, number];
  years: number[];
  regions: string[];
  materials: { id: string; label: string; group: string | null }[];
  groups: { id: string; label: string; members: string[] }[];
  flows?: { id: string; label: string; eager: boolean }[];
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

  // Likewise the five non-DMC accounts, which ride their own layer.
  const extraFlowsLayer = useLazyLayer('flowsExtra');
  const flow = spec.filters.flow?.[0] ?? 'DMC';
  useEffect(() => {
    if (flow !== 'DMC') extraFlowsLayer.request();
  }, [flow, extraFlowsLayer]);

  return (
    <div className="explorer-chart-pane">
      <div className="explorer-chart-headerbar">
        <ChartHeader spec={spec} config={config} meta={meta} data={data} />
        <ChartToolbar spec={spec} data={data} containerRef={bodyRef} />
      </div>
      <div className="explorer-chart-body" ref={bodyRef}>
        <ChartSwitch
          spec={spec}
          data={data}
          meta={meta}
          countriesLoading={countriesLayer.loading}
        />
      </div>
      <ChartFooter spec={spec} data={data} />
      <style>{styles}</style>
    </div>
  );
}

function ChartSwitch({
  spec,
  data,
  meta,
  countriesLoading,
}: {
  spec: Spec;
  data: DataBundle;
  meta: Meta;
  countriesLoading: boolean;
}) {
  const geoLevel = spec.geoLevel ?? 'world';
  if (
    geoLevel === 'country' &&
    (spec.filters.geo ?? []).length === 0 &&
    spec.chart !== 'choropleth' &&
    !isEnsembleChart(spec.chart)
  ) {
    return <EmptyState>Pick one or more countries from the sidebar to draw the chart.</EmptyState>;
  }

  switch (spec.chart) {
    case 'line':
    case 'area':
    case 'bar': {
      const derived = derive(data, spec);
      if (derived.pending) return <EmptyState>Loading {flowLabel(spec, meta)}…</EmptyState>;
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
    case 'runs': {
      const derived = deriveRuns(data, spec);
      if (derived.count === 0) return <EmptyState>Monte Carlo runs not available.</EmptyState>;
      return <RunCloudChart data={derived} />;
    }
    case 'levers': {
      const derived = deriveLevers(data, spec);
      if (derived.bars.length === 0) return <EmptyState>Lever effects not available.</EmptyState>;
      return <TornadoChart data={derived} />;
    }
    case 'importance': {
      const derived = deriveImportance(data, spec);
      if (derived.bins.length === 0) return <EmptyState>Lever importance not available.</EmptyState>;
      return <ImportanceChart data={derived} />;
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

// The selected account's own name, for loading and title copy.
function flowLabel(spec: Spec, meta: Meta): string {
  const id = spec.filters.flow?.[0] ?? 'DMC';
  return meta.flows?.find((f) => f.id === id)?.label ?? id;
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
  data,
}: {
  spec: Spec;
  config: ExplorerConfig;
  meta: Meta;
  data: DataBundle;
}) {
  const measure = config.measures.find((m) => m.name === spec.measure);
  if (isEnsembleChart(spec.chart)) return <EnsembleHeader spec={spec} data={data} />;
  if (spec.driver) {
    const geoPart = geographyTitlePart(spec);
    const scenario = spec.scenario ?? 'range';
    const projected = spec.yearRange[1] > config.yearRange[1];
    return (
      <div className="explorer-chart-header">
        <h2 className="explorer-chart-title">
          {DRIVER_LABELS[spec.driver]}
          {geoPart ? ` in ${geoPart}` : ''}
        </h2>
        <p className="explorer-chart-subtitle">
          {spec.yearRange[0]}–{spec.yearRange[1]}
          {projected
            ? ` · observed to ${config.yearRange[1]}, then ${
                scenario === 'range' ? 'the SSP1–5 range' : scenario
              }`
            : ' · observed'}
        </p>
      </div>
    );
  }
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
  const flowId = spec.filters.flow?.[0] ?? 'DMC';
  if (flowId !== 'DMC') subtitle += ` · ${flowLabel(spec, meta)}`;
  return (
    <div className="explorer-chart-header">
      <h2 className="explorer-chart-title">{title}</h2>
      <p className="explorer-chart-subtitle">{subtitle}</p>
    </div>
  );
}

// The ensemble views are not a slice of the time series, so they get their
// own titles rather than the material/geography construction.
function EnsembleHeader({ spec, data }: { spec: Spec; data: DataBundle }) {
  let title = '';
  let subtitle = '';
  if (spec.chart === 'runs') {
    const derived = deriveRuns(data, spec);
    title = 'Material growth against the growth that drives it';
    subtitle = `${derived.count.toLocaleString()} Monte Carlo runs · ${derived.window[0]}–${derived.window[1]} · coloured by ${derived.colorLabel}`;
  } else if (spec.chart === 'levers') {
    const derived = deriveLevers(data, spec);
    title = 'What each lever is worth';
    subtitle = `${derived.bars.length} levers · effect on material growth ${derived.window[0]}–${derived.window[1]}, with 95% confidence intervals`;
  } else {
    const derived = deriveImportance(data, spec);
    title = 'What explains the spread';
    subtitle = `Attributed importance within each material growth bin · ${derived.bins.length} bins`;
  }
  return (
    <div className="explorer-chart-header">
      <h2 className="explorer-chart-title">{title}</h2>
      <p className="explorer-chart-subtitle">{subtitle}</p>
    </div>
  );
}

function EnsembleFooter({ spec, data }: { spec: Spec; data: DataBundle }) {
  if (spec.chart === 'runs') {
    const d = deriveRuns(data, spec);
    if (d.count === 0) return null;
    // "All of them" is the finding here, and it reads as a finding only if
    // the sentence says so rather than printing 100%.
    const relative =
      d.stats.relative === d.count
        ? 'Every run grows material use more slowly than GDP'
        : `${d.stats.relative.toLocaleString()} of ${d.count.toLocaleString()} runs grow material use more slowly than GDP`;
    return (
      <p className="explorer-chart-note">
        {`Median run grows material use ${d.stats.medianMat.toFixed(2)}%/yr on GDP growth of ${d.stats.medianGdp.toFixed(2)}%/yr. `}
        {`${relative}, but only ${d.stats.decouple} of ${d.count.toLocaleString()} get below zero. `}
        {d.note}
      </p>
    );
  }
  if (spec.chart === 'levers') {
    const d = deriveLevers(data, spec);
    if (d.bars.length === 0) return null;
    return (
      <>
        <div className="explorer-family-key">
          {d.families.map((f) => (
            <span key={f.label} className="explorer-family-item">
              <span className="explorer-family-swatch" style={{ background: f.color }} />
              {f.label}
            </span>
          ))}
        </div>
        <p className="explorer-chart-note">
          Each bar is the effect of the change printed beside it, so bars are read row by row and
          not ranked against each other. Faded bars are not distinguishable from zero. {d.note}
        </p>
      </>
    );
  }
  const d = deriveImportance(data, spec);
  if (d.bins.length === 0) return null;
  return <p className="explorer-chart-note">{d.note}</p>;
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
  if (isEnsembleChart(spec.chart)) return <EnsembleFooter spec={spec} data={data} />;
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
  return (
    <>
      <Legend series={derived.series} />
      {derived.bandLabel && <p className="explorer-chart-note">{derived.bandLabel}</p>}
    </>
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
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--ink-2);
    margin: 0 0 2px 0;
  }
  .explorer-chart-subtitle {
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
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
  .explorer-chart-note {
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 11px;
    letter-spacing: 0.03em;
    color: var(--ink-3);
    margin: 2px 0 0 0;
  }
  .explorer-family-key {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 4px;
  }
  .explorer-family-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 10px;
    letter-spacing: 0.03em;
    color: var(--ink-2);
  }
  .explorer-family-swatch {
    width: 9px;
    height: 9px;
    border-radius: 1px;
    display: inline-block;
  }
  .explorer-chart-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-3);
    font-family: var(--font-mono, 'Inter', system-ui, sans-serif);
    font-size: 12px;
  }
`;
