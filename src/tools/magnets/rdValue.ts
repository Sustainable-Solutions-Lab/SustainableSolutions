/**
 * What is it worth to fund the research that lifts the thrifting ceiling?
 *
 * The ceiling shipped first as a free switch: flip it and the bill falls, with
 * nothing charged for the engineering that made it possible. That reads as a
 * policy win rather than a research programme, and it is the wrong shape for the
 * question AMMTO actually asks — not "would a higher ceiling help" (obviously)
 * but "how much may we spend reaching it before it stops being worth it".
 *
 * So the uncertain parameter is the R&D COST, and the model supplies the value.
 * Everything here is arithmetic on two solved grid cells — the same scenario at
 * unlock=0 and unlock=1 — so it costs nothing to sweep in the browser.
 *
 * THE UNIT. Cost is quoted per kg of Dy/Tb that the research makes designable-out
 * (`$/kg unlocked`), not per kg actually abated. Those differ: the ceiling is a
 * possibility, and the optimiser only draws on it where marginal abatement cost
 * undercuts the premium it would otherwise pay. Quoting per-abated would flatter
 * the programme in exactly the scenarios where the premium is low and little of
 * the new headroom gets used. Because a $/kg is a $M/kt (see the repo's unit
 * convention), the bill is a plain multiplication.
 *
 * WHAT IS AND IS NOT COUNTED. The saving is the change in the US supply bill
 * between the two cells: cheaper because designed-out Dy/Tb is Dy/Tb you neither
 * import at a premium nor build capacity to make. It does NOT price the security
 * gain, which lands in the trade-risk index rather than in dollars, so a positive
 * net here is a floor on the case, not the whole of it. It also assumes the
 * research succeeds; a real portfolio would discount by a probability of
 * technical success, which is left to the reader because we have no defensible
 * number for it.
 */
import type { Scenario } from './interp';

/** Real US cost of supply, $M. Mirrors the explorer's `realCost` — the unmet
 *  penalty is excluded, because a shortage is not a bill anyone pays. */
export type CostFn = (sc: Scenario) => number;

export type RdCase = {
  /** Fraction of the sectoral barrier the research removes, 0–1. */
  unlock: number;
  /** Abatement ceiling before and after, as a share of embodied Dy/Tb. */
  ceilingFrom: number;
  ceilingTo: number;
  /** Dy/Tb the ceiling newly makes available to design out, kt. */
  ktUnlocked: number;
  /** Dy/Tb the optimiser actually designs out because of it, kt. */
  ktAbated: number;
  /** Fall in the US supply bill, $M. Positive = cheaper. This is the one the
   *  breakeven is struck against, because it is the bill the US actually pays. */
  saving: number;
  /** Fall in the GLOBAL least-cost objective, $M. Much larger than the US saving,
   *  because most of the benefit of designing Dy/Tb out accrues outside the US.
   *  Reported so the gap between the two is visible rather than a surprise: a
   *  programme can be excellent for the world and marginal for the US budget. */
  systemSaving: number;
  /** R&D bill at the assumed cost, $M. */
  rdCost: number;
  /** saving − rdCost, $M. */
  net: number;
  /** The cost per kg unlocked at which net hits zero, $/kg. Null when the
   *  research unlocks nothing, where no price makes it pay. */
  breakeven: number | null;
  /** Did the shortfall move? Recorded because it usually does not, and that is
   *  the most important thing to say about a thrifting programme under a ban. */
  unmetFrom: number;
  unmetTo: number;
};

/**
 * Value one R&D case, given the same scenario solved at both ceilings.
 *
 * `costPerKg` is the assumption under test: dollars of research per kg of Dy/Tb
 * of newly-designable-out capability. `unlock` scales a partial programme
 * linearly — both the capability bought and the bill.
 */
export function valueRd(base: Scenario, unlocked: Scenario, opts: {
  costPerKg: number;
  unlock?: number;
  ceilingFrom: number;
  ceilingTo: number;
  realCost: CostFn;
  /** Total embodied Dy/Tb the ceiling applies to, kt. Falls back to inferring it
   *  from the abated tonnage and the ceiling, which is exact when the optimiser
   *  sits at the ceiling and an underestimate when it does not. */
  embodiedKt?: number;
}): RdCase {
  const u = Math.max(0, Math.min(1, opts.unlock ?? 1));
  const { ceilingFrom, ceilingTo } = opts;

  const abFrom = base.kpis?.abated_dytb_kt ?? 0;
  const abTo = unlocked.kpis?.abated_dytb_kt ?? 0;
  const embodied = opts.embodiedKt
    ?? (ceilingFrom > 1e-9 ? abFrom / ceilingFrom : 0);

  const ceilingAt = ceilingFrom + u * (ceilingTo - ceilingFrom);
  const ktUnlocked = Math.max(0, embodied * (ceilingAt - ceilingFrom));
  const ktAbated = Math.max(0, (abTo - abFrom) * u);

  const saving = (opts.realCost(base) - opts.realCost(unlocked)) * u;
  const systemSaving = ((base.kpis?.npv_musd ?? 0) - (unlocked.kpis?.npv_musd ?? 0)) * u;
  const rdCost = ktUnlocked * opts.costPerKg;   // $/kg × kt == $M

  return {
    unlock: u, ceilingFrom, ceilingTo: ceilingAt, ktUnlocked, ktAbated,
    saving, systemSaving, rdCost, net: saving - rdCost,
    breakeven: ktUnlocked > 1e-6 ? saving / ktUnlocked : null,
    unmetFrom: base.kpis?.unmet_kt ?? 0,
    unmetTo: unlocked.kpis?.unmet_kt ?? 0,
  };
}
