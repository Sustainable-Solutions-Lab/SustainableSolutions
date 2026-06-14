/**
 * Client-side demand engine — a faithful TS port of the model's magnet_bom
 * sector × coercivity-grade arithmetic, driven by the `demand_config` emitted in
 * scenarios.json meta (so the browser uses the exact same numbers as the solver).
 *
 * It computes, with zero solver cost, the per-sector × grade × year magnet demand
 * for any per-sector IEA-scenario composition + the four demand levers, and maps
 * that composition onto the two demand-summary axes the supply grid is precomputed
 * over: demand_scale (total vs APS) and dytb_intensity (Dy/Tb vs APS).
 */
import data from './scenarios.json';

const CFG = (data as any).meta.demand_config;
export const YEARS = (data as any).meta.years as number[];
export const SECTORS = CFG.sectors as Record<string, any>;
export const SECTOR_KEYS = Object.keys(SECTORS);
export const SCENARIO_NAMES = CFG.scenarios as string[];
export const DEFAULT_SCENARIO = CFG.default_scenario as string;
// Intuitive labels for the IEA scenarios (explained via tooltips in the UI).
export const SCENARIO_LABEL: Record<string, string> = {
  STEPS: 'Current policies', APS: 'Pledges', NZE: 'Net-zero',
};
export const SCENARIO_TIP: Record<string, string> = {
  STEPS: 'IEA Stated Policies Scenario (STEPS) — today’s policies continue.',
  APS: 'IEA Announced Pledges Scenario (APS) — governments meet their stated climate targets.',
  NZE: 'IEA Net Zero Emissions by 2050 Scenario (NZE).',
};
const GRADE_LADDER = CFG.grade_ladder as Record<string, [number, number]>;
const GRADE_ORDER = Object.keys(GRADE_LADDER);       // ascending coercivity
// High-coercivity = the Dy/Tb-heavy grades (≥ half the ladder's max Dy/Tb loading):
// the magnets that genuinely need heavy rare earths (EV traction, wind, defense).
// A Dy/Tb shortage falls on THESE first — low grades can still be made without it.
const _MAXDYTB = Math.max(...GRADE_ORDER.map((g) => GRADE_LADDER[g][1]));
const HI_COERCIVITY = new Set(GRADE_ORDER.filter((g) => GRADE_LADDER[g][1] >= 0.5 * _MAXDYTB));
const OXF = CFG.oxide_factor as number;
const PMSG_DEF = CFG.offshore_pmsg_default as number;
export const OFFSHORE_PMSG_DEFAULT = PMSG_DEF;       // ~0.9; the slider reduces from here
const FIRST = CFG.first_year as number;

// US share of each global sector's magnet demand. Grounded in: US ~10% of global
// EV sales (IEA Global EV Outlook 2023) and ~5.5% of wind additions, mostly onshore
// (GWEC/Enerdata 2023); US is a minor share of e-bikes/appliances and electronics
// (Asia-dominated) but a large share of defense (DoD stockpiling). Weighted avg
// ≈ ~12% of global demand. The within-sector split is best-estimate (the precise
// regional magnet-demand breakdown is proprietary — Adamas / Benchmark).
const US_SECTOR_SHARE: Record<string, number> = {
  ev_traction: 0.12, wind_offshore: 0.08, wind_onshore: 0.10, robotics: 0.16,
  electronics: 0.11, hvac_ebike: 0.05, defense_aero: 0.60,
};

export type Levers = { thrift: number; ev_downshift: number; re_free: number; offshore_pmsg: number };
export const DEFAULT_LEVERS: Levers = { thrift: 0, ev_downshift: 0, re_free: 0, offshore_pmsg: PMSG_DEF };
export type PerSectorScenario = Record<string, string>;   // sector -> scenario name
export const allScenario = (name: string): PerSectorScenario =>
  Object.fromEntries(SECTOR_KEYS.map((k) => [k, name]));

// Friendly labels for the UI.
export const SECTOR_LABEL: Record<string, string> = {
  ev_traction: 'EV traction', wind_offshore: 'Offshore wind', wind_onshore: 'Onshore wind',
  robotics: 'Robotics', electronics: 'Electronics', hvac_ebike: 'HVAC / e-bike', defense_aero: 'Defense',
};
export const SECTOR_COLOR: Record<string, string> = {
  ev_traction: '#3288BD', wind_offshore: '#5E4FA2', wind_onshore: '#66C2A5', robotics: '#F46D43',
  electronics: '#FEE08B', hvac_ebike: '#ABDDA4', defense_aero: '#D53E4F',
};

function downshift(mix: Record<string, number>, amount: number): Record<string, number> {
  if (amount <= 0) return { ...mix };
  const out: Record<string, number> = {};
  for (const g of GRADE_ORDER) out[g] = 0;
  for (const g in mix) {
    const i = GRADE_ORDER.indexOf(g);
    out[g] += mix[g] * (1 - amount);
    out[GRADE_ORDER[Math.max(0, i - 1)]] += mix[g] * amount;
  }
  return out;
}
const gradeDytbOxide = (grade: string, thrift: number) => GRADE_LADDER[grade][1] * OXF * (1 - thrift);

/** per sector -> per grade -> per-year magnet kt */
export function sectorGradeDemand(scenario: PerSectorScenario, lv: Levers) {
  const out: Record<string, Record<string, number[]>> = {};
  for (const sk of SECTOR_KEYS) {
    const s = SECTORS[sk];
    const [base, growth] = s.scenarios[scenario[sk] ?? DEFAULT_SCENARIO];
    const mix = s.motor ? downshift(s.grade_mix, lv.ev_downshift) : s.grade_mix;
    let scale = s.motor ? 1 - lv.re_free : 1;
    if (s.offshore) scale *= lv.offshore_pmsg / PMSG_DEF;
    scale *= US_SECTOR_SHARE[sk] ?? 1;   // show the US share of each global sector
    out[sk] = {};
    YEARS.forEach((y, iy) => {
      const kt = base * Math.pow(1 + growth, y - FIRST) * (s.kg_per_unit / 1e6) * scale;
      for (const g in mix) (out[sk][g] ??= Array(YEARS.length).fill(0))[iy] += kt * mix[g];
    });
  }
  return out;
}

/** per-sector magnet kt and Dy/Tb-oxide kt over the years (for the builder charts) */
export function sectorBreakdown(scenario: PerSectorScenario, lv: Levers) {
  const sg = sectorGradeDemand(scenario, lv);
  const magnet: Record<string, number[]> = {}, dytb: Record<string, number[]> = {};
  for (const sk of SECTOR_KEYS) {
    magnet[sk] = Array(YEARS.length).fill(0);
    dytb[sk] = Array(YEARS.length).fill(0);
    for (const g in sg[sk]) {
      const gi = gradeDytbOxide(g, lv.thrift);
      for (let i = 0; i < YEARS.length; i++) {
        magnet[sk][i] += sg[sk][g][i];
        dytb[sk][i] += sg[sk][g][i] * gi;
      }
    }
  }
  return { magnet, dytb };
}

function totals(scenario: PerSectorScenario, lv: Levers) {
  const sg = sectorGradeDemand(scenario, lv);
  const total = Array(YEARS.length).fill(0), oxDytb = Array(YEARS.length).fill(0);
  for (const sk of SECTOR_KEYS)
    for (const g in sg[sk]) {
      const gi = gradeDytbOxide(g, lv.thrift);
      for (let i = 0; i < YEARS.length; i++) { total[i] += sg[sk][g][i]; oxDytb[i] += sg[sk][g][i] * gi; }
    }
  return { total, oxDytb };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const REF = totals(allScenario('APS'), DEFAULT_LEVERS);   // the precompute reference

// Sectors ordered LARGEST first by STARTING-YEAR (2026) magnet demand — used to
// stack the biggest at the bottom of the area charts and to order the list.
const _mag = sectorBreakdown(allScenario('APS'), DEFAULT_LEVERS).magnet;
export const SECTORS_BY_SIZE = [...SECTOR_KEYS].sort((a, b) => _mag[b][0] - _mag[a][0]);

/** Share of total magnet demand that is high-coercivity (Dy/Tb-heavy) grades. */
function hiCoercivityShare(scenario: PerSectorScenario, lv: Levers): number {
  const sg = sectorGradeDemand(scenario, lv);
  let hi = 0, all = 0;
  for (const sk of SECTOR_KEYS)
    for (const g in sg[sk]) {
      const s = sum(sg[sk][g]);
      all += s; if (HI_COERCIVITY.has(g)) hi += s;
    }
  return all > 0 ? hi / all : 0;
}

/** Map a composition + levers onto the supply grid's two demand-summary axes. */
export function demandSummary(scenario: PerSectorScenario, lv: Levers) {
  const cur = totals(scenario, lv);
  return {
    demand_scale: sum(cur.total) / sum(REF.total),
    dytb_intensity: (sum(cur.oxDytb) / sum(cur.total)) / (sum(REF.oxDytb) / sum(REF.total)),
    totalSeries: cur.total,
    hiCoercShare: hiCoercivityShare(scenario, lv),
  };
}
