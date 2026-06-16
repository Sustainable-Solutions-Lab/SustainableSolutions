/**
 * Real-world NdFeB supply-chain projects (the actual + announced global build-out),
 * used as a FRONT-END overlay on the 3-region model. Two jobs:
 *
 *  1. Country-level trade-risk. The optimization resolves only USA / China / RoW,
 *     so "allied" supply is one bucket. But allied REE capacity is really spread
 *     across a handful of countries (Australia, Japan, Malaysia, France, Germany…)
 *     — and unevenly: allied alloy + magnet are heavily Japan-concentrated. We use
 *     these projects' capacities to compute a real per-stage allied-import HHI,
 *     retiring the old flat N_ALLY≈4 diversity fudge (see tri.ts).
 *
 *  2. A selectable "projected supply chain" overlay (the explorer panel): the user
 *     turns real projects on/off (and scales them) to see the chain the world is
 *     actually building, reconciled with the least-cost model via the shadow price
 *     of security (a real strategic project is assumed economic given the security
 *     value some government places on it).
 *
 * CAPACITIES are representative annual nameplate (kt/yr of that stage's product),
 * grounded in the model's sourced facility tables (data/raw/*.csv) plus public
 * 2024–26 announcements. They are ILLUSTRATIVE and meant for expert review — the
 * exact tonnages (and which projects to include) are a curation call.
 */

export type Stage = 'mining' | 'separation' | 'alloy' | 'magnet' | 'recycling';
export type Bloc = 'us' | 'allied' | 'china' | 'nonaligned';
export type Status = 'operating' | 'construction' | 'planned' | 'announced';

export type Project = {
  id: string;
  name: string;
  stage: Stage;
  country: string;
  bloc: Bloc;
  capacityKt: number;      // representative annual nameplate, kt/yr of stage product
  status: Status;
  heavy?: boolean;         // mining/separation: heavy-REE (Dy/Tb)-bearing source
  note?: string;
};

// "Realistic 2026" = what is operating or under construction (vs merely planned /
// announced). Drives the default selection + the preset button.
export const REALISTIC: Status[] = ['operating', 'construction'];
export const isRealistic = (p: Project) => REALISTIC.includes(p.status);

// Genuine US-aligned blocs get allied diversity credit. Russia (nonaligned) is a
// source but NOT a security hedge, so it is excluded from the allied HHI.
const ALLIED_BLOC: Bloc = 'allied';

export const STAGE_LABEL: Record<Stage, string> = {
  mining: 'Mining (ore → concentrate)', separation: 'Separation (oxide)',
  alloy: 'Alloy (metal / strip-cast)', magnet: 'Magnet (sintered NdFeB)',
  recycling: 'Recycling (end-of-life)',
};
export const STAGE_ORDER: Stage[] = ['mining', 'separation', 'alloy', 'magnet', 'recycling'];

export const BLOC_LABEL: Record<Bloc, string> = {
  us: 'United States', allied: 'Allies', china: 'China', nonaligned: 'Non-aligned',
};

// ── The project list ─────────────────────────────────────────────────────────
// Grounded in data/raw/{deposits,separation_plants,alloy_plants,magnet_plants,
// recycling_plants}.csv (region/country, sourced) + public 2024–26 figures.
export const PROJECTS: Project[] = [
  // MINING (kt REO concentrate / yr, representative)
  { id: 'mp_mine', name: 'Mountain Pass', stage: 'mining', country: 'United States', bloc: 'us', capacityKt: 42, status: 'operating', heavy: false, note: 'MP Materials — the only operating US REE mine; light-REE (bastnäsite).' },
  { id: 'round_top', name: 'Round Top', stage: 'mining', country: 'United States', bloc: 'us', capacityKt: 2.5, status: 'planned', heavy: true, note: 'USA Rare Earth, TX — heavy-REE-enriched rhyolite; pre-commercial (2019 PEA).' },
  { id: 'mt_weld', name: 'Mt Weld (Lynas)', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 22, status: 'operating', heavy: false, note: 'Lynas — the largest ex-China light-REE mine.' },
  { id: 'nolans', name: 'Nolans', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 13, status: 'planned', heavy: false, note: 'Arafura — NdPr-focused, financing stage.' },
  { id: 'serra_verde', name: 'Serra Verde', stage: 'mining', country: 'Brazil', bloc: 'allied', capacityKt: 5, status: 'operating', heavy: true, note: 'Ion-adsorption clay (2024) — a rare ex-China heavy-REE source.' },
  { id: 'lovozero', name: 'Lovozero', stage: 'mining', country: 'Russia', bloc: 'nonaligned', capacityKt: 6, status: 'operating', heavy: false, note: 'Loparite — counted as a source but NOT an allied hedge.' },

  // SEPARATION (kt separated oxide / yr)
  { id: 'mp_sep', name: 'Mountain Pass separation', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 12, status: 'operating', heavy: false, note: 'MP Materials on-site SX (NdPr); ramping.' },
  { id: 'energy_fuels', name: 'Energy Fuels (White Mesa)', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 8, status: 'construction', heavy: false, note: 'Monazite → NdPr oxide; phased build-out, Utah.' },
  { id: 'lynas_seadrift', name: 'Lynas Seadrift', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 5, status: 'construction', heavy: true, note: 'Lynas US DoD-backed plant, TX — light + heavy SX.' },
  { id: 'lynas_malaysia', name: 'Lynas Malaysia', stage: 'separation', country: 'Malaysia', bloc: 'allied', capacityKt: 24, status: 'operating', heavy: false, note: 'The dominant ex-China separation capacity.' },
  { id: 'solvay', name: 'Solvay La Rochelle', stage: 'separation', country: 'France', bloc: 'allied', capacityKt: 8, status: 'operating', heavy: false, note: 'Restarting NdPr separation, 2024–26.' },

  // ALLOY / METAL (kt strip-cast alloy / yr)
  { id: 'mp_alloy', name: 'MP Fort Worth (metal/alloy)', stage: 'alloy', country: 'United States', bloc: 'us', capacityKt: 10, status: 'operating', note: 'MP Materials metal + strip-cast, TX.' },
  { id: 'japan_alloy', name: 'Japan alloy (Shin-Etsu/TDK)', stage: 'alloy', country: 'Japan', bloc: 'allied', capacityKt: 30, status: 'operating', note: 'Established allied metal/alloy capacity.' },
  { id: 'neo_estonia_alloy', name: 'Neo Narva (Estonia, alloy)', stage: 'alloy', country: 'Estonia', bloc: 'allied', capacityKt: 2, status: 'operating', note: 'Neo Performance Materials — integrated oxide→metal→alloy feeding its Narva magnet line (EU Just Transition Fund; opened 2025).' },
  { id: 'eu_alloy', name: 'EU metal/alloy', stage: 'alloy', country: 'Germany', bloc: 'allied', capacityKt: 8, status: 'planned', note: 'Nascent EU alloy under the CRMA.' },

  // MAGNET (kt sintered NdFeB / yr)
  { id: 'mp_mag', name: 'MP Fort Worth (magnets)', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 10, status: 'operating', note: 'MP Materials sintered magnets (GM offtake), 2025.' },
  { id: 'evac', name: 'e-VAC Magnetics', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 8, status: 'construction', note: 'VAC US plant, South Carolina (DoD/GM-backed).' },
  { id: 'noveon', name: 'Noveon', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 4, status: 'operating', note: 'Noveon Magnetics, TX — sintered + recycled feedstock.' },
  { id: 'japan_mag', name: 'Japan magnets (Shin-Etsu/TDK/Hitachi)', stage: 'magnet', country: 'Japan', bloc: 'allied', capacityKt: 60, status: 'operating', note: 'The dominant ex-China magnet capacity.' },
  { id: 'vac_eu', name: 'VAC (Germany)', stage: 'magnet', country: 'Germany', bloc: 'allied', capacityKt: 8, status: 'operating', note: 'Vacuumschmelze — EU sintered magnets.' },
  { id: 'neo_estonia', name: 'Neo Narva (Estonia)', stage: 'magnet', country: 'Estonia', bloc: 'allied', capacityKt: 2, status: 'operating', note: 'Neo Performance Materials — Europe’s first large-scale sintered NdFeB plant (Narva); 2 kt/yr, expandable to 5+ kt, ramping 2026. ~15% of EU magnet demand.' },

  // RECYCLING (kt recovered oxide-equivalent / yr)
  { id: 'noveon_rec', name: 'Noveon (recycling)', stage: 'recycling', country: 'United States', bloc: 'us', capacityKt: 3, status: 'operating', note: 'Closed-loop sintered-magnet recycling, TX.' },
  { id: 'cyclic', name: 'Cyclic Materials', stage: 'recycling', country: 'United States', bloc: 'us', capacityKt: 3, status: 'construction', note: 'EoL magnet recycling (US/Canada).' },
  { id: 'hypromag', name: 'HyProMag', stage: 'recycling', country: 'United Kingdom', bloc: 'allied', capacityKt: 2, status: 'construction', note: 'HPMS hydrogen recycling (UK + US).' },
];

// ── Country-level allied-import HHI per stage ────────────────────────────────
/** Herfindahl concentration (Σ shareᵢ²) of ACTIVE allied capacity across countries
 * at a stage. 1 = a single allied country; → 0 as allied supply diversifies. Uses
 * only genuine allies (excludes nonaligned sources). Falls back to 1 (max concen-
 * tration, no diversity credit) if no allied capacity is active at that stage. */
export function alliedHHI(stage: Stage, active: Set<string>, scale: Record<string, number> = {}): number {
  const byCountry: Record<string, number> = {};
  for (const p of PROJECTS) {
    if (p.stage !== stage || p.bloc !== ALLIED_BLOC || !active.has(p.id)) continue;
    byCountry[p.country] = (byCountry[p.country] ?? 0) + p.capacityKt * (scale[p.id] ?? 1);
  }
  const tot = Object.values(byCountry).reduce((a, b) => a + b, 0);
  if (tot <= 1e-9) return 1;
  return Object.values(byCountry).reduce((a, v) => a + (v / tot) ** 2, 0);
}

/** Per-stage allied HHI map for the four TRI stages, from the active selection. */
export function alliedHHIByStage(active: Set<string>, scale: Record<string, number> = {}): Record<string, number> {
  return {
    mining: alliedHHI('mining', active, scale),
    separation: alliedHHI('separation', active, scale),
    alloy: alliedHHI('alloy', active, scale),
    magnet: alliedHHI('magnet', active, scale),
  };
}

// Map a project bloc to the model's three Sankey regions.
const REGION_OF_BLOC: Record<Bloc, 'USA' | 'China' | 'RoW'> = {
  us: 'USA', china: 'China', allied: 'RoW', nonaligned: 'RoW',
};

/** Selected real-world production capacity by model region (USA / China / RoW) at a
 * stage — the basis for the real-world-anchored supply-chain Sankey (the active
 * projects are locked in by region; China is the residual backstop). */
export function regionalCapacity(stage: Stage, active: Set<string>, scale: Record<string, number> = {}): Record<'USA' | 'China' | 'RoW', number> {
  const out: Record<'USA' | 'China' | 'RoW', number> = { USA: 0, China: 0, RoW: 0 };
  for (const p of PROJECTS) {
    if (p.stage !== stage || !active.has(p.id)) continue;
    out[REGION_OF_BLOC[p.bloc]] += p.capacityKt * (scale[p.id] ?? 1);
  }
  return out;
}

/** Class-specific US/China/RoW capacity at a stage: heavy-REE projects (ion-clay,
 * Round Top, Lynas Seadrift…) count toward 'heavy', the rest toward 'light'. Used to
 * floor the light vs heavy trade-risk index separately (magnet stage uses the
 * element-agnostic regionalCapacity instead). */
export function regionalCapacityRe(stage: Stage, active: Set<string>, cls: 'light' | 'heavy', scale: Record<string, number> = {}): Record<'USA' | 'China' | 'RoW', number> {
  const out: Record<'USA' | 'China' | 'RoW', number> = { USA: 0, China: 0, RoW: 0 };
  for (const p of PROJECTS) {
    if (p.stage !== stage || !active.has(p.id)) continue;
    if ((cls === 'heavy') !== !!p.heavy) continue;   // heavy class ⟷ heavy-flagged projects
    out[REGION_OF_BLOC[p.bloc]] += p.capacityKt * (scale[p.id] ?? 1);
  }
  return out;
}

// Illustrative US build cost ($M) per kt/yr of stage capacity, calibrated so Round Top
// (2.5 kt mining) ≈ the ROUND_TOP_COST $400M used by the cost-of-security lever. Tunable,
// like all security-investment figures (US separation is the capital-intensive standout).
export const US_PROJECT_BUILD_RATE: Record<Stage, number> = {
  mining: 160, separation: 100, alloy: 45, magnet: 50, recycling: 50,
};
/** Build cost ($M) of the active US-bloc projects still being BUILT (construction +
 * planned) — the forward-looking US strategic build whose cost belongs in the NPV.
 * Operating/ramping US plants are sunk and already in the modeled baseline, so they are
 * excluded to avoid double-counting; the model meets the residual demand at modeled cost. */
export function usProjectsBuildCost(active: Set<string>, scale: Record<string, number> = {}): number {
  let cost = 0;
  for (const p of PROJECTS) {
    if (p.bloc !== 'us' || !active.has(p.id)) continue;
    if (p.status !== 'construction' && p.status !== 'planned') continue;
    cost += p.capacityKt * (scale[p.id] ?? 1) * US_PROJECT_BUILD_RATE[p.stage];
  }
  return cost;
}

/** The active projects making up a (stage, model-region) node, with each one's
 * nameplate (scaled) capacity — for the Sankey facility hover. For mining/separation a
 * class (heavy/light) filter applies (a light mine doesn't make heavy oxide); alloy +
 * magnet are element-agnostic, so no class filter. China is the model's residual and
 * has no listed facilities → returns []. */
export function facilityBreakdown(
  stage: Stage, region: 'USA' | 'China' | 'RoW', active: Set<string>,
  scale: Record<string, number> = {}, cls?: 'heavy' | 'light',
): { name: string; cap: number; country: string }[] {
  const applyClass = cls && (stage === 'mining' || stage === 'separation');
  const out: { name: string; cap: number; country: string }[] = [];
  for (const p of PROJECTS) {
    if (p.stage !== stage || !active.has(p.id) || REGION_OF_BLOC[p.bloc] !== region) continue;
    if (applyClass && (cls === 'heavy') !== !!p.heavy) continue;
    out.push({ name: p.name, cap: p.capacityKt * (scale[p.id] ?? 1), country: p.country });
  }
  return out.sort((a, b) => b.cap - a.cap);
}

/** Default selection = the realistic (operating + under-construction) projects. */
export const DEFAULT_ACTIVE = new Set(PROJECTS.filter(isRealistic).map((p) => p.id));
export const ALL_IDS = new Set(PROJECTS.map((p) => p.id));

// Mature incumbents are ALWAYS included (they won't stop operating). But several
// "operating" plants are really new + still ramping (2023–26 starts), so they're
// toggleable in 'new supplies' alongside construction/planned, to show the effect of
// those investments. Tiers: mature (always on) · ramping · construction · planned.
export const RAMPING_IDS = new Set([
  'mp_sep', 'mp_alloy', 'mp_mag', 'noveon', 'noveon_rec', 'neo_estonia', 'neo_estonia_alloy', 'solvay', 'serra_verde',
]);
export type Tier = 'mature' | 'ramping' | 'construction' | 'planned';
export const tier = (p: Project): Tier =>
  RAMPING_IDS.has(p.id) ? 'ramping' : p.status === 'operating' ? 'mature' : (p.status as Tier);
export const OPERATING_IDS = new Set(PROJECTS.filter((p) => tier(p) === 'mature').map((p) => p.id));
export const FUTURE_PROJECTS = PROJECTS.filter((p) => tier(p) !== 'mature');
export const DEFAULT_FUTURE = new Set(
  PROJECTS.filter((p) => tier(p) === 'ramping' || tier(p) === 'construction').map((p) => p.id));
/** The full active set the model overlay sees: operating (always) + chosen future. */
export const activeSet = (future: Set<string>): Set<string> => new Set([...OPERATING_IDS, ...future]);
