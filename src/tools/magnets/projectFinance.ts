/**
 * The project screen, client-side. Would a FIRM build what the planner chose?
 *
 * A faithful TS port of `core/project_investment.evaluate`, the same way
 * `demand.ts` ports `magnet_bom`. It can live in the browser because the screen
 * is closed-form arithmetic — revenue, purchased input, opex, a capital charge
 * at the firm's rate, an NPV over a build schedule. No solver. Only the
 * EQUILIBRIUM (iterating planner and screen to a fixed point) needs one, and
 * that stays server-side.
 *
 * The consequence worth knowing: because this runs here, the PRICE WORLD is a
 * free control rather than a grid axis. That matters — US separation's viability
 * flips on it, and precomputing it would have multiplied the grid.
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
  regional_cost_factor: {} as any,
  foak_premium: {} as any,
  lead_years: { USA: { mining: 8, separation: 6, alloy: 4, magnet: 4, recycling: 3 },
                China: { mining: 4, separation: 3, alloy: 2, magnet: 2, recycling: 2 },
                RoW: { mining: 6, separation: 4, alloy: 3, magnet: 3, recycling: 2 } } as any,
};
const C = { ...FB, ...(META ?? {}) };
export const HAS_META = !!META;

export type Prices = Record<string, number>;
export type Buildout = {
  f: string; s: string; r: string; kt: number; u: number; v: number; fx: number; n: number;
  basket?: Record<string, number>;
};

/** Price ladder DERIVED from oxide, so each stage's output is worth more than
 *  the basket it consumes. Asserting them independently is how the WP3 figures
 *  ended up with a magnet cheaper than the oxide inside it. */
export function pricesFromOxide(ndpr: number, dytb: number,
                                alloyConv = 15, magnetConv = 25): Prices {
  const [nm, dm] = C.grade_ladder[C.grade];
  const oxideInMagnet = C.oxide_factor * (nm * ndpr + dm * dytb);
  const alloy = oxideInMagnet + alloyConv;
  return { ...C.prices, oxide_NdPr: ndpr, oxide_DyTb: dytb, alloy, magnet: alloy + magnetConv };
}

const OXIDE_CHINA = { ndpr: 113, dytb: 285 };      // Chinese domestic benchmark
const OXIDE_EXCHINA = { ndpr: 184, dytb: 1625 };   // ex-China, post-2025 bifurcation

export const PRICE_WORLDS: Record<string, Prices> = {
  ex_china: pricesFromOxide(OXIDE_EXCHINA.ndpr, OXIDE_EXCHINA.dytb),
  china_benchmark: pricesFromOxide(OXIDE_CHINA.ndpr, OXIDE_CHINA.dytb),
  neutral: { ...C.prices },
};

/**
 * Oxide prices at an arbitrary multiple of TODAY'S ex-China spread.
 *
 * Three named regimes were a worse control than one continuous axis: the real
 * question is not "China or ex-China" but "how far does the bifurcation go", and
 * a reader needs to be able to push it past what we observe as well as back to
 * parity. `spread` = 0 is the Chinese benchmark, 1 is today's ex-China level,
 * 2 is twice today's gap.
 */
export const priceAtSpread = (spread: number): Prices => pricesFromOxide(
  OXIDE_CHINA.ndpr + spread * (OXIDE_EXCHINA.ndpr - OXIDE_CHINA.ndpr),
  OXIDE_CHINA.dytb + spread * (OXIDE_EXCHINA.dytb - OXIDE_CHINA.dytb),
);

/** What today's ex-China spread is worth per kg of FINISHED MAGNET — the oxide
 *  price gap carried through the bill of materials. This is the concrete number
 *  the provenance-premium slider is anchored to, so a reader setting that slider
 *  knows what one observed spread actually looks like. */
export const EXCHINA_SPREAD_PER_MAGNET_KG: number = (() => {
  const [nm, dm] = C.grade_ladder[C.grade];
  const at = (o: { ndpr: number; dytb: number }) =>
    C.oxide_factor * (nm * o.ndpr + dm * o.dytb);
  return at(OXIDE_EXCHINA) - at(OXIDE_CHINA);
})();

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
  /** $/kg a non-China producer can charge for provenance. The model charges the
   *  ex-China premium as a COST on imported Dy/Tb but never credits it as
   *  REVENUE to an ex-China producer, so a US plant carries the premium's
   *  burden and none of its benefit — which is precisely backwards for the
   *  hedging demand that motivates the program. Defaults to 0, because we
   *  have no defensible number for it; it is here to be swept. */
  provenancePremium?: number;
} = {}): Verdict {
  const rate = opts.rate ?? hurdleRate(b.r);
  const relief = opts.relief ?? 0;
  const eff = C.discount_rate + (1 - relief) * (rate - C.discount_rate);

  const outKt = b.kt * b.u;
  const basket = opts.basket ?? b.basket ?? C.basket;
  const [revPerKg, inPerKg] = stageFlows(b.s, prices, basket);
  const cf = (C.regional_cost_factor?.[b.r]?.[b.s] ?? 1) * (opts.costMult ?? 1);
  const foakBase = C.foak_premium?.[b.r]?.[b.s] ?? 1;
  const foak = 1 + (foakBase - 1) * (opts.foakMult ?? 1);
  const provenance = b.r === 'China' ? 0 : (opts.provenancePremium ?? 0);

  const revenue = outKt * (revPerKg + provenance);
  const inputCost = outKt * inPerKg;
  const opex = outKt * b.v * cf;
  const baseFixed = b.fx * cf * foak;
  const ratio = crf(eff, C.asset_life_years) / crf(C.discount_rate, C.asset_life_years);
  const capitalCharge = baseFixed * ratio;
  const support = opts.support ?? 0;

  const margin = revenue - inputCost - opex - capitalCharge + support;
  const plannerMargin = revenue - inputCost - opex - baseFixed + support;
  const breakeven = outKt ? (inputCost + opex + capitalCharge - support) / outKt - provenance : Infinity;

  // Capital at the START of each construction year, operating margin at the END
  // of each operating year. That convention is what makes npv reconcile with the
  // levelized margin at zero lead; getting it wrong inflates every NPV by (1+r).
  const lead = C.lead_years?.[b.r]?.[b.s] ?? 0;
  const overnight = baseFixed / crf(C.discount_rate, C.asset_life_years);
  const opMargin = revenue - inputCost - opex + support;
  const npvAt = (r: number) => {
    let v = lead === 0 ? -overnight : 0;
    for (let k = 0; k < lead; k++) v -= (overnight / lead) / (1 + r) ** k;
    for (let k = 1; k <= C.asset_life_years; k++) v += opMargin / (1 + r) ** (lead + k);
    return v;
  };
  const npv = npvAt(eff);

  return {
    facility: b.f, stage: b.s, region: b.r, newKt: b.kt, utilization: b.u,
    revenue, inputCost, opex, capitalCharge, margin, plannerMargin, breakeven,
    npv, overnightCapital: overnight, leadYears: lead,
    funded: npv > 0, supportNeeded: Math.max(0, -margin),
    effRate: eff, plannerNpv: npvAt(C.discount_rate),
  };
}

/** Screen a whole build-out. Relief is resolved PER STAGE, because a price floor
 *  on magnets does nothing for a separation plant — see instrumentRelief. */
export const screen = (rows: Buildout[], prices: Prices, opts: {
  offtake?: number; floorInterface?: string | null; floorRelief?: number;
  floorLevel?: number; creditSupport?: number;
  support?: number; rate?: number; costMult?: number; foakMult?: number;
  provenancePremium?: number;
} = {}): Verdict[] =>
  rows.map((b) => evaluate(b, prices, { ...opts, relief: instrumentRelief(b.s, opts) }));

/** Does this stage's margin depend on the price world at all? Conversion stages
 *  earn an asserted spread (magnet = alloy + 25), so their revenue and their
 *  purchased input move together and the oxide price cancels exactly. Saying so
 *  is better than shipping a price-world control that silently does nothing. */
export const priceSensitive = (stage: string): boolean =>
  stage === 'mining' || stage === 'separation' || stage === 'recycling';
