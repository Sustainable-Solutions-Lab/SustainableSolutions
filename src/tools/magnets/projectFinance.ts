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

export const PRICE_WORLDS: Record<string, Prices> = {
  ex_china: pricesFromOxide(184, 1625),
  china_benchmark: pricesFromOxide(113, 285),
  neutral: { ...C.prices },
};

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
  offtake?: boolean; floorInterface?: string | null; creditSupport?: number;
} = {}): number {
  let relief = 0;
  if (opts.offtake) relief = Math.max(relief, C.hurdle_relief.offtake);
  const covers = opts.floorInterface ? (C.floor_covers[opts.floorInterface] ?? []) : [];
  if (covers.includes(stage)) relief = Math.max(relief, C.hurdle_relief.price_floor);
  if (opts.creditSupport) relief = Math.max(relief, opts.creditSupport * C.hurdle_relief.loan_guarantee);
  return Math.min(1, relief);
}

export type Verdict = {
  facility: string; stage: string; region: string; newKt: number; utilization: number;
  revenue: number; inputCost: number; opex: number; capitalCharge: number;
  margin: number; plannerMargin: number; breakeven: number;
  npv: number; overnightCapital: number; leadYears: number;
  funded: boolean; supportNeeded: number;
};

/** Screen one planner-chosen expansion at a firm's hurdle. */
export function evaluate(b: Buildout, prices: Prices, opts: {
  relief?: number; support?: number; basket?: Record<string, number>;
} = {}): Verdict {
  const rate = C.hurdle_rate[b.r] ?? C.discount_rate;
  const relief = opts.relief ?? 0;
  const eff = C.discount_rate + (1 - relief) * (rate - C.discount_rate);

  const outKt = b.kt * b.u;
  const basket = opts.basket ?? b.basket ?? C.basket;
  const [revPerKg, inPerKg] = stageFlows(b.s, prices, basket);
  const cf = C.regional_cost_factor?.[b.r]?.[b.s] ?? 1;
  const foak = C.foak_premium?.[b.r]?.[b.s] ?? 1;

  const revenue = outKt * revPerKg;
  const inputCost = outKt * inPerKg;
  const opex = outKt * b.v * cf;
  const baseFixed = b.fx * cf * foak;
  const ratio = crf(eff, C.asset_life_years) / crf(C.discount_rate, C.asset_life_years);
  const capitalCharge = baseFixed * ratio;
  const support = opts.support ?? 0;

  const margin = revenue - inputCost - opex - capitalCharge + support;
  const plannerMargin = revenue - inputCost - opex - baseFixed + support;
  const breakeven = outKt ? (inputCost + opex + capitalCharge - support) / outKt : Infinity;

  // Capital at the START of each construction year, operating margin at the END
  // of each operating year. That convention is what makes npv reconcile with the
  // levelized margin at zero lead; getting it wrong inflates every NPV by (1+r).
  const lead = C.lead_years?.[b.r]?.[b.s] ?? 0;
  const overnight = baseFixed / crf(C.discount_rate, C.asset_life_years);
  const opMargin = revenue - inputCost - opex + support;
  let npv = lead === 0 ? -overnight : 0;
  for (let k = 0; k < lead; k++) npv -= (overnight / lead) / (1 + eff) ** k;
  for (let k = 1; k <= C.asset_life_years; k++) npv += opMargin / (1 + eff) ** (lead + k);

  return {
    facility: b.f, stage: b.s, region: b.r, newKt: b.kt, utilization: b.u,
    revenue, inputCost, opex, capitalCharge, margin, plannerMargin, breakeven,
    npv, overnightCapital: overnight, leadYears: lead,
    funded: npv > 0, supportNeeded: Math.max(0, -margin),
  };
}

/** Screen a whole build-out. */
export const screen = (rows: Buildout[], prices: Prices, opts = {}): Verdict[] =>
  rows.map((b) => evaluate(b, prices, { ...opts, relief: instrumentRelief(b.s, opts as any) }));
