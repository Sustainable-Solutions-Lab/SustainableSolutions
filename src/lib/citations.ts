// Shared citation lookup against templates/scholar-details.json. Used by
// the publications list, the scope matrix, and the research detail pages.
//
// Most scholar-details entries don't have a DOI captured (Scholar's HTML
// doesn't always expose it), so we keep two lookup maps and fall back to
// normalized-title matching. Title fallback brings citation coverage from
// ~25% (DOI-only) to ~95% on the current dataset.

import scholarDetails from '../../templates/scholar-details.json';
import scholarMaster from '../../templates/scholar-master.json';
import type { Publication } from './types';

export interface ScholarDetail {
  id?: string;
  doi?: string;
  title?: string;
  total_citations?: number;
  citations?: { year: number; count: number }[];
}

interface ScholarMasterRow {
  id?: string;
  title?: string;
  cited_by?: number | null;
  year?: number | null;
}

// Citation TOTALS come from the master profile listing, which is re-scraped in
// full on every run (~3 requests). The per-paper detail pages are cached
// permanently and rate-limited by Scholar, so their `total_citations` goes
// stale the moment a paper is first seen — and is missing entirely for papers
// whose detail fetch was throttled. Master is therefore the source of truth
// for counts; details still supplies the per-year chart, DOI, and abstract.
const masterById = new Map<string, ScholarMasterRow>();
const masterByTitle = new Map<string, ScholarMasterRow>();
for (const row of Object.values(scholarMaster as Record<string, ScholarMasterRow>)) {
  if (!row) continue;
  if (row.id) masterById.set(row.id, row);
  const tk = normalizeTitle(row.title);
  if (tk && !masterByTitle.has(tk)) masterByTitle.set(tk, row);
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
  // Prefer the freshly-scraped master count; fall back to the cached detail
  // figure only when the paper isn't on the profile listing.
  const d = detailFor(pub);
  const row =
    (d?.id ? masterById.get(d.id) : undefined) ??
    masterByTitle.get(normalizeTitle(pub.title));
  if (row && typeof row.cited_by === 'number') return row.cited_by;
  return d?.total_citations ?? 0;
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
