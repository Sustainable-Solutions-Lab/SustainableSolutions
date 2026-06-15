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
  _di?: Record<string, number>;   // per-stage DI override from a reserve-developing overlay
};

export const YEARS = (data as any).meta.years as number[];
export const DEMAND_KT_REF = (data as any).meta.demand_kt_ref as number[];
export const US_DEMAND_SHARE = (data as any).meta.us_demand_share as number;

type AxisField = 'make' | 'source' | 'rec' | 'dytb' | 'china' | 'rcost' | 'dscale';
const SC = (data as any).scenarios as Scenario[];
const AX = (data as any).meta.axes as Record<string, number[]>;
// scenario field -> grid-axis name
const FIELD_AXIS: [AxisField, string][] = [
  ['make', 'us_make'], ['source', 'non_china_source'], ['rec', 'recycling'], ['dytb', 'dytb'],
  ['china', 'china'], ['rcost', 'us_recyc_cost'], ['dscale', 'demand_scale'],
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
};

type Point = { make: number; source: number; rec: number; dytb: number; china: number; rcost: number; dscale: number };
const key = (s: Point) =>
  `${s.make}|${s.source}|${s.rec}|${s.dytb}|${s.china}|${s.rcost}|${s.dscale}`;
const LOOKUP = new Map(SC.map((s) => [key(s), s]));
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
  return {
    make: base.make, source: base.source, rec: base.rec, dytb: base.dytb, china: base.china,
    rcost: base.rcost,
    dscale: base.dscale, kpis: wDict('kpis'), cost: wDict('cost'), us_cost: wDict('us_cost'),
    production: wNested('production') as any, us_supply: wNested('us_supply') as any,
    us_supply_re: wSupplyRe(),
    utilization: wNested('utilization') as any, flows, path: wPath(),
  };
}

export function interpScenario(pt: Point): Scenario {
  const brk = FIELD_AXIS.map(([f, ax]) => bracket(AX[ax], pt[f]));
  const n = FIELD_AXIS.length;
  const parts: { s: Scenario; w: number }[] = [];
  for (let m = 0; m < (1 << n); m++) {
    let w = 1;
    const coords: any = {};
    for (let a = 0; a < n; a++) {
      const [lo, hi, t] = brk[a];
      const hiBit = (m >> a) & 1;
      coords[FIELD_AXIS[a][0]] = hiBit ? hi : lo;
      w *= hiBit ? t : 1 - t;
    }
    if (w <= 1e-9) continue;
    const sk = FIELD_AXIS.map(([f, ax]) => snap(AX[ax], coords[f])).join('|');
    const s = LOOKUP.get(sk);
    if (s) parts.push({ s, w });
  }
  return parts.length ? combine(parts) : BASE;
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
  const usSupply: Record<string, { domestic: number; allied: number; china: number }> = {};
  for (const stage in sc.us_supply) {
    const m = sc.us_supply[stage];
    const d = m.domestic ?? 0, a = m.allied ?? 0, c = m.china ?? 0;
    const stageUnmet = Math.max(0, 1 - d - a - c);
    const credit = Math.min(coverage, stageUnmet);
    usSupply[stage] = { domestic: d + credit, allied: a, china: c };
  }

  return {
    ...sc,
    kpis: { ...sc.kpis, us_unmet_kt: Math.max(0, (sc.kpis.us_unmet_kt ?? 0) - drawn) },
    us_supply: usSupply,
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
export function reshoreSupply(sc: Scenario, stages: string[], coverage: number): Scenario {
  const us: Record<string, { domestic: number; allied: number; china: number }> = {};
  for (const stage in sc.us_supply) {
    const m = sc.us_supply[stage];
    if (stages.includes(stage)) {
      const dom = Math.max(m.domestic ?? 0, coverage);
      const rest = Math.max(0, 1 - dom);
      const imp = (m.allied ?? 0) + (m.china ?? 0) || 1;
      us[stage] = { domestic: dom, allied: rest * (m.allied ?? 0) / imp, china: rest * (m.china ?? 0) / imp };
    } else {
      us[stage] = m;
    }
  }
  return { ...sc, us_supply: us };
}

// Round Top (USA Rare Earth): the US government's investment in it is a strategic,
// not cost-optimal, move — so it's exogenous, and its $/TRI is a revealed shadow
// price of security. 2019 PEA: ~$350M capex (incl. on-site separation), ~0.22 kt/yr
// Dy+Tb ≈ only ~12% of US Dy/Tb need — one mine is far from a fix. Its mining + (on-
// site) separation shift domestic by that share; ~$400M (inflated capex) is counted.
export const ROUND_TOP_COST = 400;        // $M (≈ 2019 PEA capex, inflated)
export const ROUND_TOP_COVERAGE = 0.12;   // share of US heavy-REE need it meets
// Developing Round Top means the US now HAS a domestic heavy-REE reserve, so its
// domestic mining is no longer reserve-poor — the mining DI falls from the "no US
// deposits" default (0.9) to a reserve-backed level (Round Top is a 100-yr, large-
// tonnage resource → good reserve adequacy; ~0.25). Without this the TRI would
// penalize Round Top's own output as if the US still had no reserves.
export const ROUND_TOP_MINING_DI = 0.25;

export function applyRoundTop(sc: Scenario, on: boolean): Scenario {
  if (!on) return sc;
  const s = reshoreSupply(sc, ['mining', 'separation'], ROUND_TOP_COVERAGE);
  return { ...s, us_cost: { ...s.us_cost, round_top: ROUND_TOP_COST }, _di: { mining: ROUND_TOP_MINING_DI } };
}
