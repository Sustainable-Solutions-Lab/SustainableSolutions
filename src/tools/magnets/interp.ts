/**
 * Multilinear interpolation over the precomputed scenario grid (6 axes: IRA
 * content, recycling, Dy/Tb intensity, China export restriction, US recycling cost,
 * total-demand scale). The last two demand axes (dytb intensity + demand scale) are
 * driven by the client-side demand builder; the rest are supply-side sliders.
 */
import data from './scenarios.json';

export type Flow = { from: string; to: string; value: number };
export type Scenario = {
  dc: number; rec: number; dytb: number; china: number; rcost: number; dscale: number;
  kpis: Record<string, number>;
  cost: Record<string, number>;
  us_cost: Record<string, number>;
  production: Record<string, Record<string, number>>;
  us_supply: Record<string, { domestic: number; allied: number; china: number }>;
  utilization: Record<string, Record<string, number | null>>;
  flows: Record<string, Flow[]>;
  path: {
    us_mix: Record<string, number[]>;   // domestic / allied / china / unmet, per year
    us_cap: Record<string, number[]>;   // mining / separation / alloy / magnet, per year
    cost_annual: number[];
    primary_dytb: number[];
  };
};

export const YEARS = (data as any).meta.years as number[];
export const DEMAND_KT_REF = (data as any).meta.demand_kt_ref as number[];
export const US_DEMAND_SHARE = (data as any).meta.us_demand_share as number;

type AxisField = 'dc' | 'rec' | 'dytb' | 'china' | 'rcost' | 'dscale';
const SC = (data as any).scenarios as Scenario[];
const AX = (data as any).meta.axes as Record<string, number[]>;
// scenario field -> grid-axis name
const FIELD_AXIS: [AxisField, string][] = [
  ['dc', 'domestic_content'], ['rec', 'recycling'], ['dytb', 'dytb'],
  ['china', 'china'], ['rcost', 'us_recyc_cost'], ['dscale', 'demand_scale'],
];
export const AXES = {
  dcMax: Math.max(...AX.domestic_content),
  recMax: Math.max(...AX.recycling),
  chinaMax: Math.max(...AX.china),
  dytbMin: Math.min(...AX.dytb),     // most-thrifted Dy/Tb (e.g. 0.4 = 40% of today)
  rcostMin: Math.min(...AX.us_recyc_cost),  // baseline US recycling cost factor
  rcostMax: Math.max(...AX.us_recyc_cost),
};

const key = (s: { dc: number; rec: number; dytb: number; china: number; rcost: number; dscale: number }) =>
  `${s.dc}|${s.rec}|${s.dytb}|${s.china}|${s.rcost}|${s.dscale}`;
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
  dc: 0, rec: 0, dytb: 1.0, china: 0, rcost: Math.min(...AX.us_recyc_cost), dscale: 1.0,
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
    for (const { s, w } of ps) {
      for (const g of ['us_mix', 'us_cap'] as const)
        for (const k in s.path[g]) for (let i = 0; i < H; i++) out[g][k][i] += s.path[g][k][i] * w;
      for (let i = 0; i < H; i++) {
        out.cost_annual[i] += s.path.cost_annual[i] * w;
        out.primary_dytb[i] += s.path.primary_dytb[i] * w;
      }
    }
    return out;
  };
  return {
    dc: base.dc, rec: base.rec, dytb: base.dytb, china: base.china, rcost: base.rcost,
    dscale: base.dscale, kpis: wDict('kpis'), cost: wDict('cost'), us_cost: wDict('us_cost'),
    production: wNested('production') as any, us_supply: wNested('us_supply') as any,
    utilization: wNested('utilization') as any, flows, path: wPath(),
  };
}

export function interpScenario(
  pt: { dc: number; rec: number; dytb: number; china: number; rcost: number; dscale: number },
): Scenario {
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
// All-in $/kg of stockpiled finished NdFeB: acquisition (~$80/kg open-market
// magnet) + amortized holding/handling over the horizon. $M/kt == $/kg.
const STOCKPILE_COST_PER_KT = (data as any).meta.stockpile_cost_per_kt ?? 90;
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
  return {
    ...sc,
    kpis: { ...sc.kpis, us_unmet_kt: Math.max(0, (sc.kpis.us_unmet_kt ?? 0) - drawn) },
    us_cost: {
      ...sc.us_cost,
      shortage: (sc.us_cost.shortage ?? 0) * shortageScale,
      stockpile: Math.round(stockpileKt * STOCKPILE_COST_PER_KT),
    },
    path: { ...sc.path, us_mix: { ...sc.path.us_mix, unmet, stockpile: draw } },
  };
}
