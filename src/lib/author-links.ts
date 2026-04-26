// src/lib/author-links.ts
// Map between full person names ("Steven J. Davis") and the canonical citation
// token used in publication authors strings ("Davis, S.J.").

import type { Person } from './types'

/**
 * "Steven J. Davis" → "Davis, S.J."
 * "Ken Caldeira"   → "Caldeira, K."
 *
 * Single-token names are returned unchanged.
 */
export function authorTokenForPerson(person: Person): string {
  const tokens = person.name.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return person.name
  const last = tokens[tokens.length - 1]
  const givens = tokens.slice(0, -1)
  const initials = givens
    .map((g) => g.replace(/\./g, '')[0]?.toUpperCase())
    .filter(Boolean)
    .map((c) => c + '.')
    .join('')
  return `${last}, ${initials}`
}

/**
 * Build a Map<token, slug> for the given lab-author slugs (e.g. from
 * publication.lab_authors), filtered against the People roster.
 */
export function buildAuthorReplacements(
  slugs: string[],
  people: Person[],
): Map<string, string> {
  const out = new Map<string, string>()
  for (const slug of slugs) {
    const person = people.find((p) => p.slug === slug)
    if (!person) continue
    out.set(authorTokenForPerson(person), person.slug)
  }
  return out
}

/**
 * Split a publication authors string ("Davis, S.J.; Caldeira, K.; ...") into
 * segments, marking which ones map to lab members.
 */
export function splitAuthors(
  authorsStr: string,
  replacements: Map<string, string>,
): Array<{ text: string; slug: string | null }> {
  return authorsStr
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ text, slug: replacements.get(text) ?? null }))
}
