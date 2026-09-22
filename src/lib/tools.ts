// Shared helpers for Tools-tab entries (cards, cross-references).

import type { Publication, Tool } from './types';

// Slugs whose own /tools/<slug> page isn't generated (multi-link
// initiatives etc.) — fall back to the /tools index for the link.
export const TOOLS_WITHOUT_DETAIL_PAGE = new Set(['cornerstone']);

// Canonical external home for initiatives that have no /tools/<slug> page, so
// cross-page references (companion-effort pointers on the home page, companion
// -tool links on publication cards) land on the project itself rather than the
// generic /tools index. The sheet's `link` column still wins over this, so
// filling that cell overrides the fallback without a code change.
export const TOOL_HOMEPAGES: Record<string, string> = {
  cornerstone: 'https://cornerstonedata.org/',
};

export function toolHref(t: Tool): string {
  if (t.link) return t.link;
  if (TOOL_HOMEPAGES[t.slug]) return TOOL_HOMEPAGES[t.slug];
  if (TOOLS_WITHOUT_DETAIL_PAGE.has(t.slug)) return '/tools';
  return `/tools/${t.slug}`;
}

// Companion tools for a publication, resolved from both directions:
// explicit slugs in the Publications tab's `tool` column, plus any
// Tools-tab row whose companion `doi` matches the paper. Deduped,
// explicit slugs first.
export function toolsForPublication(pub: Publication, tools: Tool[]): Tool[] {
  const bySlug = new Map(tools.map((t) => [t.slug, t]));
  const out: Tool[] = [];
  const seen = new Set<string>();
  for (const slug of pub.tool ?? []) {
    const t = bySlug.get(slug);
    if (t && !seen.has(t.slug)) {
      seen.add(t.slug);
      out.push(t);
    }
  }
  const doi = (pub.doi ?? '').trim().toLowerCase();
  if (doi) {
    for (const t of tools) {
      if ((t.doi ?? '').trim().toLowerCase() === doi && !seen.has(t.slug)) {
        seen.add(t.slug);
        out.push(t);
      }
    }
  }
  return out;
}
