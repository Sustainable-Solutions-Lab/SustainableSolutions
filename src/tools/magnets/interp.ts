/**
 * Multilinear interpolation over the precomputed scenario grid (5 axes:
 * IRA content, recycling, Dy/Tb intensity, China export restriction, US recycling
 * cost), so all sliders move continuously and every view morphs smoothly between
 * solved points.
 */
import data from './scenarios.json';

export type Flow = { from: string; to: string; value: number };
export type Scenario = {
  dc: number; rec: number; dytb: number; china: number; rcost: number;
  kpis: Record<string, number>;
  cost: Record<string, number>;
  production: Record<string, Record<string, number>>;
  us_supply: Record<string, { domestic: number; allied: number; china: number }>;
  utilization: Record<string, Record<string, number | null>>;
  flows: Record<string, Flow[]>;
};

type AxisField = 'dc' | 'rec' | 'dytb' | 'china' | 'rcost';
const SC = (data as any).scenarios as Scenario[];
const AX = (data as any).meta.axes as Record<string, number[]>;
// scenario field -> grid-axis name
const FIELD_AXIS: [AxisField, string][] = [
  ['dc', 'domestic_content'], ['rec', 'recycling'], ['dytb', 'dytb'],
  ['china', 'china'], ['rcost', 'us_recyc_cost'],
];
export const AXES = {
  dcMax: Math.max(...AX.domestic_content),
  recMax: Math.max(...AX.recycling),
  chinaMax: Math.max(...AX.china),
  dytbMin: Math.min(...AX.dytb),     // most-thrifted Dy/Tb (e.g. 0.4 = 40% of today)
  rcostMin: Math.min(...AX.us_recyc_cost),  // baseline US recycling cost factor
  rcostMax: Math.max(...AX.us_recyc_cost),
};

const key = (s: { dc: number; rec: number; dytb: number; china: number; rcost: number }) =>
  `${s.dc}|${s.rec}|${s.dytb}|${s.china}|${s.rcost}`;
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

export const BASE = LOOKUP.get(key({
  dc: 0, rec: 0, dytb: Math.max(...AX.dytb), china: 0, rcost: Math.min(...AX.us_recyc_cost),
}))!;

function combine(parts: { s: Scenario; w: number }[]): Scenario {
  const tot = parts.reduce((a, p) => a + p.w, 0) || 1;
  const ps = parts.map((p) => ({ s: p.s, w: p.w / tot }));
  const base = ps[0].s;
  const wDict = (field: 'kpis' | 'cost') => {
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
  return {
    dc: base.dc, rec: base.rec, dytb: base.dytb, china: base.china, rcost: base.rcost,
    kpis: wDict('kpis'), cost: wDict('cost'),
    production: wNested('production') as any, us_supply: wNested('us_supply') as any,
    utilization: wNested('utilization') as any, flows,
  };
}

export function interpScenario(
  pt: { dc: number; rec: number; dytb: number; china: number; rcost: number },
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
