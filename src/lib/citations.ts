// Shared citation lookup against templates/scholar-details.json. Used by
// the publications list, the scope matrix, and the research detail pages.
//
// Most scholar-details entries don't have a DOI captured (Scholar's HTML
// doesn't always expose it), so we keep two lookup maps and fall back to
// normalized-title matching. Title fallback brings citation coverage from
// ~25% (DOI-only) to ~95% on the current dataset.

import scholarDetails from '../../templates/scholar-details.json';
import type { Publication } from './types';

export interface ScholarDetail {
  doi?: string;
  title?: string;
  total_citations?: number;
  citations?: { year: number; count: number }[];
}

export function normalizeTitle(t: string | null | undefined): string {
  return (t ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const detailsByDoi = new Map<string, ScholarDetail>();
const detailsByTitle = new Map<string, ScholarDetail>();
for (const detail of Object.values(scholarDetails as Record<string, ScholarDetail>)) {
  if (!detail) continue;
  if (detail.doi) detailsByDoi.set(detail.doi.toLowerCase(), detail);
  const tk = normalizeTitle(detail.title);
  if (tk && !detailsByTitle.has(tk)) detailsByTitle.set(tk, detail);
}

export function detailFor(pub: Publication): ScholarDetail | null {
  if (pub.doi) {
    const d = detailsByDoi.get(pub.doi.toLowerCase());
    if (d) return d;
  }
  const tk = normalizeTitle(pub.title);
  return tk ? detailsByTitle.get(tk) ?? null : null;
}

export function totalCitations(pub: Publication): number {
  return detailFor(pub)?.total_citations ?? 0;
}

export function citationsArray(pub: Publication): { year: number; count: number }[] | null {
  const d = detailFor(pub);
  return d && Array.isArray(d.citations) && d.citations.length > 0 ? d.citations : null;
}

export function recentCitations(pub: Publication, windowYrs = 3): number {
  const cs = citationsArray(pub);
  if (!cs) return 0;
  const cutoff = new Date().getFullYear() - windowYrs + 1;
  return cs.filter((c) => c.year >= cutoff).reduce((s, c) => s + (c.count || 0), 0);
}
