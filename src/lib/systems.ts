// Top-level "systems" axis used by the scope matrix and the research pages.
// Single source of truth — both /research and /research/[slug] pages read
// from here so the landing-page card and the detail-page heading stay in sync.

export interface System {
  slug: string;
  title: string;
  /** One-line description shown on the /research index card. */
  summary: string;
}

export const SYSTEMS: System[] = [
  {
    slug: 'energy',
    title: 'Energy',
    summary: 'Decarbonizing electricity, transport, and industrial energy use.',
  },
  {
    slug: 'food',
    title: 'Food',
    summary: 'Agricultural emissions, food security, and land-use tradeoffs.',
  },
  {
    slug: 'water',
    title: 'Water',
    summary: 'Hydrology, drought, and water-energy-food interactions.',
  },
  {
    slug: 'materials',
    title: 'Materials',
    summary: 'Embodied emissions in heavy industry — steel, cement, plastics.',
  },
  {
    slug: 'climate',
    title: 'Climate',
    summary: 'Trends in CO₂ emissions and pathways to limit warming.',
  },
  {
    slug: 'health',
    title: 'Health',
    summary: 'Air pollution, heat exposure, and the human consequences of environmental change.',
  },
];

export function getSystem(slug: string): System | undefined {
  return SYSTEMS.find((s) => s.slug === slug);
}

/** Prefix-match: 'energy' catches 'energy:electricity' too. */
export function systemMatches(values: string[] | undefined, target: string): boolean {
  if (!values) return false;
  for (const v of values) {
    if (v === target) return true;
    if (v.startsWith(target + ':')) return true;
  }
  return false;
}
