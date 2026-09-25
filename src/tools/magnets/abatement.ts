/**
 * The heavy-abatement curve read as a demand response.
 *
 * A buyer facing an ex-China premium of $p/kg installs every thrifting option
 * that costs less than $p, so the share of Dy/Tb designed out is a step
 * function of the price the model already charges. This is not a separate
 * elasticity assumption bolted on: it is the marginal-abatement-cost curve the
 * optimiser already trades against, read right-to-left.
 *
 * Mirrors `config/demand_abatement.py`. The tranches SHOULD come from grid meta
 * (`meta.abatement`), which the model now emits — the inline fallback below
 * covers grids written before that and should be deleted once the next regrid
 * is deployed, because two copies of these numbers is exactly how they drift.
 */
import data from './scenarios.json';

type Tranche = { label: string; frac: number; cost: number };

// TEMPORARY fallback for pre-2026-09-25 grids. Delete with the next regrid.
const FALLBACK: Tranche[] = [
  { label: 'gbd_plus', frac: 0.20, cost: 120 },
  { label: 'grade_downshift', frac: 0.15, cost: 450 },
  { label: 're_free_sub', frac: 0.10, cost: 1600 },
];
const FALLBACK_PREMIUM = 2000;

const META = (data as any).meta?.abatement;
export const TRANCHES: Tranche[] = META?.tranches ?? FALLBACK;
export const EXCHINA_PREMIUM: number = META?.exchina_premium ?? FALLBACK_PREMIUM;

/** Friendly names; the config keys are terse. */
export const TRANCHE_LABEL: Record<string, string> = {
  gbd_plus: 'Grain-boundary diffusion',
  grade_downshift: 'Grade downshift',
  re_free_sub: 'RE-free substitution',
};

/** The premium a buyer faces at a given China export-restriction severity. */
export const premiumAt = (severity: number, costFactor = 1): number =>
  EXCHINA_PREMIUM * Math.max(0, Math.min(1, severity)) * 1;

/**
 * Share of Dy/Tb thrifted out at this premium: every option cheaper than the
 * price you would otherwise pay. A STEP function, which is the honest shape —
 * thrifting options are discrete technologies, not a smooth response.
 */
export function abatedShare(premium: number, costFactor = 1): number {
  return TRANCHES.reduce((a, t) => a + (t.cost * costFactor < premium ? t.frac : 0), 0);
}

/** Which options are worth installing at this premium, cheapest first. */
export function bindingTranches(premium: number, costFactor = 1): Tranche[] {
  return TRANCHES.filter((t) => t.cost * costFactor < premium)
    .sort((a, b) => a.cost - b.cost);
}

/** The most that can ever be designed out. A core of demand — offshore
 *  direct-drive, defence — has no substitute at any price. */
export const MAX_ABATABLE = TRANCHES.reduce((a, t) => a + t.frac, 0);
