/**
 * Bilinear interpolation over the precomputed scenario grid, so the sliders move
 * continuously and KPIs / flows / utilization morph smoothly between solved
 * points. Interpolates over (domestic_content × recycling) within a chosen
 * China-shock plane; the shock toggle is discrete.
 */
import data from './scenarios.json';

export type Flow = { from: string; to: string; value: number };
export type Scenario = {
  dc: number; rec: number; shock: boolean;
  kpis: Record<string, number>;
  cost: Record<string, number>;
  production: Record<string, Record<string, number>>;
  us_supply: Record<string, { domestic: number; allied: number; china: number }>;
  utilization: Record<string, Record<string, number | null>>;
  flows: Record<string, Flow[]>;
};

const SC = (data as any).scenarios as Scenario[];
export const AXES = (data as any).meta.axes as {
  domestic_content: number[]; recycling: number[]; china_shock: boolean[];
};
export const DC_MAX = Math.max(...AXES.domestic_content);
export const REC_MAX = Math.max(...AXES.recycling);

const key = (dc: number, rec: number, shock: boolean) => `${dc}|${rec}|${shock}`;
const LOOKUP = new Map(SC.map((s) => [key(s.dc, s.rec, s.shock), s]));
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blendNums(A: Record<string, number>, B: Record<string, number>, t: number) {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out[k] = lerp(A[k] ?? 0, B[k] ?? 0, t);
  return out;
}

function blendNested(
  A: Record<string, Record<string, number | null>>,
  B: Record<string, Record<string, number | null>>, t: number,
) {
  const out: Record<string, Record<string, number | null>> = {};
  for (const r of new Set([...Object.keys(A), ...Object.keys(B)])) {
    out[r] = {};
    for (const s of new Set([...Object.keys(A[r] ?? {}), ...Object.keys(B[r] ?? {})])) {
      const av = A[r]?.[s], bv = B[r]?.[s];
      out[r][s] = av == null && bv == null ? null : lerp(av ?? 0, bv ?? 0, t); // null only if both absent
    }
  }
  return out;
}

const fkey = (iface: string, f: Flow) => `${iface}|${f.from}|${f.to}`;
function flowMap(s: Scenario) {
  const m = new Map<string, number>();
  for (const iface of Object.keys(s.flows)) for (const f of s.flows[iface]) m.set(fkey(iface, f), f.value);
  return m;
}
function blendFlows(A: Scenario, B: Scenario, t: number) {
  const ma = flowMap(A), mb = flowMap(B), out: Record<string, Flow[]> = {};
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const v = lerp(ma.get(k) ?? 0, mb.get(k) ?? 0, t);
    if (v < 0.05) continue;
    const [iface, from, to] = k.split('|');
    (out[iface] ??= []).push({ from, to, value: v });
  }
  return out;
}

function blend(A: Scenario, B: Scenario, t: number): Scenario {
  if (t <= 0) return A;
  if (t >= 1) return B;
  return {
    dc: lerp(A.dc, B.dc, t), rec: lerp(A.rec, B.rec, t), shock: A.shock,
    kpis: blendNums(A.kpis, B.kpis, t),
    cost: blendNums(A.cost, B.cost, t),
    production: blendNested(A.production as any, B.production as any, t) as any,
    us_supply: blendNested(A.us_supply as any, B.us_supply as any, t) as any,
    utilization: blendNested(A.utilization, B.utilization, t),
    flows: blendFlows(A, B, t),
  };
}

export const BASE = LOOKUP.get(key(AXES.domestic_content[0], AXES.recycling[0], false))!;

export function interpScenario(dc: number, rec: number, shock: boolean): Scenario {
  const [d0, d1, td] = bracket(AXES.domestic_content, dc);
  const [r0, r1, tr] = bracket(AXES.recycling, rec);
  const g = (d: number, r: number) =>
    LOOKUP.get(key(snap(AXES.domestic_content, d), snap(AXES.recycling, r), shock))!;
  const c0 = blend(g(d0, r0), g(d0, r1), tr);
  const c1 = blend(g(d1, r0), g(d1, r1), tr);
  return blend(c0, c1, td);
}
