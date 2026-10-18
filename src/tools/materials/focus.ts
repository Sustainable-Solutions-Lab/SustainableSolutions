/**
 * What the page is about: one material (or all of them) in one place.
 *
 * The material and place menus at the top set this, and every figure below
 * reads it: the headline and the three sliders measure it, the bars and the
 * contour report its growth, and the intensity slider moves only the
 * efficiency assumptions that act on it. One object, so that no figure can
 * quietly answer a different question from the one above it.
 */
import {
  GROUP_KEYS,
  GROUP_LABEL,
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
  type GroupKey,
  type IntensityLever,
  type Levers,
  type ModelRun,
} from './model';

export interface Focus {
  place: string;
  group: GroupKey | 'total';
  leaf: string | null;
  /** "Material use", "Biomass", "Crops": what is being measured, capitalised. */
  name: string;
  /** The efficiency rails that act on it. */
  levers: IntensityLever[];
  /**
   * Count metals as the metal they contain rather than the ore mined for it.
   * The paper counts ore; the model computes metal first and divides by the
   * modelled grade, so multiplying back by the same grade is exact.
   */
  metal: boolean;
}

/** Where counting metal rather than ore changes anything. */
export const metalBasisApplies = (group: GroupKey | 'total') => group === 'total' || group === 'metal_ores';

/** What the metal leaves and group are called when counted as metal. */
export const METAL_NAME: Record<string, string> = {
  metal_ores: 'Metals',
  'Ferrous ores': 'Iron and steel',
  'Non-ferrous ores': 'Non-ferrous metals',
};

/** The efficiency rail that sets each group's intensity. */
export const GROUP_LEVER: Record<GroupKey, IntensityLever> = {
  biomass: 'biomass',
  fossil_fuels: 'fossil',
  metal_ores: 'metalStock',
  nonmetallic_minerals: 'mineralStock',
};

export function makeFocus(place: string, group: GroupKey | 'total', leaf: string | null, metal = false): Focus {
  const m = metal && metalBasisApplies(group);
  const name = group === 'total' ? 'Material use' : leaf ?? GROUP_LABEL[group];
  return {
    place,
    group,
    leaf,
    name: m ? METAL_NAME[leaf ?? group] ?? name : name,
    levers: group === 'total' ? INTENSITY_LEVER_KEYS : [GROUP_LEVER[group]],
    metal: m,
  };
}

/** "material use in the world", "crops in Africa": for running text. */
export function focusPhrase(f: Focus): string {
  const what = f.group === 'total' ? 'material use' : f.name.toLowerCase();
  return `${what} ${f.place === 'World' ? 'worldwide' : `in ${f.place}`}`;
}

/** The focus's primary consumption (Mt), population and GDP ($) from one run. */
export function pick(f: Focus, run: ModelRun): { mass: ArrayLike<number>; pop: ArrayLike<number>; gdp: ArrayLike<number> } {
  const world = f.place === 'World';
  const pop = (world ? run.population : run.popByRegion[f.place]) ?? run.population;
  const gdp = (world ? run.gdp : run.gdpByRegion[f.place]) ?? run.gdp;
  const n = run.years.length;
  let mass: ArrayLike<number> | undefined;
  if (f.group === 'total') {
    if (world) mass = run.primary.total;
    else {
      const out = new Float64Array(n);
      for (const g of GROUP_KEYS) {
        const s = run.primary.byRegionGroup[f.place]?.[g];
        if (s) for (let i = 0; i < n; i++) out[i] += s[i];
      }
      mass = out;
    }
  } else if (f.leaf) {
    mass = world
      ? run.primary.byGroupDetail[f.group]?.[f.leaf]
      : run.primary.byRegionGroupDetail[f.place]?.[f.group]?.[f.leaf];
  } else {
    mass = world ? run.primary.byGroup[f.group] : run.primary.byRegionGroup[f.place]?.[f.group];
  }
  if (f.metal && mass) {
    const detail = world ? run.primary.byGroupDetail.metal_ores : run.primary.byRegionGroupDetail[f.place]?.metal_ores;
    const fe = detail?.['Ferrous ores'];
    const nf = detail?.['Non-ferrous ores'];
    const gFe = run.grade.Metal_Fe;
    const gNf = run.grade.Metal_NonFe;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const feM = (fe?.[i] ?? 0) * gFe[i];
      const nfM = (nf?.[i] ?? 0) * gNf[i];
      out[i] = f.group === 'total' ? mass[i] - (fe?.[i] ?? 0) - (nf?.[i] ?? 0) + feM + nfM
        : f.leaf === 'Ferrous ores' ? feM
        : f.leaf === 'Non-ferrous ores' ? nfM
        : feM + nfM;
    }
    mass = out;
  }
  return { mass: mass ?? new Float64Array(n), pop, gdp };
}

/** Average annual growth of the focus over the model's own years, 2025-2060. */
export function focusGrowth(f: Focus, run: ModelRun): number {
  const m = pick(f, run).mass;
  const n = m.length;
  const yrs = run.years[n - 1] - run.years[0];
  return m[0] > 0 && m[n - 1] > 0 ? Math.pow(m[n - 1] / m[0], 1 / yrs) - 1 : 0;
}

/** Put the given efficiency rails on one draw, leaving the others alone. */
export function setIntensity(l: Levers, keys: IntensityLever[], u: number): void {
  l.flowIntensityU = { ...l.flowIntensityU };
  l.stockIntensityU = { ...l.stockIntensityU };
  for (const lever of keys) {
    const spec = INTENSITY_LEVERS[lever];
    for (const k of spec.flows) l.flowIntensityU[k] = u;
    for (const [g, su] of spec.stocks) l.stockIntensityU[g] = { ...l.stockIntensityU[g], [su]: u };
  }
}

/** Mass in the unit that reads best: Gt above a billion tonnes, Mt below. */
export function fmtMass(mt: number): string {
  if (mt >= 10000) return `${Math.round(mt / 1000)} Gt`;
  if (mt >= 1000) return `${(mt / 1000).toFixed(1)} Gt`;
  if (mt >= 10) return `${Math.round(mt)} Mt`;
  return `${mt.toFixed(1)} Mt`;
}

export function fmtPeople(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  return `${Math.round(n / 1e6)} million`;
}

/** Kilograms per dollar, or grams when a single material is small. */
export function fmtPerDollar(kg: number): string {
  if (kg >= 0.1) return `${kg.toFixed(2)} kg`;
  const g = kg * 1000;
  return `${g >= 10 ? Math.round(g) : g.toFixed(1)} g`;
}
