/**
 * The two intervention ledgers: what each lever buys the PLANNER in trade-risk
 * per dollar, and what each instrument closes of the ACTOR gap.
 *
 * Both are read from the current settings outward. A lever the settings deploy
 * is valued by what it BOUGHT (the current state against the same state with
 * the lever switched off); a lever they do not deploy is valued by what it
 * would buy NEXT (the same state with the lever at its next step). That is the
 * distinction a reader needs: "these are on, and this is what they cost you"
 * beside "this is the cheapest thing you have not done".
 *
 * The evaluation itself lives in the explorer, because it needs the explorer's
 * closures (grid reads, project reconciliation, the planner's own deployments).
 * This module holds the shapes, the ranking, and the actor-side arithmetic,
 * which depends on nothing but the project screen.
 */
import { screen, type Buildout, type Prices } from './projectFinance';

export type Effect = {
  /** Fall in integrated trade risk, index points. Positive = safer. */
  dTRI: number;
  /** Change in the US bill, $M over 2026-35. Positive = it costs money. */
  cost: number;
};

export type PlannerRow = {
  name: string;
  /** The settings currently deploy this lever. */
  deployed: boolean;
  /** Human reading of the deployed level ("20% of retirements", "18 kt"). */
  level?: string;
  /** What the deployed level bought, against the same state without it. */
  bought?: Effect;
  /** What the next step would buy, against the current state. Absent when
   *  the lever is already at its limit or cannot be stepped from here. */
  next?: Effect;
  /** The lever is a hypothetical overlay (build X regardless), not a setting. */
  overlay?: boolean;
  /** A short note on how the cost is counted, when it is not the model's own. */
  note?: string;
};

/** $M per 0.1 index points, or null when the effect is too small to rate. A
 *  negative cost with a real reduction is "pays for itself": 0, not null. */
export function perTenth(e?: Effect): number | null {
  if (!e || e.dTRI <= 0.005) return null;
  if (e.cost <= 0) return 0;
  return e.cost / (e.dTRI / 0.1);
}

export type ActorGap = {
  /** Expansions the plan calls for, and how many do not clear. */
  total: number; unfunded: number;
  /** kt of new capacity, total and not clearing. */
  totalKt: number; unfundedKt: number;
  /** Support that would close every shortfall, $M per year. */
  support: number;
};

export type ActorRow = {
  name: string;
  deployed: boolean;
  /** kt of the plan's capacity this instrument moves from unfunded to funded. */
  closedKt: number;
  /** Support no longer needed once it is applied, $M/yr. */
  supportRemoved: number;
  /** The gap that remains with the instrument fully applied. */
  after: ActorGap;
  /** Public or consumer cost where one is defined, $M/yr; null = contingent,
   *  unpriced (an offtake or guarantee costs nothing unless it is called). */
  costPerYear: number | null;
  note?: string;
};

export type ScreenOpts = Parameters<typeof screen>[2];

export function actorGap(us: Buildout[], prices: Prices, opts: ScreenOpts): ActorGap {
  const v = screen(us, prices, opts);
  const un = v.filter((x) => !x.funded);
  return {
    total: v.length, unfunded: un.length,
    totalKt: v.reduce((a, x) => a + x.newKt, 0),
    unfundedKt: un.reduce((a, x) => a + x.newKt, 0),
    support: un.reduce((a, x) => a + x.supportNeeded, 0),
  };
}

/**
 * One actor row: the gap with the instrument fully applied, against the gap
 * now. `apply` returns the screen options with the instrument at full.
 */
export function actorRow(name: string, us: Buildout[], prices: Prices, now: ActorGap,
                         base: ScreenOpts, apply: (o: ScreenOpts) => ScreenOpts,
                         deployed: boolean, costPerYear: number | null, note?: string): ActorRow {
  const after = actorGap(us, prices, apply({ ...base }));
  return {
    name, deployed, after, costPerYear, note,
    closedKt: Math.max(0, now.unfundedKt - after.unfundedKt),
    supportRemoved: Math.max(0, now.support - after.support),
  };
}

/** Rank: deployed rows by what they bought (cheapest per tenth first), then
 *  the next-up rows the same way, then anything with no effect here. */
export function rankPlanner(rows: PlannerRow[]) {
  const deployed = rows.filter((r) => r.deployed)
    .sort((a, b) => (perTenth(a.bought) ?? Infinity) - (perTenth(b.bought) ?? Infinity));
  const next = rows.filter((r) => !r.deployed && perTenth(r.next) != null)
    .sort((a, b) => (perTenth(a.next) ?? Infinity) - (perTenth(b.next) ?? Infinity));
  const inert = rows.filter((r) => !r.deployed && perTenth(r.next) == null);
  return { deployed, next, inert };
}
