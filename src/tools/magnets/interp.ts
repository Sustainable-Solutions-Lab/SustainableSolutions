/**
 * Multilinear interpolation over the precomputed scenario grid (6 axes: IRA
 * content, recycling, Dy/Tb intensity, China export restriction, US recycling cost,
 * total-demand scale). The last two demand axes (dytb intensity + demand scale) are
 * driven by the client-side demand builder; the rest are supply-side sliders.
 */
import data from './scenarios.json';

export type Flow = { from: string; to: string; value: number };
export type Scenario = {
  make: number; source: number; rec: number; dytb: number; china: number; rcost: number; dscale: number;
  pfloor: number;
  /** Abatement-ceiling case: 0 = today's sectoral availability, 1 = barrier broken.
   *  Discrete, not interpolated. Absent on grids written before the axis existed. */
  abunlock?: number;
  kpis: Record<string, number>;
  cost: Record<string, number>;
  us_cost: Record<string, number>;
  production: Record<string, Record<string, number>>;
  us_supply: Record<string, { domestic: number; allied: number; china: number }>;
  // US self-sufficiency split by RE class: light (Nd/Pr) vs heavy (Dy/Tb chokepoint).
  us_supply_re?: { light: Record<string, { domestic: number; allied: number; china: number }>;
                   heavy: Record<string, { domestic: number; allied: number; china: number }> };
  utilization: Record<string, Record<string, number | null>>;
  flows: Record<string, Flow[]>;
  // Real per-RE-class inter-regional flows (kt of that class), emitted by the model so
  // the heavy/light Sankey shows the model's actual Dy/Tb (or Nd/Pr) shipments instead
  // of scaling the aggregate by a flat mass fraction. Optional: only present once the
  // grid is regenerated with the per-class flow emit; realworld.ts falls back otherwise.
  flows_re?: { light: Record<string, Flow[]>; heavy: Record<string, Flow[]> };
  path: {
    us_mix: Record<string, number[]>;   // domestic / allied / china / unmet, per year
    us_cap: Record<string, number[]>;   // mining / separation / alloy / magnet, per year
    // how US oxide need is met per RE class (Nd/Pr light, Dy/Tb heavy): each maps
    // domestic / allied / china / unmet → per-year kt-oxide series. Optional: only
    // present once the grid is regenerated with the per-class pathway emit.
    us_mix_re?: { light: Record<string, number[]>; heavy: Record<string, number[]> };
    cost_annual: number[];
    primary_dytb: number[];
  };
  // The planner's US expansions, one row per facility, carrying everything the
  // client-side project screen needs (capacity, utilisation, unit opex, fixed
  // cost). Optional: only present once the grid is regenerated with the buildout
  // emit; CapacityPanel shows a "needs a newer grid" note otherwise.
  buildout?: { f: string; s: string; r: string; kt: number; u: number; v: number;
               fx: number; n: number; basket?: Record<string, number> }[];
  // Interface flows at each snapshot year, so the Sankey can be stepped through
  // time rather than only showing the final year. Optional, as above.
  flows_by_year?: Record<string, Record<string, Flow[]>>;
  _di?: Record<string, number>;   // per-stage DI override from a reserve-developing overlay
};

export const YEARS = (data as any).meta.years as number[];
export const DEMAND_KT_REF = (data as any).meta.demand_kt_ref as number[];
export const US_DEMAND_SHARE = (data as any).meta.us_demand_share as number;

type AxisField = 'make' | 'source' | 'rec' | 'dytb' | 'china' | 'rcost' | 'dscale' | 'pfloor';
const SC = (data as any).scenarios as Scenario[];
const AX = (data as any).meta.axes as Record<string, number[]>;
// scenario field -> grid-axis name
const FIELD_AXIS: [AxisField, string][] = [
  ['make', 'us_make'], ['source', 'non_china_source'], ['rec', 'recycling'], ['dytb', 'dytb'],
  ['china', 'china'], ['rcost', 'us_recyc_cost'], ['dscale', 'demand_scale'], ['pfloor', 'price_floor'],
];
export const AXES = {
  makeMax: Math.max(...AX.us_make),
  sourceMax: Math.max(...AX.non_china_source),
  recMax: Math.max(...AX.recycling),
  chinaMax: Math.max(...AX.china),
  dytbMin: Math.min(...AX.dytb),     // most-thrifted Dy/Tb (e.g. 0.4 = 40% of today)
  dscaleMin: Math.min(...AX.demand_scale),  // lowest total-demand scale (most RE-free / efficient)
  rcostMin: Math.min(...AX.us_recyc_cost),  // baseline US recycling cost factor
  rcostMax: Math.max(...AX.us_recyc_cost),
  pfloorMax: Math.max(...(AX.price_floor ?? [0])),  // US price floor: 0=off … 1=full ex-China premium
};

/** Every axis's solved grid points, ascending — the domain the scenario bar draws.
 *  Two of these (dytb, dscale) have no slider: they are computed from the Demand
 *  Builder, which is exactly why the bar has to show them. */
export const AXIS_DOMAIN = Object.fromEntries(
  FIELD_AXIS.map(([f, a]) => [f, [...(AX[a] ?? [0])].sort((x, y) => x - y)]),
) as Record<AxisField, number[]>;

type Point = { make: number; source: number; rec: number; dytb: number; china: number; rcost: number; dscale: number; pfloor?: number; abunlock?: number };
// `abunlock` is part of the KEY but not of FIELD_AXIS, because only its two
// ENDPOINTS are solved (0 = today's sectoral ceiling, 1 = the barrier broken
// everywhere). It is nonetheless a continuum in the model — aggregate_tranches
// lifts each sector's availability by `a + u*(best - a)`, linear in u — so
// interpolating between the endpoints describes a real intermediate world: R&D
// that got part of the way. interpScenario blends the two corner sets when the
// query falls between them; see the note there on where that approximation bites.
const key = (s: Point) =>
  `${s.make}|${s.source}|${s.rec}|${s.dytb}|${s.china}|${s.rcost}|${s.dscale}|${s.pfloor ?? 0}|${s.abunlock ?? 0}`;
const LOOKUP = new Map(SC.map((s) => [key(s), s]));

// Price-floor slices ship separately so the default page load is unchanged: the eager
// grid IS the floor=0 slice; the half/full slices (~3 MB gz) are dynamically imported
// (code-split into lazy chunks) the first time the user engages the price-floor slider,
// then merged into LOOKUP. Until loaded, a pfloor>0 query gracefully degrades to floor=0.
const SLICE_LOADERS: Record<string, () => Promise<any>> = {
  '0.5': () => import('./scenarios.pf1.json'),
  '1.0': () => import('./scenarios.pf2.json'),
};
const loadedSlices = new Set<string>();
let pfLoadPromise: Promise<void> | null = null;
export function priceFloorReady(): boolean {
  return Object.keys(SLICE_LOADERS).every((k) => loadedSlices.has(k));
}
export function ensurePriceFloorSlices(): Promise<void> {
  if (priceFloorReady()) return Promise.resolve();
  if (!pfLoadPromise) {
    pfLoadPromise = Promise.all(
      Object.entries(SLICE_LOADERS).map(async ([lvl, load]) => {
        if (loadedSlices.has(lvl)) return;
        const mod: any = await load();
        for (const s of (((mod.default ?? mod).scenarios as Scenario[]) || [])) LOOKUP.set(key(s), s);
        loadedSlices.add(lvl);
      }),
    ).then(() => undefined);
  }
  return pfLoadPromise;
}
// Aspirational abatement-ceiling slices. Same lazy pattern as the price floor, but
// keyed (abunlock, pfloor) because the ceiling crosses the floor: all three have to
// be resident before a query at unlock=1 can be answered at any floor level.
const AB_SLICE_LOADERS: Record<string, () => Promise<any>> = {
  '1.0|0.0': () => import('./scenarios.ab1.json'),
  '1.0|0.5': () => import('./scenarios.ab1.pf1.json'),
  '1.0|1.0': () => import('./scenarios.ab1.pf2.json'),
};
const loadedAb = new Set<string>();
let abLoadPromise: Promise<void> | null = null;
/** True once every aspirational slice is resident. Until then a query at
 *  unlock=1 degrades to the baseline ceiling rather than returning nothing. */
export function abatementCeilingReady(): boolean {
  return Object.keys(AB_SLICE_LOADERS).every((k) => loadedAb.has(k));
}
export function ensureAbatementCeilingSlices(): Promise<void> {
  if (abatementCeilingReady()) return Promise.resolve();
  if (!abLoadPromise) {
    abLoadPromise = Promise.all(
      Object.entries(AB_SLICE_LOADERS).map(async ([k, load]) => {
        if (loadedAb.has(k)) return;
        const mod: any = await load();
        for (const s of (((mod.default ?? mod).scenarios as Scenario[]) || [])) LOOKUP.set(key(s), s);
        loadedAb.add(k);
      }),
    ).then(() => undefined);
  }
  return abLoadPromise;
}
/** The ceilings the deployed grid actually carries, as fractions of Dy/Tb that can
 *  be designed out at any price. Read from meta so the label cannot drift from the
 *  model; the fallback covers a grid written before the axis existed. */
export const ABATEMENT_CEILINGS: { baseline: number; aspirational: number } = (() => {
  const tr = (data as any).meta?.abatement?.tranches as { frac: number }[] | undefined;
  const baseline = tr ? tr.reduce((a, t) => a + t.frac, 0) : 0.247;
  return { baseline, aspirational: 0.45 };
})();
/** Whether this grid was built with the aspirational slice at all. */
export const HAS_ABATEMENT_CEILING: boolean =
  !!(data as any).meta?.abatement_unlock_slices;

const snap = (arr: number[], x: number) =>
  arr.reduce((p, c) => (Math.abs(c - x) < Math.abs(p - x) ? c : p), arr[0]);

function bracket(arr: number[], x: number): [number, number, number] {
  const a = [...arr].sort((m, n) => m - n);
  const xc = Math.max(a[0], Math.min(a[a.length - 1], x));
  for (let i = 0; i < a.length - 1; i++) {
    if (xc >= a[i] && xc <= a[i + 1]) return [a[i], a[i + 1], (xc - a[i]) / (a[i + 1] - a[i] || 1)];
  }
  return [a[a.length - 1], a[a.length - 1], 0];
}

// Baseline for deltas: no policy, APS reference demand (dytb intensity 1.0, demand
// scale 1.0) — both exact grid points.
export const BASE = LOOKUP.get(key({
  make: 0, source: 0, rec: 0, dytb: 1.0, china: 0, rcost: Math.min(...AX.us_recyc_cost), dscale: 1.0,
}))!;

function combine(parts: { s: Scenario; w: number }[]): Scenario {
  const tot = parts.reduce((a, p) => a + p.w, 0) || 1;
  const ps = parts.map((p) => ({ s: p.s, w: p.w / tot }));
  const base = ps[0].s;
  const wDict = (field: 'kpis' | 'cost' | 'us_cost') => {
    const out: Record<string, number> = {};
    for (const { s, w } of ps) for (const k in s[field]) out[k] = (out[k] || 0) + s[field][k] * w;
    return out;
  };
  const wNested = (field: 'production' | 'us_supply' | 'utilization') => {
    const out: Record<string, Record<string, number>> = {};
    for (const { s, w } of ps) for (const r in s[field] as any) {
      out[r] = out[r] || {};
      for (const k in (s[field] as any)[r]) {
        const v = (s[field] as any)[r][k];
        out[r][k] = (out[r][k] || 0) + (v == null ? 0 : v) * w;
      }
    }
    return out;
  };
  const fm = new Map<string, number>();
  for (const { s, w } of ps) for (const iface in s.flows) for (const f of s.flows[iface])
    fm.set(`${iface}|${f.from}|${f.to}`, (fm.get(`${iface}|${f.from}|${f.to}`) || 0) + f.value * w);
  const flows: Record<string, Flow[]> = {};
  for (const [k, v] of fm) {
    if (v < 0.05) continue;
    const [iface, from, to] = k.split('|');
    (flows[iface] ??= []).push({ from, to, value: v });
  }
  // per-RE-class flows (light/heavy → iface → Flow[]): same weighted-merge as `flows`
  let flows_re: Scenario['flows_re'];
  if (ps.some((p) => p.s.flows_re)) {
    const frm = new Map<string, number>();   // cls|iface|from|to → value
    for (const { s, w } of ps)
      for (const cls of ['light', 'heavy'] as const)
        for (const iface in s.flows_re?.[cls] ?? {})
          for (const f of s.flows_re![cls][iface])
            frm.set(`${cls}|${iface}|${f.from}|${f.to}`, (frm.get(`${cls}|${iface}|${f.from}|${f.to}`) || 0) + f.value * w);
    flows_re = { light: {}, heavy: {} };
    for (const [k, v] of frm) {
      if (v < 0.02) continue;
      const [cls, iface, from, to] = k.split('|') as ['light' | 'heavy', string, string, string];
      (flows_re[cls][iface] ??= []).push({ from, to, value: v });
    }
  }
  // annual pathway series: element-wise weighted sum
  const H = base.path.cost_annual.length;
  const zeros = () => Array(H).fill(0) as number[];
  const wPath = () => {
    const out = { us_mix: {} as Record<string, number[]>, us_cap: {} as Record<string, number[]>,
                  cost_annual: zeros(), primary_dytb: zeros() };
    for (const g of ['us_mix', 'us_cap'] as const)
      for (const k in base.path[g]) out[g][k] = zeros();
    // optional per-class oxide pathway (light/heavy → source → year)
    const baseRe = base.path.us_mix_re;
    const outRe = baseRe ? { light: {} as Record<string, number[]>, heavy: {} as Record<string, number[]> } : undefined;
    if (baseRe && outRe)
      for (const cls of ['light', 'heavy'] as const)
        for (const k in baseRe[cls]) outRe[cls][k] = zeros();
    for (const { s, w } of ps) {
      for (const g of ['us_mix', 'us_cap'] as const)
        for (const k in s.path[g]) for (let i = 0; i < H; i++) out[g][k][i] += s.path[g][k][i] * w;
      const sre = s.path.us_mix_re;
      if (outRe && sre)
        for (const cls of ['light', 'heavy'] as const)
          for (const k in sre[cls]) {
            outRe[cls][k] = outRe[cls][k] || zeros();
            for (let i = 0; i < H; i++) outRe[cls][k][i] += sre[cls][k][i] * w;
          }
      for (let i = 0; i < H; i++) {
        out.cost_annual[i] += s.path.cost_annual[i] * w;
        out.primary_dytb[i] += s.path.primary_dytb[i] * w;
      }
    }
    if (outRe) (out as Scenario['path']).us_mix_re = outRe;
    return out;
  };
  // weighted-average the two-level us_supply_re (class → stage → shares)
  const wSupplyRe = () => {
    const out: any = { light: {}, heavy: {} };
    for (const cls of ['light', 'heavy'] as const)
      for (const { s, w } of ps) {
        const re = (s as any).us_supply_re?.[cls]; if (!re) continue;
        for (const stage in re) {
          out[cls][stage] = out[cls][stage] || { domestic: 0, allied: 0, china: 0 };
          for (const k of ['domestic', 'allied', 'china'] as const) out[cls][stage][k] += (re[stage][k] || 0) * w;
        }
      }
    return out;
  };
  // The planner's US expansions, blended per facility. EXTENSIVE fields (kt, fx,
  // n) weighted-sum, so a facility that only builds in some corners of the
  // bracket interpolates down to a partial build. INTENSIVE fields (u, v) are
  // averaged over the weight where the facility actually appears — weighted-
  // summing a $/kg would hand the screen a unit cost scaled by the blend weight.
  const wBuildout = (): Scenario['buildout'] => {
    if (!ps.some((p) => (p.s as any).buildout?.length)) return undefined;
    const acc = new Map<string, { b: any; w: number }>();
    for (const { s, w } of ps) for (const b of (s as any).buildout ?? []) {
      const k = `${b.f}|${b.s}|${b.r}`;
      const e = acc.get(k) ?? { b: { ...b, kt: 0, fx: 0, n: 0, u: 0, v: 0 }, w: 0 };
      for (const f of ['kt', 'fx', 'n'] as const) e.b[f] += (b[f] ?? 0) * w;
      for (const f of ['u', 'v'] as const) e.b[f] += (b[f] ?? 0) * w;   // normalised below
      e.w += w;
      acc.set(k, e);
    }
    return [...acc.values()]
      .map(({ b, w }) => ({ ...b, u: w > 0 ? b.u / w : 0, v: w > 0 ? b.v / w : 0 }))
      .filter((b) => b.kt > 0.005);
  };
  // Snapshot-year flows: the same weighted merge as `flows`, one year at a time.
  const wFlowsByYear = (): Scenario['flows_by_year'] => {
    if (!ps.some((p) => (p.s as any).flows_by_year)) return undefined;
    const m = new Map<string, number>();   // year|iface|from|to → value
    for (const { s, w } of ps) {
      const fby = (s as any).flows_by_year ?? {};
      for (const y in fby) for (const iface in fby[y]) for (const f of fby[y][iface]) {
        const k = `${y}|${iface}|${f.from}|${f.to}`;
        m.set(k, (m.get(k) || 0) + f.value * w);
      }
    }
    const out: any = {};
    for (const [k, v] of m) {
      if (v < 0.05) continue;
      const [y, iface, from, to] = k.split('|');
      ((out[y] ??= {})[iface] ??= []).push({ from, to, value: v });
    }
    return out;
  };
  return {
    buildout: wBuildout(), flows_by_year: wFlowsByYear(),
    make: base.make, source: base.source, rec: base.rec, dytb: base.dytb, china: base.china,
    rcost: base.rcost, pfloor: base.pfloor,
    dscale: base.dscale, kpis: wDict('kpis'), cost: wDict('cost'), us_cost: wDict('us_cost'),
    production: wNested('production') as any, us_supply: wNested('us_supply') as any,
    us_supply_re: wSupplyRe(),
    utilization: wNested('utilization') as any, flows, flows_re, path: wPath(),
  };
}

export function interpScenario(pt: Point): Scenario {
  pt = { ...pt, pfloor: pt.pfloor ?? 0 };   // default the price-floor axis for callers that omit it
  const ab = Math.max(0, Math.min(1, pt.abunlock ?? 0));
  const brk = FIELD_AXIS.map(([f, ax]) => bracket(AX[ax] ?? [0], (pt[f] as number) ?? 0));
  const n = FIELD_AXIS.length;
  // Blend the two solved ceilings only when the query sits strictly between them.
  // The approximation: the optimiser's response to a ceiling is piecewise (it
  // abates up to the ceiling only where marginal cost undercuts the premium), so
  // a midpoint read is linear where the truth is a staircase. The endpoints, which
  // are what the paper quotes, are exact.
  const blendAb = ab > 1e-9 && ab < 1 - 1e-9;
  const nBits = n + (blendAb ? 1 : 0);
  const parts: { s: Scenario; w: number }[] = [];
  for (let m = 0; m < (1 << nBits); m++) {
    let w = 1;
    const coords: any = {};
    for (let a = 0; a < n; a++) {
      const [lo, hi, t] = brk[a];
      const hiBit = (m >> a) & 1;
      coords[FIELD_AXIS[a][0]] = hiBit ? hi : lo;
      w *= hiBit ? t : 1 - t;
    }
    const abBit = blendAb ? (m >> n) & 1 : (ab >= 0.5 ? 1 : 0);
    if (blendAb) w *= abBit ? ab : 1 - ab;
    if (w <= 1e-9) continue;
    const base = FIELD_AXIS.map(([f, ax]) => snap(AX[ax], coords[f])).join('|');
    // Try the requested ceiling, then fall back to the baseline one. The fallback
    // is what makes the control safe to move before its slices have downloaded:
    // the page keeps answering, at today's ceiling, instead of emptying out.
    const s = LOOKUP.get(`${base}|${abBit}`) ?? (abBit ? LOOKUP.get(`${base}|0`) : undefined);
    if (s) parts.push({ s, w });
  }
  const out = parts.length ? combine(parts) : { ...BASE };
  // combine() copies the axis scalars from a grid NODE; overwrite them with the
  // actually-queried slider position so downstream consumers see the real value
  // smoothly — notably the Sankey's China→US throttle (usMineral = sc.source) and
  // the restriction severity (sc.china), which were otherwise quantized to the
  // nearest grid coordinate (e.g. a 0.8 slider read as 0.5).
  for (const [f] of FIELD_AXIS) (out as any)[f] = pt[f];
  (out as any).abunlock = ab;
  return out;
}

// ── Strategic stockpile overlay ──────────────────────────────────────────────
// A pre-positioned US inventory of finished magnets (bought on the open market
// before a shock, e.g. 2025) that is drawn down to cover the EARLIEST unmet
// demand first, up to its size. This is a post-solve overlay rather than a 7th
// grid axis: adding stockpile to the precompute would triple it (2700→8100). The
// approximation is faithful because the unmet years are already shortage-binding
// — the model has built everything it can, so a finite buffer simply fills the
// residual gap at a known acquisition+holding cost; it does not change the
// upstream capacity decisions. The slider sets the buffer size (kt).
export const STOCKPILE_MAX = (data as any).meta.stockpile_max_kt ?? 80;   // kt slider ceiling
// All-in $/kg of stockpiled finished NdFeB: open-market acquisition + amortized
// holding/handling. Grounded in Benchmark Mineral Intelligence (Feb 2026): PrNd
// oxide ~$135/kg CIF N. America, Dy ~$1,250/kg, Tb ~$5,000/kg ex-China — a
// strategic buffer skews to Dy/Tb-rich high-coercivity grades, so ~$110/kg.
// $M/kt == $/kg.
const STOCKPILE_COST_PER_KT = (data as any).meta.stockpile_cost_per_kt ?? 110;
const DISCOUNT = 0.07;   // matches the model's real discount rate

export function applyStockpile(sc: Scenario, stockpileKt: number): Scenario {
  if (!stockpileKt || stockpileKt <= 0) return sc;
  const unmet = [...(sc.path.us_mix.unmet ?? [])];
  const n = unmet.length;
  if (!n) return sc;
  const disc = unmet.map((_, t) => 1 / Math.pow(1 + DISCOUNT, t));
  const oldW = unmet.reduce((a, u, t) => a + u * disc[t], 0);
  // draw down earliest-first
  const draw = unmet.map(() => 0);
  let rem = stockpileKt;
  for (let t = 0; t < n; t++) {
    const x = Math.min(unmet[t], rem);
    draw[t] = x; unmet[t] -= x; rem -= x;
  }
  const drawn = draw.reduce((a, b) => a + b, 0);
  const newW = unmet.reduce((a, u, t) => a + u * disc[t], 0);
  // discounted-weighted scaling of the shortage penalty (early unmet weighs most)
  const shortageScale = oldW > 1e-9 ? newW / oldW : 1;

  // Credit the buffer in the (horizon-averaged) US trade-risk index: a US-held
  // finished-magnet inventory removes import dependence for the fraction of period
  // demand it covers, across the whole chain (a finished magnet embodies its ore /
  // oxide / alloy). coverage = magnets drawn ÷ total period US magnet demand; we
  // move that share of each stage's UNMET into the secure US-held ("domestic")
  // bucket — capped per stage, so it only helps where there was a shortfall. This
  // is why the stockpile now lowers the TRI (it buys down early-period unmet, which
  // the period-average — unlike the old final-year snapshot — actually sees).
  const mix = sc.path.us_mix;
  let totDemand = 0;
  for (let t = 0; t < n; t++)
    totDemand += (mix.domestic?.[t] ?? 0) + (mix.allied?.[t] ?? 0)
      + (mix.china?.[t] ?? 0) + (unmet[t] + draw[t]);   // unmet[t]+draw[t] = original unmet
  const coverage = totDemand > 1e-9 ? drawn / totDemand : 0;
  // Credit the covered fraction into the secure US-held ("domestic") bucket, capped per
  // stage at that stage's shortfall. A stockpiled finished magnet embodies its ore/oxide/
  // alloy, so the credit applies to every stage AND every RE class (us_supply_re) — the
  // latter so the heavy-weighted integrated TRI (integratedRE) actually sees the buffer.
  const creditMap = (supply: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const stage in supply) {
      const m = supply[stage];
      const d = m.domestic ?? 0, rec = m.recycled ?? 0, a = m.allied ?? 0, c = m.china ?? 0;
      const stageUnmet = Math.max(0, 1 - d - rec - a - c);
      out[stage] = { domestic: d + Math.min(coverage, stageUnmet), recycled: rec, allied: a, china: c };
    }
    return out;
  };
  let us_re = sc.us_supply_re as any;
  if (us_re) {
    us_re = { ...us_re };
    for (const cls of ['light', 'heavy'] as const) if (us_re[cls]) us_re[cls] = creditMap(us_re[cls]);
  }

  return {
    ...sc,
    kpis: { ...sc.kpis, us_unmet_kt: Math.max(0, (sc.kpis.us_unmet_kt ?? 0) - drawn) },
    us_supply: creditMap(sc.us_supply),
    us_supply_re: us_re,
    us_cost: {
      ...sc.us_cost,
      shortage: (sc.us_cost.shortage ?? 0) * shortageScale,
      stockpile: Math.round(stockpileKt * STOCKPILE_COST_PER_KT),
    },
    path: { ...sc.path, us_mix: { ...sc.path.us_mix, unmet, stockpile: draw } },
  };
}

// ── Exogenous reshoring overlays ─────────────────────────────────────────────
// Strategic US capacity investments aren't cost-optimal builds (and optimizing them
// is intractable), so we ASSUME a stage goes domestic and just count its cost. The
// TRI drop ÷ cost is the security bought per dollar. reshoreSupply shifts a stage's
// US sourcing toward domestic; the explorer pairs it with an exogenous cost.
function floorStageDomestic(m: any, coverage: number) {
  const rec = m?.recycled ?? 0;
  const dom = Math.max(m?.domestic ?? 0, coverage);
  const rest = Math.max(0, 1 - dom - rec);
  const imp = (m?.allied ?? 0) + (m?.china ?? 0) || 1;
  return { domestic: dom, recycled: rec, allied: rest * (m?.allied ?? 0) / imp, china: rest * (m?.china ?? 0) / imp };
}
// Floor the given stages' US domestic share. `classes` also floors the per-class
// us_supply_re for those RE classes — needed because the integrated TRI shown in the
// tool is heavy-weighted (integratedRE, reads us_supply_re), so a reshore overlay that
// touched only aggregate us_supply would (wrongly) register as ZERO security. A generic
// US separation/alloy/magnet build reshores both classes; a heavy-only project (Round
// Top) passes ['heavy'] so it doesn't spuriously secure the light class.
export function reshoreSupply(sc: Scenario, stages: string[], coverage: number,
                             classes: ('light' | 'heavy')[] = ['light', 'heavy']): Scenario {
  const mapStages = (supply: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const stage in supply) out[stage] = stages.includes(stage) ? floorStageDomestic(supply[stage], coverage) : supply[stage];
    return out;
  };
  const us = mapStages(sc.us_supply);
  let us_re = sc.us_supply_re as any;
  if (us_re) {
    us_re = { ...us_re };
    for (const cls of classes) if (us_re[cls]) us_re[cls] = mapStages(us_re[cls]);
  }
  return { ...sc, us_supply: us, us_supply_re: us_re };
}

// Round Top (USA Rare Earth): the US government's investment in it is a strategic,
// not cost-optimal, move — so it's exogenous, and its $/TRI is a revealed shadow
// price of security. SOURCED (BNEF Critical Minerals Primer 2020, Table 3 / 2019 PEA):
// mine $602M + commercial processor $487M ≈ $1.09B capex; output 2,212 t REO/yr incl.
// 200 t Dy + 23 t Tb = 223 t/yr Dy+Tb — ~25% of the model's US Dy/Tb oxide need
// (~0.8-0.9 kt/yr APS). One mine still is far from a fix. Its mining + (on-site)
// separation shift domestic by that share; the full capex is counted.
export const ROUND_TOP_COST = 1090;       // $M (mine $602M + processor $487M, 2019 PEA)
export const ROUND_TOP_COVERAGE = 0.25;   // share of US heavy-REE need it meets (223 t / ~0.85 kt)
// Developing Round Top gives the US a domestic heavy-REE reserve, lowering the mining
// reserve risk from the "no US deposits" default (0.9) toward a reserve-backed level
// (~0.25). But the credit must scale with how much of US heavy need the reserve actually
// backs (~12%) — a single small mine does NOT solve the reserve risk. The old wholesale
// 0.9→0.25 flip rewarded mere existence, overstating Round Top's TRI benefit (~0.1) and
// pushing the apparent chokepoint to separation; supply-scaling keeps mining the binding
// stage, consistent with the flow-traced model (heavy ore stays ~95%+ China).
const HEAVY_MINING_DI_NODEP = 0.9, HEAVY_MINING_DI_DEVELOPED = 0.25;
export const ROUND_TOP_MINING_DI =
  HEAVY_MINING_DI_NODEP - (HEAVY_MINING_DI_NODEP - HEAVY_MINING_DI_DEVELOPED) * ROUND_TOP_COVERAGE;  // ≈ 0.82

export function applyRoundTop(sc: Scenario, on: boolean): Scenario {
  if (!on) return sc;
  const s = reshoreSupply(sc, ['mining', 'separation'], ROUND_TOP_COVERAGE, ['heavy']);  // heavy-only mine
  return { ...s, us_cost: { ...s.us_cost, round_top: ROUND_TOP_COST }, _di: { mining: ROUND_TOP_MINING_DI } };
}
