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
 * CAPACITIES are annual nameplate (kt/yr of that stage's product), and an
 * OPERATING project holds what is INSTALLED, not what its owner has announced.
 * Until 2026-09-27 this list, like the model's facility tables, recorded 2028–30
 * targets as operating plant (MP Fort Worth 10 kt of magnets against 1 installed;
 * Japan 60 against about 9). Units by stage: mining kt REO in concentrate;
 * separation kt NdPr + Dy/Tb oxide; alloy kt NdFeB alloy, the smaller of metal
 * making and strip casting; magnet kt finished magnet; recycling kt scrap
 * processed. Sources are the model repo's data/raw/*.csv and
 * docs/15_capacity_audit_and_screen.md. Japan and MP's alloy line are inferred.
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
  { id: 'mp_mine', name: 'Mountain Pass', stage: 'mining', country: 'United States', bloc: 'us', capacityKt: 51, status: 'operating', heavy: false, note: 'MP Materials — the only operating US REE mine; light-REE (bastnäsite). 50.7 kt REO in concentrate in 2025; 60 kt is a company target.' },
  { id: 'round_top', name: 'Round Top', stage: 'mining', country: 'United States', bloc: 'us', capacityKt: 2.5, status: 'planned', heavy: true, note: 'USA Rare Earth, TX — heavy-REE-enriched rhyolite; pre-commercial. Sourced (BNEF 2020, 2019 PEA): 2.2 kt REO/yr incl. 200 t Dy + 23 t Tb; mine $602M + processor $487M.' },
  { id: 'browns_range', name: 'Browns Range', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 0.6, status: 'planned', heavy: true, note: 'Northern Minerals — the flagship ex-China DYSPROSIUM mine (xenotime); feasibility, ~2027; tiny scale (BNEF: ~88 t NdPr-eq/yr) underscores how thin the ex-China heavy pipeline is.' },
  { id: 'mt_weld', name: 'Mt Weld (Lynas)', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 29, status: 'operating', heavy: false, note: 'Lynas — the largest ex-China light-REE mine. Australia produced 29 kt REO in 2024 (USGS).' },
  { id: 'nolans', name: 'Nolans', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 13, status: 'planned', heavy: false, note: 'Arafura — NdPr-focused, financing stage.' },
  { id: 'serra_verde', name: 'Serra Verde', stage: 'mining', country: 'Brazil', bloc: 'allied', capacityKt: 2, status: 'operating', heavy: true, note: 'Ion-adsorption clay — a rare ex-China heavy-REE source. 2.0 kt REO in 2025 (USGS); 6.4 kt/yr targeted by end-2027.' },
  { id: 'lovozero', name: 'Lovozero', stage: 'mining', country: 'Russia', bloc: 'nonaligned', capacityKt: 3.5, status: 'operating', heavy: false, note: 'Loparite — counted as a source but NOT an allied hedge. Russia produced 2.6 kt REO; processing limit 3.6 kt.' },
  { id: 'aclara_mine', name: 'Aclara — Carina/Penco', stage: 'mining', country: 'Brazil', bloc: 'allied', capacityKt: 5, status: 'planned', heavy: true, note: 'Aclara Resources — ion-adsorption-clay HREE (Carina, Brazil + Penco, Chile); semi-industrial pilot 2025; feeds planned US heavy separation.' },
  { id: 'torngat', name: 'Strange Lake (Torngat)', stage: 'mining', country: 'Canada', bloc: 'allied', capacityKt: 15, status: 'planned', heavy: true, note: 'Torngat Metals — HRE-rich; N. America’s largest potential heavy-REE source; ops ~2028 (C$2B).' },
  { id: 'hastings', name: 'Yangibana (Hastings)', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 4, status: 'construction', heavy: false, note: 'Hastings/Wyloo JV — NdPr-rich; first production ~2026; Neo offtake.' },
  { id: 'ef_donald', name: 'Donald (Energy Fuels)', stage: 'mining', country: 'Australia', bloc: 'allied', capacityKt: 7, status: 'planned', heavy: false, note: 'Energy Fuels JV — monazite feed for White Mesa; approved 2025.' },
  { id: 'vital_nechalacho', name: 'Nechalacho (Vital)', stage: 'mining', country: 'Canada', bloc: 'allied', capacityKt: 3, status: 'planned', heavy: false, note: 'Vital Metals — bastnäsite/monazite ore feeding SRC Saskatoon.' },
  { id: 'pensana', name: 'Longonjo (Pensana)', stage: 'mining', country: 'Angola', bloc: 'nonaligned', capacityKt: 20, status: 'construction', heavy: false, note: 'Pensana — MREC; deliveries ~2027; UK refinery scrapped, downstream relocating to US.' },
  { id: 'niocorp', name: 'Elk Creek (NioCorp)', stage: 'mining', country: 'United States', bloc: 'us', capacityKt: 2, status: 'planned', heavy: false, note: 'NioCorp — REE byproduct of Nb/Sc/Ti; 2nd-largest US REE resource; pre-FID.' },

  // SEPARATION (kt NdPr + Dy/Tb oxide / yr)
  { id: 'mp_sep', name: 'Mountain Pass separation', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 6.1, status: 'operating', heavy: false, note: 'MP Materials on-site SX: 6,075 t/yr NdPr oxide nameplate; 2,599 t produced in 2025, ramping. Heavy circuit (200 t/yr Dy+Tb) commissioning 2026.' },
  { id: 'energy_fuels', name: 'Energy Fuels (White Mesa)', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 1, status: 'operating', heavy: false, note: 'Monazite → NdPr oxide, Utah. Phase 1 (850–1,000 t/yr NdPr) is installed; Phase 2 (6,000 t/yr NdPr + Dy/Tb, 2029) has no investment decision.' },
  { id: 'lynas_seadrift', name: 'Lynas Seadrift', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 5, status: 'announced', heavy: true, note: 'Lynas US DoD-backed plant, TX — light + heavy SX. Not expected to proceed (Lynas, Nov 2025: wastewater permit).' },
  { id: 'lynas_malaysia', name: 'Lynas Malaysia', stage: 'separation', country: 'Malaysia', bloc: 'allied', capacityKt: 10.5, status: 'operating', heavy: false, note: 'The dominant ex-China separation capacity: ~10,500 t/yr NdPr since Dec 2023; 7,260 t produced in FY26.' },
  { id: 'solvay', name: 'Solvay La Rochelle', stage: 'separation', country: 'France', bloc: 'allied', capacityKt: 0.4, status: 'operating', heavy: false, note: 'Capacity not disclosed; magnet-REE line inaugurated Apr 2025, output of a few hundred tonnes NdPr. Dy/Tb separation only from 2026.' },
  { id: 'lynas_malaysia_heavy', name: 'Lynas Malaysia (Dy/Tb)', stage: 'separation', country: 'Malaysia', bloc: 'allied', capacityKt: 0.05, status: 'operating', heavy: true, note: 'First commercial Dy and Tb separation outside China (2025) — the pivotal ex-China heavy node. Output so far is tens of tonnes a year; a 5 kt/yr-feed heavy plant is planned.' },
  { id: 'iluka', name: 'Iluka Eneabba', stage: 'separation', country: 'Australia', bloc: 'allied', capacityKt: 6.25, status: 'construction', heavy: true, note: 'Australia’s first integrated NdPr + Dy/Tb refinery; A$1.65B govt-backed; ~2027.' },
  { id: 'caremag', name: 'Caremag (Lacq)', stage: 'separation', country: 'France', bloc: 'allied', capacityKt: 1.4, status: 'construction', heavy: true, note: 'Carester — ~600 t/yr Dy/Tb (~15% of global HRE) + magnet recycling; online late 2026; Stellantis offtake.' },
  { id: 'reetec', name: 'REEtec (Herøya)', stage: 'separation', country: 'Norway', bloc: 'allied', capacityKt: 0.72, status: 'construction', heavy: false, note: 'REEtec — ~720 t/yr NdPr (~5% of EU demand); LKAB-backed; ramping 2025–26.' },
  { id: 'mkango_pulawy', name: 'Mkango (Puławy)', stage: 'separation', country: 'Poland', bloc: 'allied', capacityKt: 2, status: 'planned', heavy: true, note: 'Mkango — ~2 kt NdPr + ~50 t/yr Dy/Tb; EU CRMA Strategic Project.' },
  { id: 'src_canada', name: 'SRC (Saskatoon)', stage: 'separation', country: 'Canada', bloc: 'allied', capacityKt: 0.4, status: 'construction', heavy: false, note: 'Saskatchewan Research Council — ~400 t/yr NdPr metal; commissioning Dec 2026, operating 2027.' },
  { id: 'ucore_la', name: 'Ucore Louisiana (SMC)', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 2, status: 'planned', heavy: true, note: 'Ucore RapidSX — NdPr + Dy/Tb; DoD-funded. Nothing installed: a 600 t/yr first machine in H1 2027, then three lines of ~3,000 t/yr TREO each.' },
  { id: 'aclara_la', name: 'Aclara Louisiana (HREE)', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 2, status: 'planned', heavy: true, note: 'Aclara — first US-dedicated heavy-REE (Dy/Tb) separation; $277M; ~2028.' },
  { id: 'reelement', name: 'ReElement (Indiana)', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 0.25, status: 'operating', heavy: true, note: 'ReElement Technologies — chromatographic refining (incl. heavies), Noblesville; ’scaling to 250+ t/yr’ (company claim). Marion IN is not operating.' },
  { id: 'neo_silmet', name: 'Neo Silmet (Sillamäe)', stage: 'separation', country: 'Estonia', bloc: 'allied', capacityKt: 0.4, status: 'operating', heavy: false, note: 'Neo Performance Materials — ~2,000 t/yr light-REE line (basis unclear); small heavy line commissioned Apr 2026.' },
  { id: 'rare_element', name: 'Rare Element (Upton WY)', stage: 'separation', country: 'United States', bloc: 'us', capacityKt: 2, status: 'construction', heavy: false, note: 'Rare Element Resources — DOE/General Atomics demo; Bear Lodge target ~2 kt by 2030.' },
  { id: 'maaden_mp', name: 'Maaden–MP (Saudi)', stage: 'separation', country: 'Saudi Arabia', bloc: 'nonaligned', capacityKt: 5, status: 'announced', heavy: false, note: 'Maaden–MP–US DoW JV refinery (Nov 2025); announced only, no engineering yet.' },

  // ALLOY / METAL (kt strip-cast alloy / yr)
  { id: 'mp_alloy', name: 'MP Fort Worth (metal/alloy)', stage: 'alloy', country: 'United States', bloc: 'us', capacityKt: 1.2, status: 'operating', note: 'MP Materials metal + strip-cast, TX, sized to its ~1 kt/yr magnet line. Alloy capacity is not disclosed; inferred.' },
  { id: 'japan_alloy', name: 'Japan alloy (Santoku/Shin-Etsu/Proterial)', stage: 'alloy', country: 'Japan', bloc: 'allied', capacityKt: 6.8, status: 'operating', note: 'No producer publishes capacity and Japan has no metal making, so this is the alloy its non-Chinese metal supports (imports from Vietnam and Thailand).' },
  { id: 'neo_estonia_alloy', name: 'Neo Narva (Estonia, alloy)', stage: 'alloy', country: 'Estonia', bloc: 'allied', capacityKt: 2, status: 'operating', note: 'Neo Performance Materials — integrated oxide→metal→alloy feeding its Narva magnet line (EU Just Transition Fund; opened 2025).' },
  { id: 'phoenix_tailings', name: 'Phoenix Tailings', stage: 'alloy', country: 'United States', bloc: 'us', capacityKt: 0.65, status: 'operating', note: 'China-free US metallization (NdPr + DyFe), NH; opened Oct 2025 at 200 t/yr of metal, scaling to 1,000+.' },
  { id: 'usare_alloy', name: 'USA Rare Earth (Blacksburg, alloy)', stage: 'alloy', country: 'United States', bloc: 'us', capacityKt: 5, status: 'announced', note: 'USA Rare Earth, SC — 5,000 t/yr strip-cast metal and alloy; commissioning targeted 2028.' },
  { id: 'less_common_metals', name: 'Less Common Metals (UK)', stage: 'alloy', country: 'United Kingdom', bloc: 'allied', capacityKt: 1.1, status: 'operating', note: 'Only UK alloy maker (light + heavy RE alloys); owned by USA Rare Earth. ~1,400 t/yr strip casting, limited by ~330 t/yr of NdPr metal.' },
  { id: 'asm_korea', name: 'Korean Metals Plant (Ochang)', stage: 'alloy', country: 'South Korea', bloc: 'allied', capacityKt: 1.3, status: 'operating', note: '1,300 t/yr NdFeB alloy installed, expanding to 3,600; acquired by Energy Fuels (2026).' },
  { id: 'eu_alloy', name: 'LCM Europe (Lacq)', stage: 'alloy', country: 'Germany', bloc: 'allied', capacityKt: 3.75, status: 'planned', note: 'Less Common Metals — 3,750 t/yr metal and alloy, announced Jan 2026.' },

  // MAGNET (kt sintered NdFeB / yr)
  { id: 'mp_mag', name: 'MP Fort Worth (magnets)', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 1, status: 'operating', note: 'MP Materials sintered magnets (GM offtake): ~1,000 t/yr, production began Dec 2025; expansion to 3,000 t/yr projected.' },
  { id: 'evac', name: 'e-VAC Magnetics', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 2, status: 'operating', note: 'VAC US plant, South Carolina (DoD/GM-backed) — first US commercial magnets Dec 2025; nameplate ~2,000 t/yr, 4,000 then 12,000 announced.' },
  { id: 'noveon', name: 'Noveon', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 2, status: 'operating', note: 'Noveon Magnetics, TX — 2,000 t/yr sintered NdFeB claimed, recycled or virgin feed.' },
  { id: 'japan_mag', name: 'Japan magnets (Shin-Etsu/Proterial/TDK)', stage: 'magnet', country: 'Japan', bloc: 'allied', capacityKt: 9, status: 'operating', note: 'The largest ex-China magnet capacity. No company or ministry figure; ~9 kt/yr inferred from Japan’s 7% share of world output in 2020.' },
  { id: 'vac_eu', name: 'VAC (Germany)', stage: 'magnet', country: 'Germany', bloc: 'allied', capacityKt: 1, status: 'operating', note: 'Vacuumschmelze with Neorem — Europe had 1,000 t/yr of sintered capacity in 2021 (ERMA).' },
  { id: 'neo_estonia', name: 'Neo Narva (Estonia)', stage: 'magnet', country: 'Estonia', bloc: 'allied', capacityKt: 2, status: 'operating', note: 'Neo Performance Materials — Europe’s first large-scale sintered NdFeB plant (Narva); 2 kt/yr, expandable to 5+ kt, ramping 2026. ~15% of EU magnet demand.' },
  { id: 'js_link_korea', name: 'JS Link (Yesan)', stage: 'magnet', country: 'South Korea', bloc: 'allied', capacityKt: 1, status: 'operating', note: 'JS Link — 1,000 t/yr sintered NdFeB; pilot run Sept 2025. A 3,000 t/yr plant in Georgia (US) is announced for late 2027.' },
  { id: 'usare_stillwater', name: 'USA Rare Earth (Stillwater)', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 1.2, status: 'construction', note: 'USA Rare Earth, OK — first line (~600 t/yr) commissioned Mar 2026; 1,200 t/yr in Q1 2027.' },
  { id: 'usare_blacksburg', name: 'USA Rare Earth (Blacksburg)', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 6.4, status: 'construction', note: 'USA Rare Earth, SC — 6,400 t/yr sintered NdFeB; ground broken Sept 2026, commissioning targeted 2028.' },
  { id: 'vulcan', name: 'Vulcan Elements', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 10, status: 'announced', note: 'Vulcan Elements, NC — $1.4B US-Gov partnership (2025); scaling to 10 kt; ReElement feedstock.' },
  { id: 'mp_10x', name: 'MP “10X” (Northlake)', stage: 'magnet', country: 'United States', bloc: 'us', capacityKt: 7, status: 'construction', note: 'MP Materials 2nd magnet campus, TX — ~7 kt; commissioning expected to begin 2028.' },
  { id: 'star_vietnam', name: 'Star Group (Vietnam)', stage: 'magnet', country: 'Vietnam', bloc: 'nonaligned', capacityKt: 4, status: 'operating', note: 'Korean-owned SGI Vina — 4 kt NdFeB (Feb 2025); POSCO-linked.' },
  { id: 'irel_india', name: 'IREL (Vizag)', stage: 'magnet', country: 'India', bloc: 'allied', capacityKt: 1, status: 'planned', note: 'India REPM — SmCo now; national scheme targets ~6 kt NdFeB.' },

  // RECYCLING (kt end-of-life scrap processed / yr)
  { id: 'noveon_rec', name: 'Noveon (recycling)', stage: 'recycling', country: 'United States', bloc: 'us', capacityKt: 2, status: 'operating', note: 'Closed-loop sintered-magnet recycling, TX: 2,000 t/yr nameplate, magnet to magnet.' },
  { id: 'cyclic', name: 'Cyclic Materials', stage: 'recycling', country: 'United States', bloc: 'us', capacityKt: 2, status: 'planned', note: 'EoL magnet recycling. The Mesa AZ plant makes a magnet concentrate, not oxide; the South Carolina campus (2,000 t/yr in, 600 t/yr mixed oxide out) is planned for 2028.' },
  { id: 'hypromag', name: 'HyProMag (UK)', stage: 'recycling', country: 'United Kingdom', bloc: 'allied', capacityKt: 0.3, status: 'operating', note: 'HPMS hydrogen recycling, Tyseley UK (Mkango/CoTec): 100 t/yr single shift, 300+ multi-shift; opened Jan 2026.' },
  { id: 'hypromag_us', name: 'HyProMag USA', stage: 'recycling', country: 'United States', bloc: 'us', capacityKt: 1.5, status: 'planned', note: 'Mkango/CoTec JV, Texas — ~1,550 t/yr recycled magnets by 2028; design phase.' },
  { id: 'magreesource', name: 'MagREEsource', stage: 'recycling', country: 'France', bloc: 'allied', capacityKt: 0.05, status: 'operating', note: 'H₂-based recycled sintered magnets, France; 50 t/yr pilot, 500 t/yr targeted for 2027.' },
  { id: 'remloy', name: 'Heraeus Remloy', stage: 'recycling', country: 'Germany', bloc: 'allied', capacityKt: 0.6, status: 'operating', note: 'Bitterfeld — 600 t/yr recycled NdFeB alloy powder since May 2024; being sold to Mkango.' },
  { id: 'ionic_belfast', name: 'Ionic Technologies', stage: 'recycling', country: 'United Kingdom', bloc: 'allied', capacityKt: 0.4, status: 'construction', note: 'Belfast — separates all four magnet REOs (incl. Dy/Tb) from recycled feed; ~400 t/yr.' },
  { id: 'reecycle', name: 'REEcycle', stage: 'recycling', country: 'United States', bloc: 'us', capacityKt: 0.05, status: 'planned', note: 'Houston — Nd/Pr/Dy/Tb from e-waste; $5.1M DPA Title III.' },
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
// A heavy-flagged deposit/plant is heavy-ENRICHED but still mostly light REO: dysprosium +
// terbium are only ~6% of its output by mass (the model's deposit rho_DyTb runs 0.04–0.065).
// Crediting a project's FULL nameplate as heavy-REE capacity overstated ex-China heavy supply
// ~15x and made China's heavy share collapse to 0 when projects were toggled on, contradicting
// the faithful flow-traced model (heavy ore stays ~95%+ China — the chokepoint is heavy MINING,
// not separation). Scale heavy-class capacity by this yield.
export const HEAVY_YIELD = 0.06;
// The same correction for LIGHT mines, which was missing. A mine's capacity is
// stated in total rare-earth oxide, most of it lanthanum and cerium; the model's
// flows carry only the magnet elements. Nd/Pr is 16-22% of the oxide in a light
// deposit (the model's rho_NdPr: Mountain Pass 0.165, Mt Weld 0.22), so counting
// the whole nameplate credited ex-China mines with about five times the Nd/Pr
// they produce: the Sankey showed the US mining half the world's magnet rare
// earths. Separation plants are listed in the Nd/Pr and Dy/Tb oxide they make,
// so they take no such factor.
export const LIGHT_MINE_YIELD = 0.19;
/** Dy/Tb in the oxide of a LIGHT deposit: Mountain Pass 0.05%, Mt Weld 0.2%. */
export const LIGHT_MINE_HEAVY_TRACE = 0.001;

export function regionalCapacityRe(stage: Stage, active: Set<string>, cls: 'light' | 'heavy', scale: Record<string, number> = {}): Record<'USA' | 'China' | 'RoW', number> {
  const out: Record<'USA' | 'China' | 'RoW', number> = { USA: 0, China: 0, RoW: 0 };
  const yld = cls === 'heavy' ? HEAVY_YIELD : stage === 'mining' ? LIGHT_MINE_YIELD : 1;
  for (const p of PROJECTS) {
    if (p.stage !== stage || !active.has(p.id)) continue;
    if ((cls === 'heavy') !== !!p.heavy) continue;   // heavy class ⟷ heavy-flagged projects
    out[REGION_OF_BLOC[p.bloc]] += p.capacityKt * (scale[p.id] ?? 1) * yld;
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
// Baseline default = operating only (mature always-on + ramping new-operating plants).
// Construction and planned are OFF by default, so the baseline reflects capacity that
// is actually producing today; toggle them on to see the effect of those investments.
export const DEFAULT_FUTURE = new Set(
  PROJECTS.filter((p) => tier(p) === 'ramping').map((p) => p.id));
/** The full active set the model overlay sees: operating (always) + chosen future. */
export const activeSet = (future: Set<string>): Set<string> => new Set([...OPERATING_IDS, ...future]);
