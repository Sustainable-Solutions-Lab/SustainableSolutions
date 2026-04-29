// Top-level "systems" axis used by the scope matrix and the research pages.
// Single source of truth — both /research and /research/[slug] pages read
// from here so the landing-page card and the detail-page heading stay in sync.

export interface System {
  slug: string;
  title: string;
  /** One-line description shown on the /research index card. */
  summary: string;
  /** Spectral palette CSS var used as an accent on the index card and as
   *  the colored band / sparkline / sub-area pill on the detail page. */
  color: string;
  /**
   * Optional hero image filename. Drop the file into /public/research/
   * (preferred) or /public/images/ (shared) and put the bare filename
   * here, e.g. `heroImage: 'energy.jpg'`. Until set, the detail page
   * falls back to a tinted band in the system's accent color.
   */
  heroImage?: string;
}

// Each system gets a maximally-distinct Spectral hue so the six index
// cards read as a qualitative set rather than a gradient.
export const SYSTEMS: System[] = [
  {
    slug: 'energy',
    title: 'Energy',
    summary: 'Decarbonizing electricity, transport, and industrial energy use.',
    color: 'var(--spectral-3)',  // orange-red
  },
  {
    slug: 'food',
    title: 'Food',
    summary: 'Agricultural emissions, food security, and land-use tradeoffs.',
    color: 'var(--spectral-8)',  // light green
  },
  {
    slug: 'water',
    title: 'Water',
    summary: 'Drought, flooding, and water-energy-food interactions.',
    color: 'var(--spectral-10)', // blue
  },
  {
    slug: 'materials',
    title: 'Materials',
    summary: 'Decarbonization of structural materials — cement and steel — and securing of critical material supply chains.',
    color: 'var(--spectral-5)',  // yellow
  },
  {
    slug: 'climate',
    title: 'Climate',
    summary: 'Climate effects of greenhouse gas and air pollution emissions.',
    color: 'var(--spectral-2)',  // red
  },
  {
    slug: 'health',
    title: 'Health',
    summary: 'Air pollution, heat exposure, and the human consequences of environmental change.',
    color: 'var(--spectral-11)', // purple
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
