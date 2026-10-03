/**
 * The project screen, client-side. Would a FIRM build what the planner chose?
 *
 * A faithful TS port of `core/project_investment.evaluate` and
 * `project_from_row`, the same way `demand.ts` ports `magnet_bom`. It can live in the browser because the screen
 * is closed-form arithmetic — revenue, purchased input, opex, a capital charge
 * at the firm's rate, an NPV over a build schedule. No solver. Only the
 * EQUILIBRIUM (iterating planner and screen to a fixed point) needs one, and
 * that stays server-side.
 *
 * PRICES ARE FIXED AND THERE IS ONE PRICE LEVER. The market the screen prices
 * against is China's: oxide at China's benchmark, and conversion paid what the
 * marginal Chinese producer needs. The one thing a reader sets is the PREMIUM:
 * what a buyer pays extra per kilogram of a plant's product because it never
 * touched China, net of any premium the plant itself pays for its inputs, that
 * is, the premium the plant KEEPS. See `screen` and `pricesForPremium`.
 *
 * Constants come from grid meta (`meta.project_finance`) so they cannot drift
 * from the model. The inline fallback covers grids written before that block was
 * emitted and should be deleted once one is deployed.
 */
import data from './scenarios.json';

const META = (data as any).meta?.project_finance;

// TEMPORARY fallback — delete once a grid carrying meta.project_finance ships.
const FB = {
  prices: { concentrate: 6, oxide_NdPr: 80, oxide_DyTb: 350, oxide_other: 3, alloy: 50, magnet: 75 },
  basket: { NdPr: 0.22, DyTb: 0.01, other: 0.77 },
  grade: 'H',
  grade_ladder: { N: [0.31, 0], M: [0.30, 0.01], H: [0.29, 0.02], SH: [0.275, 0.035], UH: [0.255, 0.055], EH: [0.225, 0.085] },
  oxide_factor: 1.16,
  scrap_value_share: 0.25,
  alloy_per_magnet: 1,
  discount_rate: 0.07,
  asset_life_years: 20,
  hurdle_rate: { USA: 0.12, China: 0.07, RoW: 0.10 },
  hurdle_relief: { offtake: 0.70, price_floor: 0.50, loan_guarantee: 1.0, subsidy: 0 },
  floor_covers: { oxide: ['mining', 'separation'], alloy: ['alloy'], magnet: ['magnet'], concentrate: ['mining'] },
  separation_recovery: { NdPr: 0.90, DyTb: 0.82 },
  recycle_recovery: 0.90,
  regional_cost_factor: {} as any,   // operating
  regional_capex_factor: {} as any,  // capital (model since 2026-09-30); falls back to the operating factor
  foak_premium: {} as any,
  lead_years: { USA: { mining: 8, separation: 6, alloy: 4, magnet: 4, recycling: 3 },
                China: { mining: 4, separation: 3, alloy: 2, magnet: 2, recycling: 2 },
                RoW: { mining: 6, separation: 4, alloy: 3, magnet: 3, recycling: 2 } } as any,
};
const C = { ...FB, ...(META ?? {}) };
export const HAS_META = !!META;

export type Prices = Record<string, number>;
/**
 * One expansion COHORT the planner chose: the modules a facility adds in one
 * year. Mirrors `project_investment.build_row`.
 *
 * SCHEMA 2 rows (`lead` and `up` present) carry the planner's own EFFECTIVE
 * costs — regional factor, FOAK, subsidy, learning, build speed and scale
 * economies already applied — its lead time, and the facility's utilisation in
 * each year the cohort operates. `kt` and `v` are in the product unit of the
 * stage (tonnes of alloy, of finished magnet, of TREO fed, of scrap processed),
 * not the contained oxide the planner counts. Schema 1 rows carried CSV-basis
 * costs and one average utilisation; `evaluate` still reads them, so a grid and
 * a build of the site can never be out of step in a way that breaks the page.
 */
export type Buildout = {
  f: string; s: string; r: string; kt: number; u: number; v: number; fx: number; n: number;
  basket?: Record<string, number>;
  /** utilisation in each operating year, first first; the last is held. */
  up?: number[];
  /** the planner's lead time, years. */
  lead?: number;
  /** calendar year the cohort first produces. */
  y0?: number;
  /** modules the facility had online before this cohort. */
  nb?: number;
  /** 1 = committed construction: built whatever the screen says. */
  c?: number;
  /** stages owned, in chain order, and [stage, $/kg, $M/yr] for each. */
  own?: string[];
  cc?: [string, number, number][];
};

/** True when the row carries the planner's effective costs and cohort timing. */
export const isResolved = (b: Buildout): boolean =>
  b.lead !== undefined && Array.isArray(b.up) && b.up.length > 0;

/** Price ladder DERIVED from oxide, so each stage's output is worth more than
 *  the basket it consumes. Asserting them independently is how the WP3 figures
 *  ended up with a magnet cheaper than the oxide inside it. */
export function pricesFromOxide(ndpr: number, dytb: number,
                                alloyConv = ALLOY_CONVERSION_DEFAULT,
                                magnetConv = MAGNET_CONVERSION_DEFAULT): Prices {
  const [nm, dm] = C.grade_ladder[C.grade];
  const oxideInMagnet = C.oxide_factor * (nm * ndpr + dm * dytb);
  const alloy = oxideInMagnet + alloyConv;
  return { ...C.prices, oxide_NdPr: ndpr, oxide_DyTb: dytb, alloy, magnet: alloy + magnetConv };
}

/**
 * COMPETITIVE conversion spreads, anchored on the marginal producer.
 *
 * The spread was an asserted $25/kg for magnets and $15 for alloy, given to
 * every region alike. That tests ABSOLUTE viability: a US plant sells at the
 * same world price as a Chinese one, so China's lower cost makes it more
 * profitable without making the US plant unprofitable, and the plan looked
 * bankable almost everywhere. But in a market where China makes ~90% of the
 * product, the price of conversion settles near what the marginal CHINESE
 * producer needs — its cost plus a normal return on capital. That is what a
 * US plant competes against, and at that spread no US plant clears unaided.
 *
 * So the default is China's all-in conversion cost from the model's own
 * facility data (steer_magnet_cem/data/raw/{magnet,alloy}_plants.csv:
 * variable $/kg plus the annualised fixed charge of one module at full output,
 * which already embeds the return on capital at the planner's rate). It is a
 * constant, not a control: every stage of the chain has such a margin, and the
 * reader is not asked to set any of them. The only route to a HIGHER realised
 * price for a US plant is the premium, which is the argument of the whole tool.
 */
const CHINA_PLANT = {                 // var $/kg, fixed $M/yr per module, module kt
  magnet: { v: 4.0, fx: 41.53, kt: 40 },   // capital from Chinese filings (model, 2026-09-30)
  alloy:  { v: 2.0, fx: 10.0, kt: 40 },
};
// The model's own figures when the grid carries them (meta.project_finance),
// so the spread cannot drift from the facility tables it is read from.
export const CHINA_CONVERSION: { magnet: number; alloy: number } = META?.competitive_conversion ?? {
  magnet: CHINA_PLANT.magnet.v + CHINA_PLANT.magnet.fx / CHINA_PLANT.magnet.kt,   // $5.04/kg
  alloy:  CHINA_PLANT.alloy.v + CHINA_PLANT.alloy.fx / CHINA_PLANT.alloy.kt,      // $2.25/kg
};
export const MAGNET_CONVERSION_DEFAULT = CHINA_CONVERSION.magnet;
export const ALLOY_CONVERSION_DEFAULT = CHINA_CONVERSION.alloy;
const OXIDE_CHINA = { ndpr: 113, dytb: 285 };      // Chinese domestic benchmark
const OXIDE_EXCHINA = { ndpr: 184, dytb: 1625 };   // ex-China, post-2025 bifurcation

/**
 * Prices with oxide at a multiple of TODAY'S ex-China premium over China's
 * benchmark: 0 is China's price, 1 today's price outside China. Alloy and magnet
 * prices are built up from the oxide price, so a converter pays the premium in
 * what it buys and gets it back in what it sells.
 */
export const priceAtSpread = (spread: number): Prices =>
  pricesFromOxide(
    OXIDE_CHINA.ndpr + spread * (OXIDE_EXCHINA.ndpr - OXIDE_CHINA.ndpr),
    OXIDE_CHINA.dytb + spread * (OXIDE_EXCHINA.dytb - OXIDE_CHINA.dytb),
  );
/** The market every plant is screened against: China's. */
export const BASE_PRICES: Prices = priceAtSpread(0);

/**
 * THE PREMIUM, per stage.
 *
 * For a plant that sells OXIDE (separation, recycling) the premium is quoted per
 * kilogram of Nd/Pr oxide, and Dy/Tb oxide moves with it in today's observed
 * proportion, because that is how the premium is observed: outside China both
 * oxides cost more, heavy by far the more. Today it is
 * $71/kg of Nd/Pr oxide. Ore carries no premium in the screen, so an
 * oxide maker keeps all of it.
 *
 * For every other plant it is dollars per kilogram of its own product, added to
 * what it is paid and to nothing it buys. No such premium is OBSERVED for alloy
 * or magnets net of their inputs: what buyers pay extra for a non-Chinese magnet
 * today is, as far as the prices show, the oxide premium inside it, which its
 * maker pays away upstream. So those stages open at zero.
 */
export const TODAY_OXIDE_PREMIUM: number = OXIDE_EXCHINA.ndpr - OXIDE_CHINA.ndpr;
/** Dy/Tb oxide's observed premium per dollar of Nd/Pr oxide's. */
export const HEAVY_PER_LIGHT_PREMIUM: number =
  (OXIDE_EXCHINA.dytb - OXIDE_CHINA.dytb) / (OXIDE_EXCHINA.ndpr - OXIDE_CHINA.ndpr);
/** The stage whose product a row sells: the last of an owned chain. */
const sells = (b: Buildout): string => (b.own?.length ? b.own[b.own.length - 1] : b.s);
/** Does a plant at this stage sell oxide, so that its premium is an oxide price? */
export const sellsOxide = (stage: string): boolean =>
  stage === 'separation' || stage === 'recycling';
/** Where a stage's premium opens: today's observed level where one is observed. */
export const defaultPremium = (stage: string): number =>
  (sellsOxide(stage) ? TODAY_OXIDE_PREMIUM : 0);

const crf = (r: number, n: number) => (r <= 0 ? 1 / n : (r * (1 + r) ** n) / ((1 + r) ** n - 1));

/** (revenue, purchased input) per kg of throughput. Both sides of the balance —
 *  the omission that made the old tolling breakevens understate by a feedstock bill. */
function stageFlows(stage: string, p: Prices, basket: Record<string, number>): [number, number] {
  const [nm, dm] = C.grade_ladder[C.grade];
  if (stage === 'mining') return [p.concentrate, 0];
  if (stage === 'separation') {
    const rev = basket.NdPr * C.separation_recovery.NdPr * p.oxide_NdPr
      + basket.DyTb * C.separation_recovery.DyTb * p.oxide_DyTb
      + (basket.other ?? 0) * 0.9 * p.oxide_other;
    return [rev, p.concentrate];
  }
  if (stage === 'alloy') return [p.alloy, C.oxide_factor * (nm * p.oxide_NdPr + dm * p.oxide_DyTb)];
  if (stage === 'magnet') return [p.magnet, C.alloy_per_magnet * p.alloy];
  if (stage === 'recycling') {
    const contained = C.oxide_factor * (nm * p.oxide_NdPr + dm * p.oxide_DyTb);
    return [contained * C.recycle_recovery, contained * C.scrap_value_share];
  }
  throw new Error(`unknown stage ${stage}`);
}

/** Risk-premium relief from the instruments covering a project. Mirrors
 *  RC.instrument_relief: reliefs do NOT stack — the largest single one wins —
 *  and a subsidy earns none, which is the asymmetry the whole exercise shows. */
export function instrumentRelief(stage: string, opts: {
  /** 0-1: how much of the risk premium an offtake removes. 0 = no offtake. */
  offtake?: number;
  floorInterface?: string | null;
  /** 0-1: relief a FULL price floor buys, before scaling by how far the floor is on. */
  floorRelief?: number;
  /** 0-1: how far the floor is actually set, from the planner-side tariff slider. */
  floorLevel?: number;
  /** 0-1: relief from credit support. */
  creditSupport?: number;
} = {}): number {
  let relief = Math.max(0, opts.offtake ?? 0);
  const covers = opts.floorInterface ? (C.floor_covers[opts.floorInterface] ?? []) : [];
  if (covers.includes(stage)) {
    // The floor is ONE instrument with two effects: it re-prices imports for the
    // planner (a grid axis) and de-risks covered projects for the actor. Its relief
    // therefore scales with how far the planner-side floor is actually set — a
    // floor that is off cannot be de-risking anything.
    relief = Math.max(relief, (opts.floorRelief ?? 0) * (opts.floorLevel ?? 0));
  }
  if (opts.creditSupport) relief = Math.max(relief, opts.creditSupport);
  return Math.min(1, relief);
}

/** The stages a price floor on one interface de-risks. A floor on magnets does
 *  nothing for a separation plant. */
export const floorCovers = (iface: string): string[] => C.floor_covers[iface] ?? [];

/** The asserted defaults. NOT empirical: the ORDERING is defensible (an offtake
 *  removes more risk than a floor; a guarantee removes all of it; a cost subsidy
 *  removes none, which is why it is absent), the magnitudes are judgement. They
 *  are defaults for a slider precisely so a reader can disagree with them. */
export const RELIEF_DEFAULTS = {
  offtake: C.hurdle_relief?.offtake ?? 0.70,
  floor: C.hurdle_relief?.price_floor ?? 0.50,
  guarantee: C.hurdle_relief?.loan_guarantee ?? 1.00,
};

export type Verdict = {
  facility: string; stage: string; region: string; newKt: number; utilization: number;
  revenue: number; inputCost: number; opex: number; capitalCharge: number;
  margin: number; plannerMargin: number; breakeven: number;
  npv: number; overnightCapital: number; leadYears: number;
  funded: boolean; supportNeeded: number;
  /** Rate the capital was actually charged at, after instrument relief. Equals
   *  the planner's rate when relief is total, the raw hurdle when there is none. */
  effRate: number;
  /** NPV the same project would show at the planner's rate. The difference
   *  between this and `npv` is the financing wedge, in dollars. */
  plannerNpv: number;
};

/** The IRR a firm in this region demands before it will build. This IS the
 *  discrete parameter behind "actor mode" — there is no separate switch. The
 *  planner charges C.discount_rate; the spread between the two is the entire
 *  planner/actor wedge, and `relief` is how far an instrument closes it. */
export const hurdleRate = (region: string): number =>
  C.hurdle_rate[region] ?? C.discount_rate;
export const PLANNER_RATE: number = C.discount_rate;

/** Screen one planner-chosen expansion at a firm's hurdle.
 *  `rate` overrides the regional default, so the UI can sweep the IRR threshold. */
export function evaluate(b: Buildout, prices: Prices, opts: {
  relief?: number; support?: number; basket?: Record<string, number>; rate?: number;
  /** Scales the regional cost disadvantage (opex AND fixed). 1 = as calibrated.
   *  Swept because it is a judgement call that the US conclusion turns on. */
  costMult?: number;
  /** Scales the FOAK PREMIUM ABOVE ONE, not the multiplier itself: at 0 a
   *  first-of-a-kind plant costs the same as an nth-of-a-kind, at 2 it is twice
   *  as penalised. Scaling the multiplier directly would make 0 mean "free". */
  foakMult?: number;
  /** $/kg added to what the plant is paid for its product, and to nothing it
   *  buys: the premium as it applies to a plant that does not sell oxide. A
   *  plant that does is given its premium through `prices` instead (`screen`). */
  provenancePremium?: number;
} = {}): Verdict {
  const rate = opts.rate ?? hurdleRate(b.r);
  const relief = opts.relief ?? 0;
  const eff = C.discount_rate + (1 - relief) * (rate - C.discount_rate);

  const basket = opts.basket ?? b.basket ?? C.basket;
  // An owned chain buys its first stage's input and sells its last stage's
  // output; the intermediates are internal transfers.
  const chain = b.own?.length ? b.own : [b.s];
  const [revMarket] = stageFlows(chain[chain.length - 1], prices, basket);
  const [, inPerKg] = stageFlows(chain[0], prices, basket);
  const provenance = b.r === 'China' ? 0 : (opts.provenancePremium ?? 0);
  const revPerKg = revMarket + provenance;

  // Costs. A resolved row already holds what the planner charged, so the cost
  // and FOAK sliders scale it RELATIVE to the calibrated values; a schema-1 row
  // holds CSV-basis costs and takes the regional layer here.
  const costMult = opts.costMult ?? 1;
  const foakBase = C.foak_premium?.[b.r]?.[b.s] ?? 1;
  const foak = 1 + (foakBase - 1) * (opts.foakMult ?? 1);
  const stages: [string, number, number][] = b.cc?.length ? b.cc : [[b.s, b.v, b.fx]];
  let varPerKg = 0;
  let baseFixed = 0;
  for (const [stg, v, fx] of stages) {
    if (isResolved(b)) {
      const base = C.foak_premium?.[b.r]?.[stg] ?? 1;
      const scaled = 1 + (base - 1) * (opts.foakMult ?? 1);
      varPerKg += v * costMult;
      baseFixed += fx * costMult * (scaled / base);
    } else {
      const cf = (C.regional_cost_factor?.[b.r]?.[stg] ?? 1) * costMult;
      const cfCap = (C.regional_capex_factor?.[b.r]?.[stg] ?? C.regional_cost_factor?.[b.r]?.[stg] ?? 1) * costMult;
      varPerKg += v * cf;
      baseFixed += fx * cfCap * (stg === b.s ? foak : 1 + ((C.foak_premium?.[b.r]?.[stg] ?? 1) - 1) * (opts.foakMult ?? 1));
    }
  }

  const outKt = b.kt * b.u;
  const revenue = outKt * revPerKg;
  const inputCost = outKt * inPerKg;
  const opex = outKt * varPerKg;
  const ratio = crf(eff, C.asset_life_years) / crf(C.discount_rate, C.asset_life_years);
  const capitalCharge = baseFixed * ratio;
  const support = opts.support ?? 0;

  // LEVELIZED: a diagnostic of the operating year. It ignores the construction
  // years, so it is not the test and nothing below is derived from it.
  const margin = revenue - inputCost - opex - capitalCharge + support;
  const plannerMargin = revenue - inputCost - opex - baseFixed + support;

  // Capital at the START of each construction year, operating margin at the END
  // of each operating year. That convention is what makes npv reconcile with the
  // levelized margin at zero lead; getting it wrong inflates every NPV by (1+r).
  const lead = b.lead ?? C.lead_years?.[b.r]?.[b.s] ?? 0;
  const life = C.asset_life_years;
  const overnight = baseFixed / crf(C.discount_rate, life);
  const profile = isResolved(b) ? b.up! : [b.u];
  const tonnage = (k: number) => b.kt * profile[Math.min(k, profile.length) - 1];
  const unitMargin = revPerKg - inPerKg - varPerKg;
  const discounted = (r: number) => {
    let capex = lead === 0 ? overnight : 0;
    for (let k = 0; k < lead; k++) capex += (overnight / lead) / (1 + r) ** k;
    let value = 0, annuity = 0, pvTonnage = 0;
    for (let k = 1; k <= life; k++) {
      const d = (1 + r) ** -(lead + k);
      value += d * (tonnage(k) * unitMargin + support);
      annuity += d;
      pvTonnage += d * tonnage(k);
    }
    return { npv: value - capex, annuity, pvTonnage };
  };
  const at = discounted(eff);
  const funded = at.npv >= -1e-6;

  return {
    facility: b.f, stage: b.s, region: b.r, newKt: b.kt, utilization: b.u,
    revenue, inputCost, opex, capitalCharge, margin, plannerMargin,
    // ONE CRITERION. The verdict, the support and the breakeven are all read
    // from the same NPV, so a project paid its `supportNeeded` is exactly
    // funded. Support used to come from the levelized margin, which understated
    // it whenever there was a construction period.
    breakeven: at.pvTonnage > 0 ? revPerKg - at.npv / at.pvTonnage - provenance : Infinity,
    npv: at.npv, overnightCapital: overnight, leadYears: lead,
    funded, supportNeeded: funded || at.annuity <= 0 ? 0 : -at.npv / at.annuity,
    effRate: eff, plannerNpv: discounted(C.discount_rate).npv,
  };
}

/** A quantity that is one number for every stage, or one per stage. A provenance
 *  premium and a cost disadvantage are per-stage things: $10 a kilogram is a
 *  different claim about alloy than about finished magnets, and the US pays a
 *  different penalty to separate than to sinter. */
export type ByStage = number | Record<string, number>;
const forStage = (v: ByStage | undefined, stage: string, fallback: number): number =>
  v === undefined ? fallback : typeof v === 'number' ? v : (v[stage] ?? fallback);

/** The magnet oxide in a kilogram of what a separation plant is fed. The screen
 *  works per kg of TREO fed; the plants a reader knows are rated in the Nd/Pr and
 *  Dy/Tb oxide they make. 1 for every other stage. */
export const oxideShare = (b: Buildout): number =>
  b.s === 'separation' && b.basket
    ? (b.basket.NdPr ?? 0) + (b.basket.DyTb ?? 0) : 1;

export type ScreenOpts = {
  offtake?: number; floorInterface?: string | null; floorRelief?: number;
  floorLevel?: number; creditSupport?: number;
  support?: number; rate?: number; costMult?: ByStage; foakMult?: number;
  /** The premium the plant keeps, one number for every stage or one per stage.
   *  A stage with no entry takes `defaultPremium`. */
  premium?: ByStage;
};

/** Screen a whole build-out against China's prices plus the premium. Relief is
 *  resolved PER STAGE, because a price floor on magnets does nothing for a
 *  separation plant (see instrumentRelief). So are the premium and the cost
 *  disadvantage, when given per stage. */
export const screen = (rows: Buildout[], opts: ScreenOpts = {}): Verdict[] =>
  rows.map((b) => {
    const premium = forStage(opts.premium, b.s, defaultPremium(b.s));
    const oxide = sellsOxide(sells(b));
    return evaluate(b, oxide ? priceAtSpread(premium / TODAY_OXIDE_PREMIUM) : BASE_PRICES, {
      support: opts.support, rate: opts.rate, foakMult: opts.foakMult,
      costMult: forStage(opts.costMult, b.s, 1),
      provenancePremium: oxide ? 0 : premium,
      relief: instrumentRelief(b.s, opts),
    });
  });

/** Tonnage to DRAW and to count for a build-out row. The model states separation
 *  in TREO fed; the plants a reader knows are rated in the Nd/Pr and Dy/Tb oxide
 *  they make, so a separation row is counted as the magnet oxide in its feed.
 *  Every other stage is already in the unit its plants are rated in. */
export const drawnKt = (b: Buildout): number => b.kt * oxideShare(b);

/** The US rows a firm is asked to decide on. Committed construction is built
 *  whatever the screen says, so it is not judged. */
export const judgedRows = (rows: Buildout[] | undefined): Buildout[] =>
  (rows ?? []).filter((b) => b.r === 'USA' && !b.c);

/**
 * The planner's build-out arrives as COHORTS, one per facility per year it
 * expands, because each is its own investment decision. A reader thinks in
 * projects, so the cohorts of one facility are counted, drawn and named
 * together; the tonnage that clears is still decided cohort by cohort.
 *
 * Every count of "projects" on the page comes from here. The capacity columns
 * and the actor ledger used to count separately, one in plants and one in
 * cohorts, and so disagreed about the same plan (4 against 18).
 */
export type Project = Verdict & {
  fundedKt: number;
  cohorts: (Verdict & { year?: number })[];
};
export function groupProjects(rows: Buildout[], verdicts: Verdict[]): Project[] {
  const out = new Map<string, Project>();
  verdicts.forEach((v, i) => {
    const kt = drawnKt(rows[i]);
    const c = { ...v, newKt: kt, year: rows[i].y0 };
    const key = `${v.stage}|${v.facility}`;
    const p = out.get(key);
    if (!p) {
      out.set(key, { ...c, fundedKt: v.funded ? kt : 0, cohorts: [c] });
    } else {
      p.newKt += kt; p.fundedKt += v.funded ? kt : 0;
      p.npv += v.npv; p.plannerNpv += v.plannerNpv;
      p.supportNeeded += v.supportNeeded;
      p.funded = p.funded && v.funded;
      p.leadYears = Math.max(p.leadYears, v.leadYears);
      p.cohorts.push(c);
    }
  });
  return [...out.values()];
}
