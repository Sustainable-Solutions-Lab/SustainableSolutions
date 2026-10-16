// Shared types for the data explorer engine.
//
// One Explorer component, many datasets: each tool (materials, calue, ...)
// instantiates an ExplorerConfig that declares its dimensions, measures,
// data sources, and presets. The engine reads the config and renders.
//
// This file is the contract; charts, sidebar, and presets all import from
// here. Per-tool configs live in src/tools/<slug>/config.ts.

// ── Charts ──────────────────────────────────────────────────────────────────

export type ChartType =
  | 'line'
  | 'area'
  | 'bar'
  | 'treemap'
  | 'choropleth'
  | 'scatter'
  | 'contour'
  // Monte Carlo ensemble views. These read the sensitivity layer and ignore
  // the dimension filters entirely — a run is not a place or a material.
  | 'runs'
  | 'levers'
  | 'importance';

/** Chart types driven by the Monte Carlo ensemble rather than the time series. */
export const ENSEMBLE_CHARTS: ChartType[] = ['runs', 'levers', 'importance'];

export function isEnsembleChart(chart: ChartType): boolean {
  return ENSEMBLE_CHARTS.includes(chart);
}

// ── Dimensions ──────────────────────────────────────────────────────────────
//
// A dimension is a categorical axis along which the dataset can be sliced.
// For materials: geo (World/region/country), material, flow type.
// For CALUE: area (country), process, product, GHG.
//
// Dimensions may declare hierarchical groupings (material → 6 groups,
// process → Agricultural/LUC, etc.) that the legend and color encoding can
// roll up to. The picker UI is hinted via `pickerType`.

export type DimensionValue = {
  id: string;
  label: string;
  /** Parent value id when this dimension nests inside another (e.g. country → region). */
  parent?: string;
};

export type Grouping = {
  id: string;
  label: string;
  /** Map from grouping bucket id → list of leaf-value ids in this dimension. */
  buckets: Record<string, string[]>;
};

export type DimensionDef = {
  name: string; // 'geo' | 'material' | 'flow' | 'process' | 'ghg' | 'product'
  label: string;
  values: DimensionValue[];
  /** Alternative groupings (e.g. material → 22 leaves vs 6 groups). */
  groupings?: Grouping[];
  pickerType: 'chips' | 'search' | 'tree';
};

// ── Measures ────────────────────────────────────────────────────────────────
//
// A measure is a derived numeric series (a y-axis value). The engine
// supplies the canonical measures (absolute / per-capita / per-GDP /
// cumulative); tools can extend with dataset-specific measures (CALUE
// adds per-hectare and per-kcal because the dataset ships them).

export type MeasureName = 'absolute' | 'per_capita' | 'per_gdp' | 'cumulative' | string;

export type MeasureDef = {
  name: MeasureName;
  label: string;
  /** Display units, e.g. 'Mt', 'Gt', 'kg/person'. */
  units: string;
  /** Optional layer key (in config.data.eagerLayers / lazyLayers) that supplies a precomputed series. */
  precomputedLayer?: string;
};

// ── Drivers and scenarios ───────────────────────────────────────────────────
//
// Drivers are the socio-economic quantities that sit upstream of material
// use. They are the only series that currently run past the historical end
// year, on the SSP trajectories the paper's projections are built from.

export type DriverName = 'population' | 'gdp' | 'gdp_per_capita';

export type ScenarioName = 'range' | 'SSP1' | 'SSP2' | 'SSP3' | 'SSP4' | 'SSP5';

export const DRIVER_LABELS: Record<DriverName, string> = {
  population: 'Population',
  gdp: 'GDP',
  gdp_per_capita: 'GDP per capita',
};

// ── Monte Carlo run cloud ───────────────────────────────────────────────────

export type RunColorName = 'ssp' | 'decouple' | 'selected' | 't2060';

export const RUN_COLOR_LABELS: Record<RunColorName, string> = {
  ssp: 'Assigned SSP',
  decouple: 'Absolute decoupling',
  selected: 'Beats its own growth',
  t2060: 'Warming in 2060',
};

// ── Spec (the URL-encoded explorer state) ───────────────────────────────────
//
// The user's current view, fully serializable. Encoded into location.hash
// so any view is shareable via URL.

export type Spec = {
  preset?: string;

  chart: ChartType;

  /** Geography aggregation level. Determines which data layer the chart sources from. */
  geoLevel?: 'world' | 'region' | 'country';

  /** Dimension filter selections: dimension name → list of selected value ids. */
  filters: Record<string, string[]>;
  /** Optional grouping per dimension (e.g. 'category' vs 'group' for material). */
  groupings?: Record<string, string>;

  yearRange: [number, number];
  measure: MeasureName;

  colorBy?: string; // dimension name
  facetBy?: string; // dimension name
  stack?: boolean;
  normalize?: boolean;

  /**
   * Draw a driver series (population / GDP / GDP per capita) instead of
   * material flows. Drivers ignore the material filters and carry SSP
   * projections past the historical end year.
   */
  driver?: DriverName;
  /**
   * Which scenario to draw past the historical end: a single SSP, or 'range'
   * for the median across SSP1-5 with the full spread as a band.
   */
  scenario?: ScenarioName;

  /**
   * How to colour the Monte Carlo run cloud: by the SSP each run was assigned,
   * by whether it decouples outright, by whether it beats its own growth, or
   * by the 2060 warming it implies.
   */
  runColor?: RunColorName;

  // Chart-specific
  scatterX?: MeasureName;
  singleYear?: number;
  contourOp?: 'product' | 'sum';
  contourLevels?: number[];
  showPoints?: boolean;
};

// ── Preset ──────────────────────────────────────────────────────────────────

export type PresetSpec = {
  id: string;
  title: string;
  blurb: string;
  spec: Spec;
};

// ── Config (the per-tool instantiation) ─────────────────────────────────────

export type ExplorerConfig = {
  slug: string;
  title: string;
  description: string;
  citation?: {
    authors: string;
    title: string;
    journal: string;
    year: number;
    url: string;
  };

  dimensions: DimensionDef[];
  measures: MeasureDef[];
  chartTypes: ChartType[];
  presets: PresetSpec[];

  yearRange: [number, number];

  /**
   * Last year reachable when a projected series is on screen. Omitted for
   * tools whose data stops at the observed record.
   */
  projectionEnd?: number;

  /** JSON layers to fetch. Keys become entries in the loaded DataBundle. */
  data: {
    /** Shipped in public/tools/<slug>/ — fetched eagerly on mount. */
    eagerLayers: Record<string, string>;
    /** On R2; fetched lazily when needed. */
    lazyLayers?: Record<string, string>;
  };

  /** Optional per-tool capability overrides (hide knobs that don't apply). */
  capabilities?: Partial<Record<keyof Spec, boolean>>;
  /** Optional color palette overrides per dimension. */
  colorPalettes?: Partial<Record<string, string[]>>;
};

// ── Loaded data bundle ──────────────────────────────────────────────────────
//
// The shape returned by the data loader after fetching all eager layers.
// Keys match config.data.eagerLayers. Values are the parsed JSON; the
// engine doesn't enforce a strict schema here so per-tool configs can ship
// arbitrary precomputed structures.

export type DataBundle = Record<string, unknown>;
