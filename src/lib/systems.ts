// Top-level "systems" axis used by the scope matrix and the research pages.
// Single source of truth — both /research and /research/[slug] pages read
// from here so the landing-page card and the detail-page heading stay in sync.
//
// Editable fields (title, summary, hero_image) can also be set per-row in
// the Google Sheet's "Research" tab. Sheet values override the code defaults
// here when non-empty, so non-developers can update copy + hero images
// without touching code. Slug + color stay in code.

import researchData from '../data/research.json';

export interface System {
  slug: string;
  title: string;
  /** One-line description shown on the /research index card. */
  summary: string;
  /** Spectral palette CSS var used as an accent on the index card and as
   *  the colored band / sparkline / sub-area pill on the detail page. */
  color: string;
  /**
   * Hero image filename. Sheet-controlled — set the `hero_image` column
   * on the Research tab and drop the file into /public/research/ or
   * /public/images/. Falls back to a tinted color band when not set.
   */
  heroImage?: string;
}

interface ResearchOverride {
  slug: string;
  title?: string | null;
  summary?: string | null;
  hero_image?: string | null;
}

const overrides = new Map<string, ResearchOverride>(
  (researchData as ResearchOverride[]).map((r) => [r.slug, r]),
);

// Each system gets a maximally-distinct Spectral hue so the six index
// cards read as a qualitative set rather than a gradient.
const BASE_SYSTEMS: System[] = [
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
    color: 'var(--spectral-11)', // purple
  },
  {
    slug: 'climate',
    title: 'Climate',
    summary: 'Climate effects of greenhouse gas and air pollution emissions.',
    color: 'var(--brand-teal)',  // light blue (distinct from water's spectral-10)
  },
  {
    slug: 'health',
    title: 'Health',
    summary: 'Air pollution, heat exposure, and the human consequences of environmental change.',
    color: 'var(--spectral-2)',  // red
  },
];

// Merge sheet overrides on top of the code defaults. A blank cell in the
// sheet leaves the code default untouched so partial sheet rows are fine.
export const SYSTEMS: System[] = BASE_SYSTEMS.map((s) => {
  const o = overrides.get(s.slug);
  if (!o) return s;
  return {
    ...s,
    ...(o.title    ? { title: o.title }       : {}),
    ...(o.summary  ? { summary: o.summary }   : {}),
    ...(o.hero_image ? { heroImage: o.hero_image } : {}),
  };
});

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
