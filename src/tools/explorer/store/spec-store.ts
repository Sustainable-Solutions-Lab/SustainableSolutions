import { create } from 'zustand';
import type { ChartType, ExplorerConfig, MeasureName, Spec } from '../types';
import { readSpecFromHash, writeSpecToHash } from './url-codec';

// Single source of truth for the explorer's current view. Hydrates from
// location.hash on init (so a shared URL lands the user on the right
// spec), and writes back debounced changes so any state mutation is
// shareable. Per-tool defaults come from the ExplorerConfig.

type SpecStore = {
  spec: Spec;
  setSpec: (updater: Spec | ((prev: Spec) => Spec)) => void;
  setChart: (chart: ChartType) => void;
  setMeasure: (measure: MeasureName) => void;
  setScatterX: (measure: MeasureName) => void;
  setSingleYear: (year: number) => void;
  setYearRange: (range: [number, number]) => void;
  setFilter: (dim: string, values: string[]) => void;
  toggleFilterValue: (dim: string, value: string) => void;
  setGrouping: (dim: string, grouping: string) => void;
  loadPreset: (spec: Spec) => void;
};

// Default spec for a tool if neither URL nor a preset specifies one.
// Picks the first chart type and first measure declared in the config,
// with all dimensions unfiltered (empty filter array = "all values").
export function defaultSpec(config: ExplorerConfig): Spec {
  return {
    chart: config.chartTypes[0] ?? 'line',
    measure: config.measures[0]?.name ?? 'absolute',
    yearRange: config.yearRange,
    filters: Object.fromEntries(config.dimensions.map((d) => [d.name, []])),
    groupings: {},
  };
}

// One store factory per Explorer mount — avoids cross-tool state collisions
// if two explorers ever coexist on the same page.
export function createSpecStore(config: ExplorerConfig) {
  const initial = readSpecFromHash() ?? defaultSpec(config);

  return create<SpecStore>((set, get) => ({
    spec: initial,

    setSpec: (updater) => {
      const next = typeof updater === 'function' ? updater(get().spec) : updater;
      set({ spec: next });
      scheduleHashWrite(next);
    },

    setChart: (chart) => get().setSpec((s) => ({ ...s, chart, preset: undefined })),
    setMeasure: (measure) => get().setSpec((s) => ({ ...s, measure, preset: undefined })),
    setScatterX: (scatterX) => get().setSpec((s) => ({ ...s, scatterX, preset: undefined })),
    setSingleYear: (singleYear) => get().setSpec((s) => ({ ...s, singleYear, preset: undefined })),
    setYearRange: (yearRange) => get().setSpec((s) => ({ ...s, yearRange, preset: undefined })),
    setFilter: (dim, values) =>
      get().setSpec((s) => ({
        ...s,
        filters: { ...s.filters, [dim]: values },
        preset: undefined,
      })),
    toggleFilterValue: (dim, value) =>
      get().setSpec((s) => {
        const current = s.filters[dim] ?? [];
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...s, filters: { ...s.filters, [dim]: next }, preset: undefined };
      }),
    setGrouping: (dim, grouping) =>
      get().setSpec((s) => ({
        ...s,
        groupings: { ...(s.groupings ?? {}), [dim]: grouping },
        preset: undefined,
      })),
    loadPreset: (spec) => {
      set({ spec });
      scheduleHashWrite(spec);
    },
  }));
}

// Debounce URL writes so dragging a slider doesn't update the hash on every
// pixel of movement.
let hashWriteTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleHashWrite(spec: Spec) {
  if (hashWriteTimer) clearTimeout(hashWriteTimer);
  hashWriteTimer = setTimeout(() => writeSpecToHash(spec), 250);
}
