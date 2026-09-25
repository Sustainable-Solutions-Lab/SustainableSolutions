/**
 * The planner's deployment of the costed interventions.
 *
 * Three levers used to be SET by the reader: a recycling collection rate, a
 * stockpile size, and whether the thrifting barrier was broken. Each is now
 * deployed to the degree the least-cost planner wants it, at a cost the reader
 * states. The reader supplies the unknown (what collection, stockpiling and
 * research cost); the model supplies the answer (how much of each pays).
 *
 * None of this re-solves. Every choice is arithmetic over cells the grid has
 * already solved, so the planner's deployment is a lookup and a comparison.
 *
 * Collection is a WORLD parameter in the model, so the planner chooses it on
 * the world objective. The stockpile and the R&D decision are US-side, so they
 * are judged on the US bill.
 */
import type { Scenario } from './interp';
import { valueRd, type CostFn, type RdCase } from './rdValue';

/** Real discount rate, matching the model's. */
const DISCOUNT = 0.07;

/** Horizon years the grid is solved over, from the meta of the cell itself. */
const HORIZON = 10;

/** Discounted tonnage collected over the horizon, kt, from the recycled flows
 *  the cell carries. The precompute emits recycled flows at two snapshot years
 *  (2030 and 2035), not per year, so the trajectory is approximated: held at
 *  the 2030 rate through 2030, then linear to 2035. Until the precompute emits
 *  the per-year series this is the honest shape of what the grid knows. */
export function collectedKtNPV(sc: Scenario, region?: string): number {
  const by = sc.flows_by_year ?? {};
  const tot = (yr: string) => (by[yr]?.recycled ?? [])
    .filter((f) => !region || f.from === region)
    .reduce((a, f) => a + f.value, 0);
  const r30 = tot('2030');
  const r35 = tot('2035');
  if (r30 <= 0 && r35 <= 0) return 0;
  let npv = 0;
  for (let t = 0; t < HORIZON; t++) {          // t=0 is 2026
    const yr = 2026 + t;
    const kt = yr <= 2030 ? r30 : r30 + (r35 - r30) * ((yr - 2030) / 5);
    npv += kt / (1 + DISCOUNT) ** t;
  }
  return npv;
}

export type CollectionChoice = {
  /** The collection rate the planner deploys, one of the solved grid points. */
  rate: number;
  /** Discounted tonnage collected at that rate, kt. */
  collectedKt: number;
  /** Collection bill at that rate, $M. */
  bill: number;
  /** Fall in the world objective vs no collection, $M, BEFORE the bill. */
  systemSaving: number;
  /** The rates considered, with the total the planner weighed for each. */
  ladder: { rate: number; total: number; saving: number; bill: number }[];
};

/**
 * Pick the collection rate that minimises world cost plus the collection bill.
 *
 * `cellAt(rate)` returns the solved scenario at that rate with everything else
 * held. The planner in the grid already pays to build and run the recyclers;
 * what it never paid was the cost of getting end-of-life magnets to them, which
 * is what `costPerKg` supplies. A $/kg is a $M/kt, so bill = kt x cost.
 */
export function chooseCollection(rates: number[], cellAt: (rate: number) => Scenario,
                                 costPerKg: number): CollectionChoice {
  const sorted = [...rates].sort((a, b) => a - b);
  const base = cellAt(sorted[0]);
  const baseNpv = base.kpis?.npv_musd ?? 0;
  const ladder = sorted.map((rate) => {
    const sc = cellAt(rate);
    const kt = collectedKtNPV(sc);
    const bill = kt * costPerKg;
    const npv = sc.kpis?.npv_musd ?? 0;
    return { rate, total: npv + bill, saving: baseNpv - npv, bill, kt };
  });
  // Lowest total wins; on a tie the LOWER rate, so a lever that buys nothing is
  // not deployed on the strength of solver noise.
  let best = ladder[0];
  for (const l of ladder) if (l.total < best.total - 1e-6) best = l;
  return {
    rate: best.rate, collectedKt: best.kt, bill: best.bill, systemSaving: best.saving,
    ladder: ladder.map(({ rate, total, saving, bill }) => ({ rate, total, saving, bill })),
  };
}

export type StockpileChoice = {
  /** Size the planner holds, kt of finished magnet. */
  kt: number;
  /** Cumulative unmet US demand the buffer could cover, kt. */
  unmetKt: number;
  /** Acquire-and-hold bill, $M. */
  bill: number;
  /** Whether holding pays: cost per kg below the value of a kg of unmet demand. */
  pays: boolean;
};

/**
 * Size the stockpile. A buffer covers unmet demand kilogram for kilogram, and
 * every covered kilogram is worth the same stated value, so the choice is
 * all-or-nothing: hold enough to cover the shortfall when acquire-and-hold
 * costs less than what going without would cost, otherwise hold nothing.
 *
 * `valuePerKg` is the assumption doing the work. The 2025 controls revealed a
 * FLOOR of roughly $55/kg of magnet (the ex-China premium buyers paid rather
 * than go without); value-at-risk and electricity value-of-lost-load analogies
 * put a short unforeseen shortage at $10,000/kg and up; a foreseen multi-year
 * gap, which is what the grid's unmet demand is, is bounded by the cost of
 * designing the magnet out, a few hundred $/kg. The default sits there.
 */
export function chooseStockpile(sc: Scenario, costPerKg: number, valuePerKg: number,
                                maxKt: number): StockpileChoice {
  const unmet = (sc.path?.us_mix?.unmet ?? []).reduce((a, u) => a + u, 0);
  const pays = costPerKg < valuePerKg && unmet > 1e-6;
  const kt = pays ? Math.min(unmet, maxKt) : 0;
  return { kt, unmetKt: unmet, bill: kt * costPerKg, pays };
}

export type RdChoice = {
  /** 1 when the planner funds the research, else 0. */
  unlock: number;
  /** The valuation behind the decision. */
  rd: RdCase;
  /** False until the aspirational-ceiling cells are resident; the decision
   *  then defaults to not funded rather than to a guess. */
  evaluated: boolean;
};

/** Fund the barrier-breaking research when its saving on the US bill exceeds
 *  its cost. Same rule as the R&D panel, made the planner's rather than the reader's. */
export function chooseRd(base: Scenario, unlocked: Scenario, opts: {
  costPerKg: number; ceilingFrom: number; ceilingTo: number; realCost: CostFn;
  evaluated: boolean;
}): RdChoice {
  const rd = valueRd(base, unlocked, {
    costPerKg: opts.costPerKg, unlock: 1,
    ceilingFrom: opts.ceilingFrom, ceilingTo: opts.ceilingTo, realCost: opts.realCost,
  });
  return { unlock: opts.evaluated && rd.net > 0 ? 1 : 0, rd, evaluated: opts.evaluated };
}

/** Anchors for the value-of-unmet-demand control, $/kg of finished magnet. */
export const UNMET_VALUE_ANCHORS = {
  /** What buyers paid rather than go without in 2025: the ex-China oxide spread
   *  carried through the bill of materials. A floor. */
  revealed2025: 55,
  /** Cost of designing the magnet out over a foreseen multi-year gap. */
  adaptation: 200,
  /** Value at risk of a short, unforeseen stoppage: vehicle output per kg of
   *  magnet, or an electricity value-of-lost-load ratio. */
  lostLoad: 20000,
};
export const UNMET_VALUE_DEFAULT = UNMET_VALUE_ANCHORS.adaptation;
