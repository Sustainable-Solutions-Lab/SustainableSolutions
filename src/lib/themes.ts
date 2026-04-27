// src/lib/themes.ts
// Single source of truth for research-theme colors and display labels.
// Used by publication cards (theme stripe + tag chips), the research
// theme pages (eyebrow accents), and any future theme-keyed UI.

export const THEME_COLORS: Record<string, string> = {
  'energy-systems': 'var(--spectral-3)',  // orange-red
  'land-use':       'var(--spectral-9)',  // green
  'trade':          'var(--spectral-10)', // blue
  'impacts':        'var(--spectral-2)',  // red
  'solutions':      'var(--spectral-11)', // purple
}

export const THEME_LABELS: Record<string, string> = {
  'energy-systems': 'Energy systems',
  'land-use':       'Land use',
  'trade':          'Trade',
  'impacts':        'Impacts',
  'solutions':      'Solutions',
}

/** Color for a theme slug; falls back to muted ink for unknown slugs. */
export function themeColor(slug: string): string {
  return THEME_COLORS[slug] ?? 'var(--ink-3)'
}

/** Display label for a theme slug; falls back to the slug itself. */
export function themeLabel(slug: string): string {
  return THEME_LABELS[slug] ?? slug
}
