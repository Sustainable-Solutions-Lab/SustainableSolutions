// src/lib/author-links.ts
// Match author segments in publication citations against the People roster
// and tag matches with their lab-member slug for hyperlinking.
//
// The matcher is permissive about initials: "Davis, S." matches a person
// named "Steven J. Davis" because S is a prefix of S.J. — but "Davis, K."
// or "Davis, S.M." do not.

import type { Person } from './types'

export interface ParsedCitation {
  last: string
  initials: string[] // lowercased single chars, e.g. ['s', 'j']
}

/**
 * Parse a single citation token like "Davis, S.J." / "Davis, S." /
 * "Davis, Steven J." into { last, initials[] }.
 *
 * Returns null if the token doesn't fit the "Last, given" shape.
 */
export function parseCitationToken(token: string): ParsedCitation | null {
  const m = token.match(/^([^,]+),\s*(.+?)\.?$/)
  if (!m) return null
  const last = m[1].trim().toLowerCase()
  const initials = m[2]
    .split(/[\s.\-]+/)
    .filter(Boolean)
    .map((t) => t[0]?.toLowerCase())
    .filter(Boolean) as string[]
  return { last, initials }
}

/**
 * Parse a person's display name like "Steven J. Davis" or "Yuxin Chen"
 * into { last, initials[] }.
 *
 * Last-name-first formats ("Davis, Steven J.") aren't expected here — Person
 * objects always carry the natural-order display name.
 */
export function parsePersonName(name: string): ParsedCitation | null {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null
  const last = tokens[tokens.length - 1].toLowerCase()
  const initials = tokens
    .slice(0, -1)
    .map((t) => t.replace(/\./g, '')[0]?.toLowerCase())
    .filter(Boolean) as string[]
  return { last, initials }
}

/**
 * Match if last names are equal AND author's initials are a non-empty prefix
 * of the person's initials.
 *
 *   "Davis, S."     matches "Steven J. Davis"  (S prefix of S.J.)
 *   "Davis, S.J."   matches "Steven J. Davis"  (full match)
 *   "Davis, S.M."   does NOT match (M ≠ J)
 *   "Davis, K."     does NOT match (K ≠ S)
 *   "Davis"         does NOT match (no initials)
 */
function matches(a: ParsedCitation, p: ParsedCitation): boolean {
  if (a.last !== p.last) return false
  if (a.initials.length === 0) return false
  if (a.initials.length > p.initials.length) return false
  for (let i = 0; i < a.initials.length; i++) {
    if (a.initials[i] !== p.initials[i]) return false
  }
  return true
}

/**
 * Split an authors string ("Davis, S.J.; Caldeira, K.; ...") into segments,
 * tagging each one with its matching lab-member slug if any.
 */
export function splitAndLinkAuthors(
  authorsStr: string,
  people: Person[],
): Array<{ text: string; slug: string | null }> {
  const peopleParsed = people
    .map((p) => ({ slug: p.slug, parsed: parsePersonName(p.name) }))
    .filter((x): x is { slug: string; parsed: ParsedCitation } => !!x.parsed)

  return authorsStr
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => {
      const a = parseCitationToken(text)
      if (!a) return { text, slug: null }
      const match = peopleParsed.find((p) => matches(a, p.parsed))
      return { text, slug: match?.slug ?? null }
    })
}

/**
 * @deprecated Pre-computed token-based matcher kept for backward compat.
 * New code should use splitAndLinkAuthors() which auto-detects lab members.
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

/** @deprecated — use splitAndLinkAuthors instead. */
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

/** @deprecated — use splitAndLinkAuthors instead. */
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
