/**
 * What stands behind a row of the plan's build-out: a plant, or nothing yet.
 *
 * The planner expands MODEL ROWS. Some stand for a real plant (`US_Magnet_MP` is
 * MP Materials at Fort Worth), and some for capacity no one has announced
 * (`US_Magnet_New`). The page used to call all of them "projects", which read
 * as though every tonne the plan asks for had a developer behind it.
 *
 * Two kinds, and a row can hold both:
 *
 *   named     an expansion at a plant with a name, up to what that plant's
 *             owner has announced, is building or plans
 *   generic   capacity with no announced project: a row that stands for none,
 *             or the part of a named row beyond anything announced. The planner
 *             put it at that plant's COST; it is not that plant's project.
 *
 * `announced` is the expansion the owner has announced, in the unit the columns
 * draw (separation in Nd/Pr and Dy/Tb oxide), from the project list where it
 * carries the figure and from the plant's note there where it does not.
 */
import type { Project } from './projectFinance';

export type FacilityKind = 'named' | 'generic';
type Facility = { name: string; kind: FacilityKind; announced?: number; basis?: string };

const STAGE_WORD: Record<string, string> = {
  mining: 'mining', separation: 'separation', alloy: 'alloy', magnet: 'magnet',
  recycling: 'recycling',
};

const FACILITIES: Record<string, Facility> = {
  // magnets
  US_Magnet_MP: { name: 'MP Fort Worth', kind: 'named', announced: 2,
                  basis: '1 kt installed, expansion to 3 kt projected' },
  US_Magnet_MP10X: { name: 'MP “10X” (Northlake)', kind: 'named', announced: 7,
                     basis: 'about 7 kt, under construction' },
  US_Magnet_eVAC: { name: 'e-VAC Magnetics', kind: 'named', announced: 10,
                    basis: '2 kt installed; 4 kt then 12 kt announced' },
  US_Magnet_Noveon: { name: 'Noveon', kind: 'named', announced: 0,
                      basis: '2 kt installed, no expansion announced' },
  US_Magnet_USARE: { name: 'USA Rare Earth (Stillwater)', kind: 'named', announced: 0.6,
                     basis: '0.6 kt commissioned, 1.2 kt in 2027' },
  US_Magnet_Blacksburg: { name: 'USA Rare Earth (Blacksburg)', kind: 'named', announced: 6.4,
                          basis: '6.4 kt, under construction' },
  US_Magnet_New: { name: 'new magnet capacity', kind: 'generic' },
  // alloy
  US_Alloy: { name: 'MP Fort Worth (alloy)', kind: 'named', announced: 0,
              basis: '1.2 kt installed, sized to its magnet line; no expansion announced' },
  US_Alloy_Phoenix: { name: 'Phoenix Tailings', kind: 'named', announced: 0.35,
                      basis: '0.65 kt installed, scaling to 1 kt' },
  US_Alloy_New: { name: 'new alloy capacity', kind: 'generic' },
  // separation, in Nd/Pr and Dy/Tb oxide
  US_Sep_MountainPass: { name: 'Mountain Pass separation', kind: 'named', announced: 0,
                         basis: '6.1 kt installed, no further line announced' },
  US_Sep_EnergyFuels: { name: 'Energy Fuels (White Mesa)', kind: 'named', announced: 6.3,
                        basis: 'phase 2: 6 kt Nd/Pr and 0.3 kt Dy/Tb, no investment decision' },
  US_Sep_Ucore: { name: 'Ucore Louisiana', kind: 'named', announced: 2,
                  basis: 'three lines of about 3 kt TREO each, planned' },
  US_Sep_ReElement: { name: 'ReElement (Indiana)', kind: 'named', announced: 0,
                      basis: '0.25 kt claimed, no expansion with a date' },
  US_Sep_Aclara: { name: 'Aclara Louisiana', kind: 'named', announced: 0.9,
                   basis: 'one plant, about 5 kt TREO of heavy-rich feed, announced' },
  // mining
  Mountain_Pass: { name: 'Mountain Pass', kind: 'named', announced: 9,
                   basis: '51 kt installed, 60 kt a company target' },
  Round_Top: { name: 'Round Top', kind: 'named', announced: 2.5,
               basis: '2.5 kt, pre-commercial' },
  // recycling
  US_Recycle_Op: { name: 'Noveon (recycling)', kind: 'named', announced: 0,
                   basis: '2 kt installed' },
  US_Recycle: { name: 'new recycling capacity', kind: 'generic' },
};

const lookup = (facility: string, stage: string): Facility =>
  FACILITIES[facility]
  ?? (/_(New|Other)$/.test(facility)
    ? { name: `new ${STAGE_WORD[stage] ?? stage} capacity`, kind: 'generic' }
    : { name: facility.replace(/^US_/, '').replace(/_/g, ' '), kind: 'named', announced: 0 });

export type Part = {
  stage: string; facility: string; kind: FacilityKind;
  /** How the part is named on the page. */
  label: string;
  /** Where the planner put it, for generic capacity placed at a named plant. */
  at?: string;
  kt: number; fundedKt: number;
  /** $M a year that would make the part clear. */
  support: number;
  basis?: string;
};

/**
 * Split one facility's expansion into what a named plant has announced and
 * what goes beyond it. Cohorts are taken in the order they are built, so the
 * announced expansion is the earliest tonnage.
 */
export function splitByKind(p: Project): Part[] {
  const f = lookup(p.facility, p.stage);
  const generic = (kt: number, fundedKt: number, support: number, at?: string): Part => ({
    stage: p.stage, facility: p.facility, kind: 'generic', kt, fundedKt, support, at,
    label: `new ${STAGE_WORD[p.stage] ?? p.stage} capacity, no announced project`,
  });
  if (f.kind === 'generic') return [generic(p.newKt, p.fundedKt, p.supportNeeded)];
  let room = f.announced ?? 0;
  const named: Part = { stage: p.stage, facility: p.facility, kind: 'named', basis: f.basis,
                        label: `${f.name}, expansion`, kt: 0, fundedKt: 0, support: 0 };
  const beyond = generic(0, 0, 0, f.name);
  const cohorts = [...p.cohorts].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  for (const c of cohorts) {
    const inside = Math.max(0, Math.min(room, c.newKt));
    room -= inside;
    const share = c.newKt > 1e-9 ? inside / c.newKt : 0;
    named.kt += inside; beyond.kt += c.newKt - inside;
    if (c.funded) { named.fundedKt += inside; beyond.fundedKt += c.newKt - inside; }
    named.support += c.supportNeeded * share;
    beyond.support += c.supportNeeded * (1 - share);
  }
  return [named, beyond].filter((x) => x.kt > 0.005);
}

/** The name of the plant a row stands for, or of what it is when it stands for none. */
export const facilityName = (facility: string, stage: string): string => lookup(facility, stage).name;
