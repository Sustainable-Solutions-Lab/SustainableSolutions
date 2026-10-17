// Busch et al. material-projection model, ported from the paper's R pipeline so
// the explorer can run it live while someone drags a slider.
//
// Upstream: github.com/pmbusch/material-intensity
//   Scripts/04-Simulation/02-RunSimulations.R  (STEP 4 trajectories, STEP 5 worker)
//   Scripts/00-Functions/dsm_functions.R       (run_forward_dsm_fast, allocate_eol)
//   Scripts/04-Simulation/01-Sampling.R        (how a [0,1] draw becomes a parameter)
//
// Two sub-models, as in the paper:
//   flows  (biomass, fossil fuels) — Kaya: M = P x GDP/cap x material intensity
//   stocks (metal ores, non-metallic minerals) — the same identity on STOCK,
//          then a dynamic stock model turns a stock path into the consumption
//          needed to build it and replace what retires, less what recycling or
//          downcycling supplies.
//
// What this port leaves out: the explicit power-sector stock Pablo added on top
// (generation + storage capacity as four extra end uses). That refinement needs
// a 17 MB per-scenario capacity table, so the explorer runs the model without it
// and therefore also without the matching carve-out from civil-engineering
// stock — i.e. power materials stay inside civil engineering, where they sat
// before that refinement. MODEL_NOTE below says so in the UI's own words.

export const MODEL_NOTE =
  'Runs the paper’s model in your browser. Electricity generation and storage are ' +
  'carried inside civil infrastructure rather than modelled as their own stock, so ' +
  'totals differ slightly from the published runs.';

// ── Shapes of the data layer (built by scripts/build-materials.js) ──────────

export type FlowKey = 'crops' | 'grazed_biomass' | 'wood' | 'other_biomass' | 'coal' | 'gas' | 'oil' | 'other_fossil';
export type StockMaterial = 'Metal_Fe' | 'Metal_NonFe' | 'Non-metallic minerals';
export type StockGroup = 'metal_ores' | 'nonmetallic_minerals';
export type SuperUse = 'buildings' | 'civil' | 'machinery' | 'sl_products';
/** Lifetime draws are shared across the products inside one of these. */
export type LifetimeGroup = 'buildings' | 'civil_infrastructure' | 'machinery' | 'short_lived';
export type SubUse =
  | 'residential'
  | 'non_residential'
  | 'roads'
  | 'civil_engineering'
  | 'machinery_group'
  | 'vehicles_group'
  | 'durables'
  | 'packaging';

export interface ModelInputs {
  regions: string[];
  sspSampled: string[];
  years: number[];
  baseYear: number;
  forecastEnd: number;
  /** 2024 = 1, by scenario / region / year. */
  popIndex: Record<string, Record<string, number[]>>;
  gdppcIndex: Record<string, Record<string, number[]>>;
  gdp2024: Record<string, number>;
  pop2024: Record<string, number>;
  /** 2024 DMC in Mt, by region / UNEP label. */
  m2024: Record<string, Record<string, number>>;
  flowInt2024: Record<string, Partial<Record<FlowKey, number>>>;
  stockInt2024: Record<StockGroup, Record<string, Record<SuperUse, number>>>;
  /** endpoint / 2024 ratio bounds: flows by material / scenario / region. */
  flowRatioBounds: Record<string, Record<string, Record<string, [number, number]>>>;
  stockRatioBounds: Record<StockGroup, Record<SuperUse, Record<string, [number, number]>>>;
  /** World kg/USD equivalent of a draw, for sliders in real units. */
  intensityWorldBounds: Record<string, { min: number; max: number; base: number }>;
  stock2024: Record<StockMaterial, Record<string, Partial<Record<SubUse, number>>>>;
  ageProfile: Record<StockMaterial, Record<string, Partial<Record<SubUse, { start: number; stocks: number[] }>>>>;
  stockGrowthHist: Record<StockMaterial, Record<string, Partial<Record<SubUse, number>>>>;
  recyclingNow: { fe: Record<string, number>; nonfe: Record<string, number> };
  downcyclingNow: Record<string, number>;
  lifetimes: Record<
    SubUse,
    {
      superCategory: LifetimeGroup;
      meanLife: number;
      k: number;
      meanMin: number;
      meanMax: number;
      kMin: number;
      kMax: number;
    }
  >;
  mcParams: Record<string, { min: number; central: number; max: number }>;
  gradeOre2024: { fe: number; nonfe: number };
  /**
   * Each SSP's own intensity target in kg/USD, by region — the assumption set
   * behind the paper's SSP narratives, so an SSP scenario here is the paper's
   * scenario rather than something close to it.
   */
  sspTargets: {
    flow: Partial<Record<FlowKey, Record<string, Record<string, number>>>>;
    stock: Record<StockGroup, Partial<Record<SuperUse, Record<string, Record<string, number>>>>>;
  };
}

// ── Levers ──────────────────────────────────────────────────────────────────
// Intensity levers stay in the model's own [0,1] draw space: one draw is shared
// by every region and mapped into each region's own bounds, which is what keeps
// a single slider from flattening regional difference. worldIntensity() converts
// a draw to the kg/USD a slider can show.

export interface Levers {
  /** Socioeconomic position, 0 = slowest-growth SSP, 1 = fastest. */
  sspU: number;
  /** Per-material intensity draws; omitted keys sit at their central value. */
  flowIntensityU: Partial<Record<FlowKey, number>>;
  stockIntensityU: Partial<Record<StockGroup, Partial<Record<SuperUse, number>>>>;
  /** End-of-life recovery rates reached by convergenceYear. */
  recyclingFe: number;
  recyclingNonFe: number;
  downcycling: number;
  /** Ore grade (t metal per t ore) reached by targetYear. */
  gradeOreFe: number;
  gradeOreNonFe: number;
  targetYear: number;
  convergenceYear: number;
  /** Mineral secondary-market room; central values unless someone changes them. */
  maxSecondaryBuildCivil: number;
  maxSecondaryRoads: number;
  shareConcreteBuildings: number;
  shareConcreteCivil: number;
  shareAggConcrete: number;
  shareGranularRoad: number;
  /**
   * Lifetime draws per end use, within the published min-max range for each
   * product inside it. 0.5 reproduces the paper's central lifetimes exactly.
   */
  lifetimeU: Partial<Record<LifetimeGroup, { mean: number; k: number }>>;
  /**
   * Intensity endpoints in kg/USD per region, overriding the draw for that
   * material. The SSP scenarios use this so each region gets the SSP's own
   * target instead of one world-average draw stretched across every region.
   */
  flowEndpoint?: Partial<Record<FlowKey, Record<string, number>>>;
  stockEndpoint?: Partial<Record<StockGroup, Partial<Record<SuperUse, Record<string, number>>>>>;
}

export function defaultLevers(inputs: ModelInputs): Levers {
  const p = (name: string) => inputs.mcParams[name]?.central ?? 0;
  return {
    sspU: 0.5,
    flowIntensityU: {},
    stockIntensityU: {},
    recyclingFe: p('RECYCLING_RATE_FE'),
    recyclingNonFe: p('RECYCLING_RATE_NONFE'),
    downcycling: p('DOWNCYCLING'),
    gradeOreFe: p('GRADE_ORE_FE'),
    gradeOreNonFe: p('GRADE_ORE_NONFE'),
    targetYear: Math.round(p('TARGET_YEAR')),
    convergenceYear: Math.round(p('RECYC_CONVERGENCE_YR')),
    maxSecondaryBuildCivil: p('MAX_SECONDARY_BUILD_CIVIL'),
    maxSecondaryRoads: p('MAX_SECONDARY_ROADS'),
    shareConcreteBuildings: p('SHARE_CONCRETE_BUILDINGS'),
    shareConcreteCivil: p('SHARE_CONCRETE_CIVIL'),
    shareAggConcrete: p('SHARE_AGG_CONCRETE'),
    shareGranularRoad: p('SHARE_GRANULAR_ROAD'),
    lifetimeU: {},
  };
}

// ── Label maps, mirrored from the R config ──────────────────────────────────

export const BIOMASS_LABEL: Record<string, string> = {
  crops: 'Crops',
  grazed_biomass: 'Grazed biomass and fodder crops',
  other_biomass: 'Other biomass',
  wood: 'Wood',
};
export const FOSSIL_LABEL: Record<string, string> = {
  coal: 'Coal',
  gas: 'Natural Gas',
  oil: 'Petroleum',
  other_fossil: 'Other fossil fuels',
};
export const SUB_USE_BY_SUPER: Record<SuperUse, SubUse[]> = {
  buildings: ['residential', 'non_residential'],
  civil: ['roads', 'civil_engineering'],
  sl_products: ['durables', 'packaging'],
  machinery: ['machinery_group', 'vehicles_group'],
};
export const SUB_USE_LABEL: Record<SubUse, string> = {
  residential: 'Residential',
  non_residential: 'Non-residential',
  roads: 'Roads',
  civil_engineering: 'Civil engineering',
  machinery_group: 'Machinery',
  vehicles_group: 'Vehicles',
  durables: 'Durables',
  packaging: 'Packaging',
};
/**
 * The leaf a group can be broken into, named as the historical UNEP data names
 * it so the same choice draws both the measured past and the projection.
 * Non-metallic minerals have no leaf: the model carries them as one material.
 */
export const GROUP_LEAVES: Record<GroupKey, string[]> = {
  biomass: ['Crops', 'Crop Residues', 'Grazed biomass and fodder crops', 'Wood', 'Other biomass'],
  fossil_fuels: ['Coal', 'Natural Gas', 'Petroleum', 'Other fossil fuels'],
  metal_ores: ['Ferrous ores', 'Non-ferrous ores'],
  nonmetallic_minerals: [],
};

/** Stock material -> the leaf its ore is reported under. */
const STOCK_LEAF: Record<StockMaterial, string> = {
  Metal_Fe: 'Ferrous ores',
  Metal_NonFe: 'Non-ferrous ores',
  'Non-metallic minerals': 'Non-metallic minerals',
};

/** The two flow groups' materials, and which draw each one follows. */
const FLOW_MATERIALS: { key: FlowKey; group: 'biomass' | 'fossil_fuels'; fixed: boolean }[] = [
  { key: 'crops', group: 'biomass', fixed: false },
  { key: 'grazed_biomass', group: 'biomass', fixed: false },
  { key: 'wood', group: 'biomass', fixed: false },
  { key: 'other_biomass', group: 'biomass', fixed: true },
  { key: 'coal', group: 'fossil_fuels', fixed: false },
  { key: 'gas', group: 'fossil_fuels', fixed: false },
  { key: 'oil', group: 'fossil_fuels', fixed: false },
  { key: 'other_fossil', group: 'fossil_fuels', fixed: true },
];
export const LIFETIME_GROUP_OF: Record<SuperUse, LifetimeGroup> = {
  buildings: 'buildings',
  civil: 'civil_infrastructure',
  machinery: 'machinery',
  sl_products: 'short_lived',
};
export const LIFETIME_GROUP_LABEL: Record<LifetimeGroup, string> = {
  buildings: 'Buildings',
  civil_infrastructure: 'Civil infrastructure',
  machinery: 'Machinery and vehicles',
  short_lived: 'Short-lived products',
};

/** Non-metallic minerals hold no sampled stock in machinery or short-lived goods. */
const FIXED_NONMET_SUPER: SuperUse[] = ['machinery', 'sl_products'];
const SUPER_USES: SuperUse[] = ['buildings', 'civil', 'machinery', 'sl_products'];
const STOCK_GROWTH_BLEND_YRS = 3;

// ── Small numerics ──────────────────────────────────────────────────────────

/** Lanczos gamma; the DSM needs it only for the Weibull mean-to-scale step. */
function gammaFn(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  const zz = z - 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (zz + i + 1);
  const t = zz + g.length - 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, zz + 0.5) * Math.exp(-t) * x;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ── Intensity ramp ──────────────────────────────────────────────────────────
// Intensity rises or falls geometrically from its 2024 value to the chosen
// endpoint, eased by alpha. The guards matter: a handful of region-material
// cells have a NEGATIVE 2024 intensity, because DMC is extraction plus net
// imports and a net exporter of processed fuel can come out below zero. The R
// model clamps the ramp but divides by the raw 2024 value, which collapses
// those cells to roughly nothing rather than letting a negative anchor grow.
// Flows divide by the signed value and stocks by its magnitude; the two differ
// only in that pathological case, so they are kept apart rather than unified.
function rampIndex(int2024: number, endpoint: number, alpha: Float64Array, signed: boolean): Float64Array {
  const n = alpha.length;
  const base = Math.max(int2024, 1e-12);
  const end = Math.max(endpoint, 1e-12);
  const out = new Float64Array(n);
  if (signed && Math.abs(int2024) < 1e-12) {
    out.fill(1);
    return out;
  }
  const denom = signed ? int2024 : Math.max(Math.abs(int2024), 1e-12);
  for (let i = 0; i < n; i++) out[i] = (base * Math.pow(end / base, alpha[i])) / denom;
  return out;
}

// ── Socioeconomic position ──────────────────────────────────────────────────
// One draw sets the world's 2024→2060 GDP-per-capita growth, spread evenly
// between the slowest and fastest sampled SSP. The two SSPs that bracket that
// growth are blended with the share that reproduces it exactly, and the same
// pair and share then drive population, income and the flow-intensity bounds.

export interface SspBlend {
  lo: string;
  hi: string;
  shareLo: number;
  label: string;
  /** Target and achieved world GDP/capita growth, and world population growth. */
  gdppcGrowth: number;
  popGrowth: number;
}

interface SspRank {
  scenario: string;
  growth: number;
}

function worldGrowth(
  inputs: ModelInputs,
  lo: string,
  hi: string,
  shareLo: number,
  gdppc0World: number,
  endIdx: number,
): { gdppc: number; pop: number } {
  let pSum = 0;
  let pySum = 0;
  let pop0Sum = 0;
  for (const r of inputs.regions) {
    const pop0 = inputs.pop2024[r];
    const gdppc0 = inputs.gdp2024[r] / pop0;
    const p = pop0 * (shareLo * inputs.popIndex[lo][r][endIdx] + (1 - shareLo) * inputs.popIndex[hi][r][endIdx]);
    const y = gdppc0 * (shareLo * inputs.gdppcIndex[lo][r][endIdx] + (1 - shareLo) * inputs.gdppcIndex[hi][r][endIdx]);
    pSum += p;
    pySum += p * y;
    pop0Sum += pop0;
  }
  const yrs = inputs.forecastEnd - inputs.baseYear;
  return {
    gdppc: Math.pow(pySum / pSum / gdppc0World, 1 / yrs) - 1,
    pop: Math.pow(pSum / pop0Sum, 1 / yrs) - 1,
  };
}

function sspRanking(inputs: ModelInputs): { rank: SspRank[]; gdppc0World: number; endIdx: number } {
  const endIdx = inputs.years.length - 1;
  let popSum = 0;
  let gdpSum = 0;
  for (const r of inputs.regions) {
    popSum += inputs.pop2024[r];
    gdpSum += inputs.gdp2024[r];
  }
  const gdppc0World = gdpSum / popSum;
  const rank = inputs.sspSampled
    .map((s) => ({ scenario: s, growth: worldGrowth(inputs, s, s, 1, gdppc0World, endIdx).gdppc }))
    .sort((a, b) => a.growth - b.growth);
  return { rank, gdppc0World, endIdx };
}

export function resolveSsp(inputs: ModelInputs, sspU: number): SspBlend {
  const { rank, gdppc0World, endIdx } = sspRanking(inputs);
  const target = rank[0].growth + clamp01(sspU) * (rank[rank.length - 1].growth - rank[0].growth);

  // Pair whose growth brackets the target (last pair when the target sits at the top).
  let k = 0;
  for (let i = 0; i < rank.length - 1; i++) if (target >= rank[i].growth) k = i;
  const lo = rank[k].scenario;
  const hi = rank[k + 1].scenario;

  // World growth falls as weight moves onto the lower SSP, so bisect on the share.
  let a = 0;
  let b = 1;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (worldGrowth(inputs, lo, hi, m, gdppc0World, endIdx).gdppc > target) a = m;
    else b = m;
  }
  const shareLo = (a + b) / 2;
  const achieved = worldGrowth(inputs, lo, hi, shareLo, gdppc0World, endIdx);

  let label = rank[0].scenario;
  let best = Infinity;
  for (const r of rank) {
    const d = Math.abs(target - r.growth);
    if (d < best) {
      best = d;
      label = r.scenario;
    }
  }
  return { lo, hi, shareLo, label, gdppcGrowth: achieved.gdppc, popGrowth: achieved.pop };
}

/** World kg/USD an intensity draw corresponds to — what a slider shows. */
export function worldIntensity(inputs: ModelInputs, param: string, u: number): number | null {
  const b = inputs.intensityWorldBounds[param];
  if (!b) return null;
  return b.min + clamp01(u) * (b.max - b.min);
}

/** Inverse of worldIntensity, for a slider that moves in kg/USD. */
export function intensityDraw(inputs: ModelInputs, param: string, kgPerUsd: number): number {
  const b = inputs.intensityWorldBounds[param];
  if (!b || b.max === b.min) return 0.5;
  return clamp01((kgPerUsd - b.min) / (b.max - b.min));
}

// ── Dynamic stock model ─────────────────────────────────────────────────────
// Cohorts in place at 2024 retire on a Weibull survival curve; each year the
// model builds whatever the target stock needs beyond what survived. Legacy
// cohorts are re-aged by Nelson's cumulative-exposure model so that changing
// the lifetime does not make the 2024 stock jump.

interface DsmResult {
  totalStock: Float64Array;
  newAdditions: Float64Array;
  replacement: Float64Array;
  production: Float64Array;
  waste: Float64Array;
}

/**
 * What the cohorts already standing in 2024 do, year by year.
 *
 * Nothing a scenario can change touches this: the stock is built, and it
 * retires on its survival curve whatever happens to demand. Only the lifetime
 * assumption moves it, so it is computed once per cell and lifetime and kept.
 * This is most of the model's arithmetic — 129 cohorts across 36 years in each
 * of 192 cells — so caching it is what makes the contour panels possible.
 */
interface LegacyPath {
  survived: Float64Array;
  waste: Float64Array;
}

const legacyCache = new Map<string, LegacyPath>();

function legacyPath(
  key: string,
  cohortStart: number,
  cohortStocks: number[],
  meanLife: number,
  k: number,
  meanLifeHist: number,
  kHist: number,
  startYear: number,
  nYears: number,
): LegacyPath {
  const cacheKey = `${key}|${meanLife}|${k}`;
  const hit = legacyCache.get(cacheKey);
  if (hit) return hit;

  const lambdaNew = meanLife / gammaFn(1 + 1 / k);
  const lambdaHist = meanLifeHist / gammaFn(1 + 1 / kHist);

  const survived = new Float64Array(nYears);
  const waste = new Float64Array(nYears);
  for (let i = 0; i < cohortStocks.length; i++) {
    const stock = cohortStocks[i];
    if (!(stock > 1e-9)) continue;
    const age = startYear - (cohortStart + i);
    const sstar = lambdaNew * Math.pow(age / lambdaHist, kHist / k);
    const sAt = Math.exp(-Math.pow(sstar / lambdaNew, k));
    if (!(sAt > 1e-3)) continue;
    const o = stock / sAt;
    let prev = stock;
    for (let t = 0; t < nYears; t++) {
      const cur = o * Math.exp(-Math.pow((t + 1 + sstar) / lambdaNew, k));
      survived[t] += cur;
      waste[t] += prev - cur;
      prev = cur;
    }
  }

  // A lifetime slider can mint a new key on every frame; keep the map bounded.
  if (legacyCache.size > 4000) legacyCache.clear();
  const path = { survived, waste };
  legacyCache.set(cacheKey, path);
  return path;
}

/**
 * Cohorts in place at 2024 retire on a Weibull survival curve; each year the
 * model builds whatever the target stock needs beyond what survived. Legacy
 * cohorts are re-aged by Nelson's cumulative-exposure model so that changing
 * the lifetime does not make the 2024 stock jump.
 */
function runForwardDsm(
  key: string,
  cohortStart: number,
  cohortStocks: number[],
  targetStock: Float64Array,
  meanLife: number,
  k: number,
  meanLifeHist: number,
  kHist: number,
  startYear: number,
  nYears: number,
): DsmResult {
  const out: DsmResult = {
    totalStock: new Float64Array(nYears),
    newAdditions: new Float64Array(nYears),
    replacement: new Float64Array(nYears),
    production: new Float64Array(nYears),
    waste: new Float64Array(nYears),
  };

  const legacy = legacyPath(key, cohortStart, cohortStocks, meanLife, k, meanLifeHist, kHist, startYear, nYears);

  const lambdaNew = meanLife / gammaFn(1 + 1 / k);
  const sGrid = new Float64Array(nYears + 1);
  for (let i = 0; i <= nYears; i++) sGrid[i] = Math.exp(-Math.pow(i / lambdaNew, k));

  // Cohorts this run builds. Year i's cohort is at index i.
  const built = new Float64Array(nYears);
  const prevNew = new Float64Array(nYears);

  for (let i = 0; i < nYears; i++) {
    const target = targetStock[i];
    if (!Number.isFinite(target)) continue;

    let survivedNew = 0;
    let wasteNew = 0;
    for (let j = 0; j < i; j++) {
      const b = built[j];
      if (b === 0) continue;
      const cur = b * sGrid[i - j];
      survivedNew += cur;
      wasteNew += prevNew[j] - cur;
      prevNew[j] = cur;
    }

    const survived = legacy.survived[i] + survivedNew;
    let waste = legacy.waste[i] + wasteNew;
    if (waste < 0) waste = 0;

    const production = Math.max(0, target - survived);
    const replacement = Math.min(waste, production);

    built[i] = production;
    prevNew[i] = production;

    out.totalStock[i] = survived + production;
    out.production[i] = production;
    out.replacement[i] = replacement;
    out.newAdditions[i] = production - replacement;
    out.waste[i] = waste;
  }
  return out;
}

// ── End-of-life allocation ──────────────────────────────────────────────────
// One pool per region-year. Recovered scrap displaces primary up to the room
// each end use has for it; anything beyond that is surplus rather than quietly
// dropped. One tonne of secondary replaces one tonne of primary.

interface EolRow {
  demand: number;
  waste: number;
  rate: number;
  room: number;
}

function allocateEol(rows: EolRow[]): { secondary: number[]; primary: number[] } {
  let pool = 0;
  let roomTotal = 0;
  for (const r of rows) {
    pool += r.rate * r.waste;
    roomTotal += r.room;
  }
  const secondaryTotal = Math.min(pool, roomTotal);
  const secondary = rows.map((r) => (roomTotal > 0 ? (secondaryTotal * r.room) / roomTotal : 0));
  return { secondary, primary: rows.map((r, i) => r.demand - secondary[i]) };
}

// ── Output ──────────────────────────────────────────────────────────────────

export type GroupKey = 'biomass' | 'fossil_fuels' | 'metal_ores' | 'nonmetallic_minerals';
export const GROUP_KEYS: GroupKey[] = ['biomass', 'fossil_fuels', 'metal_ores', 'nonmetallic_minerals'];
export const GROUP_LABEL: Record<GroupKey, string> = {
  biomass: 'Biomass',
  fossil_fuels: 'Fossil fuels',
  metal_ores: 'Metal ores',
  nonmetallic_minerals: 'Non-metallic minerals',
};

export interface ModelRun {
  years: number[];
  ssp: SspBlend;
  /** Primary consumption, Mt/yr. Metals are ore-equivalent, as in the paper. */
  primary: {
    byGroup: Record<GroupKey, Float64Array>;
    byRegionGroup: Record<string, Record<GroupKey, Float64Array>>;
    /** By leaf material, named as the historical data names it. */
    byGroupDetail: Record<GroupKey, Record<string, Float64Array>>;
    byRegionGroupDetail: Record<string, Record<GroupKey, Record<string, Float64Array>>>;
    /** Stock groups only: where the material goes, by end use. */
    byEndUse: Record<StockGroup, Record<string, Float64Array>>;
    total: Float64Array;
  };
  /** Secondary supply (recycled or downcycled), Mt/yr, ore-equivalent. */
  secondary: Record<GroupKey, Float64Array>;
  /**
   * The end-of-life pool and the demand it is measured against, both in
   * material mass rather than ore. Their ratio is the ceiling on secondary
   * supply: collect everything and you still only get this share.
   */
  scrap: Record<StockGroup, { retired: Float64Array; demand: Float64Array }>;
  /** In-use stock of the two stock materials, Mt. */
  stock: Record<'metal_ores' | 'nonmetallic_minerals', Float64Array>;
  population: Float64Array;
  gdp: Float64Array;
  popByRegion: Record<string, Float64Array>;
  gdpByRegion: Record<string, Float64Array>;
}

const zeros = (n: number) => new Float64Array(n);

function emptyGroupRecord(n: number): Record<GroupKey, Float64Array> {
  return {
    biomass: zeros(n),
    fossil_fuels: zeros(n),
    metal_ores: zeros(n),
    nonmetallic_minerals: zeros(n),
  };
}

function emptyDetailRecord(): Record<GroupKey, Record<string, Float64Array>> {
  return { biomass: {}, fossil_fuels: {}, metal_ores: {}, nonmetallic_minerals: {} };
}

export function runModel(inputs: ModelInputs, levers: Levers): ModelRun {
  const n = inputs.years.length;
  const base = inputs.baseYear;
  const ssp = resolveSsp(inputs, levers.sspU);
  const share = ssp.shareLo;

  // Time weights. alpha eases intensity from its 2024 value to the chosen
  // endpoint with zero slope at both ends: a kink here would surface as a jump
  // in consumption, because consumption tracks the slope of the stock path.
  const alpha = new Float64Array(n);
  const h10 = new Float64Array(n);
  const spanYrs = Math.max(1, levers.targetYear - base);
  const wModel = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lin = clamp01((inputs.years[i] - base) / spanYrs);
    alpha[i] = lin * lin * (3 - 2 * lin);
    h10[i] = lin * lin * lin - 2 * lin * lin + lin;
    wModel[i] = Math.min(1, (inputs.years[i] - base) / (STOCK_GROWTH_BLEND_YRS + 1));
  }

  // Recovery rates ramp from each region's own 2024 rate to the chosen endpoint.
  const convSpan = Math.max(1, levers.convergenceYear - base);
  const wRecyc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lin = clamp01((inputs.years[i] - base) / convSpan);
    wRecyc[i] = lin * lin * (3 - 2 * lin);
  }
  const rateTraj = (now: number, endpoint: number) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = now + (endpoint - now) * wRecyc[i];
    return out;
  };

  // Ore grade follows the same eased ramp from its 2024 baseline.
  const gradeFe = new Float64Array(n);
  const gradeNonFe = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    gradeFe[i] = Math.max(1e-6, inputs.gradeOre2024.fe + (levers.gradeOreFe - inputs.gradeOre2024.fe) * alpha[i]);
    gradeNonFe[i] = Math.max(
      1e-6,
      inputs.gradeOre2024.nonfe + (levers.gradeOreNonFe - inputs.gradeOre2024.nonfe) * alpha[i],
    );
  }

  const out: ModelRun = {
    years: inputs.years,
    ssp,
    primary: {
      byGroup: emptyGroupRecord(n),
      byRegionGroup: {},
      byGroupDetail: emptyDetailRecord(),
      byRegionGroupDetail: {},
      byEndUse: { metal_ores: {}, nonmetallic_minerals: {} },
      total: zeros(n),
    },
    secondary: emptyGroupRecord(n),
    scrap: {
      metal_ores: { retired: zeros(n), demand: zeros(n) },
      nonmetallic_minerals: { retired: zeros(n), demand: zeros(n) },
    },
    stock: { metal_ores: zeros(n), nonmetallic_minerals: zeros(n) },
    population: zeros(n),
    gdp: zeros(n),
    popByRegion: {},
    gdpByRegion: {},
  };

  const addPrimary = (region: string, group: GroupKey, detail: string, series: Float64Array) => {
    const g = out.primary.byGroup[group];
    const total = out.primary.total;
    const rg = (out.primary.byRegionGroup[region] ??= emptyGroupRecord(n));
    const rd = (out.primary.byRegionGroupDetail[region] ??= emptyDetailRecord());
    const gd = out.primary.byGroupDetail[group];
    const dWorld = (gd[detail] ??= zeros(n));
    const dRegion = (rd[group][detail] ??= zeros(n));
    const rgg = rg[group];
    for (let i = 0; i < n; i++) {
      const v = series[i];
      g[i] += v;
      total[i] += v;
      rgg[i] += v;
      dWorld[i] += v;
      dRegion[i] += v;
    }
  };

  for (const region of inputs.regions) {
    const pop0 = inputs.pop2024[region];
    const gdp0 = inputs.gdp2024[region];
    const popI = new Float64Array(n);
    const gdppcI = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      popI[i] = share * inputs.popIndex[ssp.lo][region][i] + (1 - share) * inputs.popIndex[ssp.hi][region][i];
      gdppcI[i] = share * inputs.gdppcIndex[ssp.lo][region][i] + (1 - share) * inputs.gdppcIndex[ssp.hi][region][i];
    }
    const popR = new Float64Array(n);
    const gdpR = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      popR[i] = pop0 * popI[i];
      gdpR[i] = gdp0 * popI[i] * gdppcI[i];
      out.population[i] += popR[i];
      out.gdp[i] += gdpR[i];
    }
    out.popByRegion[region] = popR;
    out.gdpByRegion[region] = gdpR;

    // ── Flows: Kaya on consumption ──────────────────────────────────────────
    const flowIndex: Partial<Record<FlowKey, Float64Array>> = {};
    for (const { key, group, fixed } of FLOW_MATERIALS) {
      const int2024 = inputs.flowInt2024[region]?.[key];
      if (int2024 == null) continue;
      const override = levers.flowEndpoint?.[key]?.[region];
      let ratio = 1;
      if (override == null && !fixed) {
        const u = levers.flowIntensityU[key] ?? 0.5;
        const bLo = inputs.flowRatioBounds[key]?.[ssp.lo]?.[region];
        const bHi = inputs.flowRatioBounds[key]?.[ssp.hi]?.[region];
        if (!bLo || !bHi) continue;
        ratio =
          share * (bLo[0] + u * (bLo[1] - bLo[0])) + (1 - share) * (bHi[0] + u * (bHi[1] - bHi[0]));
      }
      const idx = rampIndex(int2024, override ?? int2024 * ratio, alpha, group === 'fossil_fuels');
      flowIndex[key] = idx;

      const label = group === 'biomass' ? BIOMASS_LABEL[key] : FOSSIL_LABEL[key];
      const m2024 = inputs.m2024[region]?.[label];
      if (m2024 == null) continue;
      const series = new Float64Array(n);
      for (let i = 0; i < n; i++) series[i] = m2024 * popI[i] * gdppcI[i] * idx[i];
      addPrimary(region, group, label, series);
    }
    // Crop residues follow crops' intensity on their own 2024 mass.
    const cropsIdx = flowIndex.crops;
    const residues = inputs.m2024[region]?.['Crop Residues'];
    if (cropsIdx && residues != null) {
      const series = new Float64Array(n);
      for (let i = 0; i < n; i++) series[i] = residues * popI[i] * gdppcI[i] * cropsIdx[i];
      addPrimary(region, 'biomass', 'Crop Residues', series);
    }

    // ── Stocks: Kaya on stock, then the dynamic stock model ─────────────────
    const stockIntensityIndex = (group: StockGroup, superUse: SuperUse): Float64Array | null => {
      const int2024 = inputs.stockInt2024[group]?.[region]?.[superUse];
      if (int2024 == null) return null;
      const fixed = group === 'nonmetallic_minerals' && FIXED_NONMET_SUPER.includes(superUse);
      const override = levers.stockEndpoint?.[group]?.[superUse]?.[region];
      let ratio = 1;
      if (override == null && !fixed) {
        const u = levers.stockIntensityU[group]?.[superUse] ?? 0.5;
        const b = inputs.stockRatioBounds[group]?.[superUse]?.[region];
        if (!b) return null;
        ratio = b[0] + u * (b[1] - b[0]);
      }
      return rampIndex(int2024, override ?? int2024 * ratio, alpha, false);
    };

    /** Runs the DSM over one material's eight end uses in this region. */
    const runStockMaterial = (material: StockMaterial, group: StockGroup) => {
      const rows: {
        subUse: SubUse;
        superUse: SuperUse;
        res: DsmResult;
      }[] = [];
      for (const superUse of SUPER_USES) {
        const idx = stockIntensityIndex(group, superUse);
        if (!idx) continue;
        for (const subUse of SUB_USE_BY_SUPER[superUse]) {
          const s2024 = inputs.stock2024[material]?.[region]?.[subUse];
          const age = inputs.ageProfile[material]?.[region]?.[subUse];
          if (!s2024 || s2024 <= 0 || !age) continue;

          const gHist = inputs.stockGrowthHist[material]?.[region]?.[subUse];
          const gInt = gHist != null ? gHist - Math.log(popI[0] * gdppcI[0]) : 0;

          // Target stock. The Hermite term starts the intensity ramp off at the
          // slope that continues 2024's stock growth instead of flat.
          const target = new Float64Array(n);
          for (let i = 0; i < n; i++) {
            target[i] = s2024 * popI[i] * gdppcI[i] * idx[i] * Math.exp(h10[i] * gInt * spanYrs);
          }
          // Seam blend: ease the stock's log growth from 2024's observed rate
          // into the modelled one, so 2025 does not open with a step.
          if (gHist != null) {
            let prev = Math.log(s2024);
            let acc = 0;
            for (let i = 0; i < n; i++) {
              const cur = Math.log(target[i]);
              const gModel = cur - prev;
              prev = cur;
              acc += wModel[i] * gModel + (1 - wModel[i]) * gHist;
              target[i] = s2024 * Math.exp(acc);
            }
          }

          const life = inputs.lifetimes[subUse];
          const draw = levers.lifetimeU[LIFETIME_GROUP_OF[superUse]];
          const uMean = draw?.mean ?? 0.5;
          const uK = draw?.k ?? 0.5;
          rows.push({
            subUse,
            superUse,
            res: runForwardDsm(
              `${material}|${region}|${subUse}`,
              age.start,
              age.stocks,
              target,
              Math.max(0.3, life.meanMin + uMean * (life.meanMax - life.meanMin)),
              Math.max(0.1, life.kMin + uK * (life.kMax - life.kMin)),
              life.meanLife,
              life.k,
              base,
              n,
            ),
          });
        }
      }
      return rows;
    };

    const metalRows: Record<'Metal_Fe' | 'Metal_NonFe', ReturnType<typeof runStockMaterial>> = {
      Metal_Fe: runStockMaterial('Metal_Fe', 'metal_ores'),
      Metal_NonFe: runStockMaterial('Metal_NonFe', 'metal_ores'),
    };

    // Metals: recycling has no quality loss, so every end use can absorb
    // secondary up to its own demand.
    for (const material of ['Metal_Fe', 'Metal_NonFe'] as const) {
      const rows = metalRows[material];
      if (rows.length === 0) continue;
      const isFe = material === 'Metal_Fe';
      const rate = rateTraj(
        (isFe ? inputs.recyclingNow.fe : inputs.recyclingNow.nonfe)[region] ?? 0,
        isFe ? levers.recyclingFe : levers.recyclingNonFe,
      );
      const grade = isFe ? gradeFe : gradeNonFe;
      const primaryByRow = rows.map(() => new Float64Array(n));
      const secondaryTotal = out.secondary.metal_ores;
      const stockTotal = out.stock.metal_ores;
      const scrap = out.scrap.metal_ores;
      const endUse = out.primary.byEndUse.metal_ores;
      for (let i = 0; i < n; i++) {
        const eol = allocateEol(
          rows.map((r) => {
            const demand = Math.max(0, r.res.production[i]);
            return { demand, waste: Math.max(0, r.res.waste[i]), rate: rate[i], room: demand };
          }),
        );
        for (let j = 0; j < rows.length; j++) {
          primaryByRow[j][i] = eol.primary[j] / grade[i];
          secondaryTotal[i] += eol.secondary[j] / grade[i];
          stockTotal[i] += rows[j].res.totalStock[i] / grade[i];
          scrap.retired[i] += Math.max(0, rows[j].res.waste[i]);
          scrap.demand[i] += Math.max(0, rows[j].res.production[i]);
          const bucket = (endUse[SUB_USE_LABEL[rows[j].subUse]] ??= zeros(n));
          bucket[i] += primaryByRow[j][i] + eol.secondary[j] / grade[i];
        }
      }
      const leaf = STOCK_LEAF[material];
      for (let j = 0; j < rows.length; j++) {
        addPrimary(region, 'metal_ores', leaf, primaryByRow[j]);
      }
    }

    // Non-metallic minerals: reuse loses quality, so only buildings, civil
    // engineering and roads give or take, and each has a capped room.
    const mineralRows = runStockMaterial('Non-metallic minerals', 'nonmetallic_minerals');
    if (mineralRows.length > 0) {
      const rate = rateTraj(inputs.downcyclingNow[region] ?? 0, levers.downcycling);
      const roomShare = mineralRows.map((r) => {
        if (r.subUse === 'residential' || r.subUse === 'non_residential') {
          return levers.maxSecondaryBuildCivil * levers.shareConcreteBuildings * levers.shareAggConcrete;
        }
        if (r.subUse === 'civil_engineering') {
          return levers.maxSecondaryBuildCivil * levers.shareConcreteCivil * levers.shareAggConcrete;
        }
        if (r.subUse === 'roads') return levers.maxSecondaryRoads * levers.shareGranularRoad;
        return 0;
      });
      const gives = mineralRows.map(
        (r) =>
          r.subUse === 'residential' ||
          r.subUse === 'non_residential' ||
          r.subUse === 'civil_engineering' ||
          r.subUse === 'roads',
      );
      const primaryByRow = mineralRows.map(() => new Float64Array(n));
      const secondaryTotal = out.secondary.nonmetallic_minerals;
      const stockTotal = out.stock.nonmetallic_minerals;
      const scrap = out.scrap.nonmetallic_minerals;
      const endUse = out.primary.byEndUse.nonmetallic_minerals;
      for (let i = 0; i < n; i++) {
        const eol = allocateEol(
          mineralRows.map((r, j) => {
            const demand = Math.max(0, r.res.production[i]);
            return {
              demand,
              waste: Math.max(0, r.res.waste[i]),
              rate: gives[j] ? rate[i] : 0,
              room: roomShare[j] * demand,
            };
          }),
        );
        for (let j = 0; j < mineralRows.length; j++) {
          primaryByRow[j][i] = eol.primary[j];
          secondaryTotal[i] += eol.secondary[j];
          stockTotal[i] += mineralRows[j].res.totalStock[i];
          scrap.retired[i] += Math.max(0, mineralRows[j].res.waste[i]);
          scrap.demand[i] += Math.max(0, mineralRows[j].res.production[i]);
          const bucket = (endUse[SUB_USE_LABEL[mineralRows[j].subUse]] ??= zeros(n));
          bucket[i] += primaryByRow[j][i] + eol.secondary[j];
        }
      }
      for (let j = 0; j < mineralRows.length; j++) {
        addPrimary(region, 'nonmetallic_minerals', STOCK_LEAF['Non-metallic minerals'], primaryByRow[j]);
      }
    }
  }

  return out;
}

/** Compound annual growth rate of a series between two of its years. */
export function cagr(years: number[], series: ArrayLike<number>, from: number, to: number): number | null {
  const i = years.indexOf(from);
  const j = years.indexOf(to);
  if (i < 0 || j < 0 || j <= i) return null;
  const a = series[i];
  const b = series[j];
  if (!(a > 0) || !(b > 0)) return null;
  return Math.pow(b / a, 1 / (years[j] - years[i])) - 1;
}

// ── Levers as the interface shows them ──────────────────────────────────────
// The model samples intensity material by material. A slider per material would
// be a dozen sliders, so the interface groups them: one draw moves every
// material in the group, which is also how the paper's own narratives move.

export type IntensityLever = 'biomass' | 'fossil' | 'metalStock' | 'mineralStock';

export const INTENSITY_LEVERS: Record<
  IntensityLever,
  { label: string; unit: string; flows: FlowKey[]; stocks: [StockGroup, SuperUse][]; param: string }
> = {
  biomass: {
    label: 'Biomass intensity',
    unit: 'kg per $ of GDP',
    flows: ['crops', 'grazed_biomass', 'wood'],
    stocks: [],
    param: 'intensity_crops_global',
  },
  fossil: {
    label: 'Fossil fuel intensity',
    unit: 'kg per $ of GDP',
    flows: ['coal', 'gas', 'oil'],
    stocks: [],
    param: 'intensity_coal_global',
  },
  metalStock: {
    label: 'Metal stock intensity',
    unit: 'kg in use per $ of GDP',
    flows: [],
    stocks: [
      ['metal_ores', 'buildings'],
      ['metal_ores', 'civil'],
      ['metal_ores', 'machinery'],
      ['metal_ores', 'sl_products'],
    ],
    param: 'intensity_buildings_metalOres_global',
  },
  mineralStock: {
    label: 'Mineral stock intensity',
    unit: 'kg in use per $ of GDP',
    flows: [],
    stocks: [
      ['nonmetallic_minerals', 'buildings'],
      ['nonmetallic_minerals', 'civil'],
    ],
    param: 'intensity_buildings_nonMetallic_global',
  },
};

export const INTENSITY_LEVER_KEYS = Object.keys(INTENSITY_LEVERS) as IntensityLever[];

function gdpWeights(inputs: ModelInputs): Record<string, number> {
  let total = 0;
  for (const r of inputs.regions) total += inputs.gdp2024[r];
  const w: Record<string, number> = {};
  for (const r of inputs.regions) w[r] = inputs.gdp2024[r] / total;
  return w;
}

/**
 * World intensity a lever lands on, in its own units: the GDP-weighted sum over
 * regions and member materials. Linear in the draw, so a slider can move in
 * kg/$ and be inverted exactly.
 */
export function leverWorldValue(
  inputs: ModelInputs,
  lever: IntensityLever,
  u: number,
  blend: SspBlend,
): { value: number; base: number } {
  const w = gdpWeights(inputs);
  const spec = INTENSITY_LEVERS[lever];
  let value = 0;
  let base = 0;
  for (const key of spec.flows) {
    for (const r of inputs.regions) {
      const int2024 = inputs.flowInt2024[r]?.[key];
      if (int2024 == null) continue;
      const bLo = inputs.flowRatioBounds[key]?.[blend.lo]?.[r];
      const bHi = inputs.flowRatioBounds[key]?.[blend.hi]?.[r];
      base += w[r] * int2024;
      if (!bLo || !bHi) {
        value += w[r] * int2024;
        continue;
      }
      const ratio =
        blend.shareLo * (bLo[0] + u * (bLo[1] - bLo[0])) +
        (1 - blend.shareLo) * (bHi[0] + u * (bHi[1] - bHi[0]));
      value += w[r] * int2024 * ratio;
    }
  }
  for (const [group, superUse] of spec.stocks) {
    for (const r of inputs.regions) {
      const int2024 = inputs.stockInt2024[group]?.[r]?.[superUse];
      if (int2024 == null) continue;
      const b = inputs.stockRatioBounds[group]?.[superUse]?.[r];
      base += w[r] * int2024;
      value += w[r] * int2024 * (b ? b[0] + u * (b[1] - b[0]) : 1);
    }
  }
  return { value, base };
}

/**
 * Inverse of leverWorldValue, for a slider that moves in real units.
 *
 * Deliberately unclamped. Some SSP targets sit outside the range the Monte
 * Carlo sampled, and a slider that stopped at the sampled edge could not show
 * where those SSPs are, let alone be put there. Outside [0,1] the regional
 * ratios simply carry on linearly, which is a more or less ambitious target,
 * not a different kind of assumption.
 */
export function leverDraw(inputs: ModelInputs, lever: IntensityLever, value: number, blend: SspBlend): number {
  const lo = leverWorldValue(inputs, lever, 0, blend).value;
  const hi = leverWorldValue(inputs, lever, 1, blend).value;
  if (hi === lo) return 0.5;
  return (value - lo) / (hi - lo);
}

/** The world intensity each SSP's own assumptions imply for a lever. */
export function leverSspValue(inputs: ModelInputs, lever: IntensityLever, ssp: string): number | null {
  const w = gdpWeights(inputs);
  const spec = INTENSITY_LEVERS[lever];
  let value = 0;
  let any = false;
  for (const key of spec.flows) {
    for (const r of inputs.regions) {
      const t = inputs.sspTargets.flow[key]?.[ssp]?.[r];
      if (t == null) continue;
      value += w[r] * t;
      any = true;
    }
  }
  for (const [group, superUse] of spec.stocks) {
    for (const r of inputs.regions) {
      const t = inputs.sspTargets.stock[group]?.[superUse]?.[ssp]?.[r];
      if (t == null) continue;
      value += w[r] * t;
      any = true;
    }
  }
  return any ? value : null;
}

/** Where each SSP sits on the socioeconomic slider. */
export function sspPositions(inputs: ModelInputs): Record<string, number> {
  const { rank } = sspRanking(inputs);
  const span = rank[rank.length - 1].growth - rank[0].growth;
  const out: Record<string, number> = {};
  for (const r of rank) out[r.scenario] = span === 0 ? 0.5 : (r.growth - rank[0].growth) / span;
  return out;
}

/**
 * The paper's own scenario for one SSP: that SSP's population and income path,
 * and that SSP's intensity target in every region. Everything the SSPs do not
 * differentiate — recovery rates, ore grade, lifetimes — stays at its central
 * value, which is what the paper's deterministic runs do too.
 */
export function sspLevers(inputs: ModelInputs, ssp: string): Levers {
  const levers = defaultLevers(inputs);
  levers.sspU = sspPositions(inputs)[ssp] ?? 0.5;
  const flow: NonNullable<Levers['flowEndpoint']> = {};
  for (const [key, bySsp] of Object.entries(inputs.sspTargets.flow)) {
    const byRegion = bySsp?.[ssp];
    if (byRegion) flow[key as FlowKey] = byRegion;
  }
  levers.flowEndpoint = flow;
  const stock: NonNullable<Levers['stockEndpoint']> = {};
  for (const group of ['metal_ores', 'nonmetallic_minerals'] as StockGroup[]) {
    const bySuper = inputs.sspTargets.stock[group] ?? {};
    const acc: Partial<Record<SuperUse, Record<string, number>>> = {};
    for (const [superUse, bySsp] of Object.entries(bySuper)) {
      const byRegion = bySsp?.[ssp];
      if (byRegion) acc[superUse as SuperUse] = byRegion;
    }
    stock[group] = acc;
  }
  levers.stockEndpoint = stock;
  return levers;
}

/**
 * Custom levers seeded from an SSP: the same socioeconomic position, and the
 * draw whose world intensity matches that SSP's. Used when someone starts from
 * an SSP and then moves a slider, so nothing jumps at the first drag.
 */
export function customLeversFromSsp(inputs: ModelInputs, ssp: string): Levers {
  const levers = defaultLevers(inputs);
  levers.sspU = sspPositions(inputs)[ssp] ?? 0.5;
  const blend = resolveSsp(inputs, levers.sspU);
  const flowU: Partial<Record<FlowKey, number>> = {};
  const stockU: Levers['stockIntensityU'] = {};
  for (const lever of INTENSITY_LEVER_KEYS) {
    const target = leverSspValue(inputs, lever, ssp);
    const u = target == null ? 0.5 : leverDraw(inputs, lever, target, blend);
    const spec = INTENSITY_LEVERS[lever];
    for (const key of spec.flows) flowU[key] = u;
    for (const [group, superUse] of spec.stocks) {
      (stockU[group] ??= {})[superUse] = u;
    }
  }
  levers.flowIntensityU = flowU;
  levers.stockIntensityU = stockU;
  return levers;
}
