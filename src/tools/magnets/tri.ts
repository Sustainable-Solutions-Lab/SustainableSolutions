/**
 * Trade Risk Index (TRI) for the US magnet supply chain, adapting the framework of
 * Cheng et al. (2025, Nature Climate Change, "Trade risks to energy security in
 * net-zero emissions energy scenarios"). Their per-commodity index is
 *
 *     TRI = HHI(import sources) · import-reliance  +  DI(domestic reserves) · (1 − import-reliance)
 *
 * where HHI is the Herfindahl concentration of WHERE imports come from, import-
 * reliance is the share of demand met by imports, and DI is a domestic-reserve
 * dependency score (high when domestic supply itself rests on scarce reserves).
 *
 * We compute it PER SUPPLY-CHAIN STAGE for the US (mining → separation → alloy →
 * magnet) from the model's us_supply shares, and extend it with an explicit
 * UNMET term (demand the chain can't deliver = maximal insecurity), which the
 * original framework — built on historical trade that always clears — has no need
 * for. Each stage TRI ∈ [0, 1]; an integrated index is a value-weighted average.
 *
 * The two judgement calls (DI by stage, the integrating weights) are illustrative,
 * documented, and meant to be tuned — they are the US-conclusion-critical
 * assumptions here, in the spirit of the rare-magnets-cem sensitivity-test ethos.
 */
import type { Scenario } from './interp';

export const TRI_STAGES = [
  { key: 'mining', label: 'Mining (ore)' },
  { key: 'separation', label: 'Separation (oxide)' },
  { key: 'alloy', label: 'Alloy' },
  { key: 'magnet', label: 'Magnet' },
];

// Domestic-reserve dependency by stage: the risk that even US-DOMESTIC supply is
// constrained at its root. Heavy-REE ORE is the binding scarcity in the NEAR TERM —
// the one active US mine (Mountain Pass) is light-REE, and domestic heavy-REE
// prospects (Round Top TX, Bokan AK, coal/byproduct) are pre-commercial — so mining
// scores near-max; processing stages are buildable given feedstock, so they score
// low. Tunable; would fall for mining if a US heavy-REE mine is developed.
export const TRI_DI: Record<string, number> = {
  mining: 0.9, separation: 0.35, alloy: 0.2, magnet: 0.15,
};
// Integrating weights ≈ economic value added / strategic criticality along the
// NdFeB chain (separation and magnet are the high-value, chokepoint steps). Tunable.
export const TRI_WEIGHT: Record<string, number> = {
  mining: 0.15, separation: 0.35, alloy: 0.2, magnet: 0.3,
};
// The model resolves only 3 regions (US / China / RoW), so "allies" is one bucket —
// but allied REE supply is actually spread across several countries (Australia,
// Japan, Malaysia, EU…), UNEVENLY (allied alloy + magnet are heavily Japan-
// concentrated). The allied share's contribution to the import HHI is therefore
// weighted by a real per-stage allied-country Herfindahl, computed from actual +
// announced project capacities (see projects.ts). N_ALLY is only the fallback when
// no country breakdown is supplied (≈ 4 equally-sized allied suppliers). China
// stays ~1 (it IS one source).
const N_ALLY = 4;
const DEFAULT_ALLIED_HHI = 1 / N_ALLY;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Mix = { domestic: number; allied: number; china: number };

/** Per-stage TRI ∈ [0,1] from the US sourcing mix (shares of that stage's need).
 * diOverride replaces the stage's domestic-reserve risk DI — used when a domestic
 * RESERVE has been developed (e.g. Round Top), so US production is no longer
 * reserve-poor and its DI should fall from the "no domestic deposits" default. */
export function stageTRI(mix: Mix | undefined, stage: string, diOverride?: number, alliedHHI?: number): number {
  const d = clamp01(mix?.domestic ?? 0);
  const a = clamp01(mix?.allied ?? 0);
  const c = clamp01(mix?.china ?? 0);
  const imp = Math.min(1, a + c);
  const unmet = Math.max(0, 1 - d - imp);   // demand the chain can't deliver
  let hhi = 0;
  if (imp > 1e-6) {
    const sa = a / (a + c), sc = c / (a + c);
    // allied share weighted by the real allied-country concentration (Herfindahl);
    // China is a single source. → allied_HHI (all-allied) … 1 (all-China).
    const aH = alliedHHI ?? DEFAULT_ALLIED_HHI;
    hhi = sa * sa * aH + sc * sc;
  }
  const di = diOverride ?? TRI_DI[stage] ?? 0;
  // imports weighted by concentration; domestic weighted by reserve risk; unmet = max
  return hhi * imp + di * d + 1.0 * unmet;
}

// per-stage DI override carried on a scenario by a reserve-developing overlay
const diOf = (sc: Scenario): Record<string, number> | undefined => (sc as any)._di;

export function stageBreakdown(sc: Scenario, alliedHHI?: Record<string, number>) {
  const di = diOf(sc);
  return TRI_STAGES.map((s) => {
    const mix = sc.us_supply?.[s.key];
    const d = clamp01(mix?.domestic ?? 0), a = clamp01(mix?.allied ?? 0), c = clamp01(mix?.china ?? 0);
    return {
      ...s,
      tri: stageTRI(mix, s.key, di?.[s.key], alliedHHI?.[s.key]),
      reliance: Math.min(1, a + c),
      unmet: Math.max(0, 1 - d - Math.min(1, a + c)),
      domestic: d,
    };
  });
}

/** Value-weighted integrated TRI ∈ [0,1] across the four stages. */
export function integratedTRI(sc: Scenario, alliedHHI?: Record<string, number>): number {
  const di = diOf(sc);
  let num = 0, den = 0;
  for (const s of TRI_STAGES) {
    const w = TRI_WEIGHT[s.key] ?? 0;
    num += w * stageTRI(sc.us_supply?.[s.key], s.key, di?.[s.key], alliedHHI?.[s.key]);
    den += w;
  }
  return den ? num / den : 0;
}

// ── Light (Nd/Pr) vs heavy (Dy/Tb) split ─────────────────────────────────────
// The US + allies DO have light-REE reserves (Mountain Pass, Mt Weld…), so the
// light-mining reserve risk is low; heavy-REE (Dy/Tb) is the real chokepoint (ion-
// adsorption clay, ~China/Myanmar; no US/ally reserves), so it keeps the high DI.
const LIGHT_MINING_DI = 0.25;
// Integrate the two classes weighting HEAVY higher — it's the binding, strategic
// constraint even though it's a small mass fraction. Tunable, paper-relevant.
export const RE_CLASS_WEIGHT = { heavy: 0.6, light: 0.4 };

type SupplyMap = Record<string, Mix> | undefined;
function breakdownOf(us: SupplyMap, alliedHHI?: Record<string, number>, di?: Record<string, number>) {
  return TRI_STAGES.map((s) => {
    const mix = us?.[s.key];
    const d = clamp01(mix?.domestic ?? 0), a = clamp01(mix?.allied ?? 0), c = clamp01(mix?.china ?? 0);
    return { ...s, tri: stageTRI(mix, s.key, di?.[s.key], alliedHHI?.[s.key]),
      reliance: Math.min(1, a + c), unmet: Math.max(0, 1 - d - Math.min(1, a + c)), domestic: d };
  });
}
function integratedOf(us: SupplyMap, alliedHHI?: Record<string, number>, di?: Record<string, number>) {
  let num = 0, den = 0;
  for (const s of TRI_STAGES) { const w = TRI_WEIGHT[s.key] ?? 0; num += w * stageTRI(us?.[s.key], s.key, di?.[s.key], alliedHHI?.[s.key]); den += w; }
  return den ? num / den : 0;
}
const classDI = (sc: Scenario, cls: 'light' | 'heavy') => {
  const di = diOf(sc) ?? {};
  return cls === 'light' ? { ...di, mining: LIGHT_MINING_DI } : di;  // light: US has reserves
};
const classSupply = (sc: Scenario, cls: 'light' | 'heavy'): SupplyMap =>
  sc.us_supply_re?.[cls] ?? sc.us_supply;   // fall back to aggregate if the grid lacks the split

export function stageBreakdownClass(sc: Scenario, cls: 'light' | 'heavy', alliedHHI?: Record<string, number>) {
  return breakdownOf(classSupply(sc, cls), alliedHHI, sc.us_supply_re ? classDI(sc, cls) : diOf(sc));
}
export function classTRI(sc: Scenario, cls: 'light' | 'heavy', alliedHHI?: Record<string, number>): number {
  return integratedOf(classSupply(sc, cls), alliedHHI, sc.us_supply_re ? classDI(sc, cls) : diOf(sc));
}
/** Integrated TRI across both RE classes (heavy weighted higher). Falls back to the
 * aggregate index when the grid has no light/heavy split. */
export function integratedRE(sc: Scenario, alliedHHI?: Record<string, number>): number {
  if (!sc.us_supply_re) return integratedTRI(sc, alliedHHI);
  return RE_CLASS_WEIGHT.heavy * classTRI(sc, 'heavy', alliedHHI) + RE_CLASS_WEIGHT.light * classTRI(sc, 'light', alliedHHI);
}

// green (secure) → amber → red (exposed)
export function riskColor(tri: number): string {
  const t = clamp01(tri);
  if (t < 0.33) return '#66C2A5';
  if (t < 0.55) return '#FEE08B';
  if (t < 0.75) return '#FDAE61';
  return '#D53E4F';
}
