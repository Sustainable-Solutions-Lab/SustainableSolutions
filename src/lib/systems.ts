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
  /** Fill color — used on the matrix cells, sparkline fills, hero band
   *  tints, and decorative left-edge stripes. Light-end spectral hues
   *  are deliberately bright; do NOT use this for text. */
  color: string;
  /** Text-on-paper color — same hue family as `color` but dark enough to
   *  clear WCAG AA (4.5:1) against the cream background. Use for
   *  system labels in eyebrow chips, legends, and inline text. Defined
   *  as a CSS var so it auto-flips back to the spectral fill in dark
   *  mode where the lighter palette reads fine on deep-navy. */
  textColor: string;
  /**
   * Hero image filename. Sheet-controlled — set the `hero_image` column
   * on the Research tab and drop the file into /public/research/ or
   * /public/images/. Falls back to a tinted color band when not set.
   */
  heroImage?: string;
  /**
   * Short prose narrative shown on the detail page below the stats /
   * sparkline strip. Sheet-controlled (`narrative` column). Blank-line-
   * separated paragraphs render as separate <p> elements; single line
   * breaks within a paragraph collapse to a space.
   */
  narrative?: string;
}

interface ResearchOverride {
  slug: string;
  title?: string | null;
  summary?: string | null;
  hero_image?: string | null;
  narrative?: string | null;
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
    color:     'var(--spectral-3)',           // orange-red fill
    textColor: 'var(--system-energy-text)',   // 4.75:1 on paper
  },
  {
    slug: 'food',
    title: 'Food',
    summary: 'Agricultural emissions, food security, and land-use tradeoffs.',
    color:     'var(--spectral-8)',           // light green fill
    textColor: 'var(--system-food-text)',     // 4.87:1 on paper
  },
  {
    slug: 'water',
    title: 'Water',
    summary: 'Drought, flooding, and water-energy-food interactions.',
    color:     'var(--spectral-10)',          // blue fill
    textColor: 'var(--system-water-text)',    // 6.45:1 on paper
  },
  {
    slug: 'materials',
    title: 'Materials',
    summary: 'Decarbonization of structural materials — cement and steel — and securing of critical material supply chains.',
    color:     'var(--spectral-11)',          // purple fill
    textColor: 'var(--system-materials-text)', // 6.28:1 on paper (= spectral-11)
  },
  {
    slug: 'climate',
    title: 'Climate',
    summary: 'Climate effects of greenhouse gas and air pollution emissions.',
    color:     'var(--brand-teal)',           // light blue fill
    textColor: 'var(--system-climate-text)',  // 5.62:1 on paper
  },
  {
    slug: 'health',
    title: 'Health',
    summary: 'Air pollution, heat exposure, and the human consequences of environmental change.',
    color:     'var(--spectral-2)',           // red fill
    textColor: 'var(--system-health-text)',   // 7.72:1 on paper (= spectral-1 wine)
  },
];

// Merge sheet overrides on top of the code defaults. A blank cell in the
// sheet leaves the code default untouched so partial sheet rows are fine.
export const SYSTEMS: System[] = BASE_SYSTEMS.map((s) => {
  const o = overrides.get(s.slug);
  if (!o) return s;
  return {
    ...s,
    ...(o.title      ? { title: o.title }           : {}),
    ...(o.summary    ? { summary: o.summary }       : {}),
    ...(o.hero_image ? { heroImage: o.hero_image }  : {}),
    ...(o.narrative  ? { narrative: o.narrative }   : {}),
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
