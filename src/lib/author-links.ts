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
  /** Each given name is preserved as either a single-letter initial ("s")
   *  or the full lowercased name ("steven"). Distinguishing the two lets
   *  us disambiguate "Chen, Yang" from "Chen, Yuxin" — same last name and
   *  same initial, but different full first names. */
  givens: string[]
}

/**
 * Parse a single citation token like:
 *   "Davis, S.J."        → { last: "davis", givens: ["s","j"] }
 *   "Davis, S."          → { last: "davis", givens: ["s"] }
 *   "Davis, Steven J."   → { last: "davis", givens: ["steven","j"] }
 *   "Chen, Yang"         → { last: "chen",  givens: ["yang"] }
 *
 * Returns null if the token doesn't fit the "Last, given" shape.
 */
export function parseCitationToken(token: string): ParsedCitation | null {
  const m = token.match(/^([^,]+),\s*(.+?)\.?$/)
  if (!m) return null
  const last = m[1].trim().toLowerCase()
  const givens = m[2]
    .split(/[\s.\-]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.toLowerCase())
  return { last, givens }
}

/**
 * Parse a person's display name like "Steven J. Davis" or "Yuxin Chen".
 *   "Steven J. Davis"   → { last: "davis", givens: ["steven","j"] }
 *   "Yuxin Chen"        → { last: "chen",  givens: ["yuxin"] }
 */
export function parsePersonName(name: string): ParsedCitation | null {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null
  const last = tokens[tokens.length - 1].toLowerCase()
  const givens = tokens
    .slice(0, -1)
    .map((t) => t.replace(/\./g, '').toLowerCase())
    .filter(Boolean)
  return { last, givens }
}

/**
 * Match author citation against a person.
 *
 * Rules per given (in order):
 *   - If author's given is a single letter (initial only): require it to
 *     equal the first letter of person's corresponding given.
 *   - If author's given is a full name AND person's is too: require exact
 *     equality (case-insensitive). This disambiguates "Yang" vs "Yuxin".
 *   - If author's given is full and person's is initial only (rare): match
 *     by first letter.
 *
 * Author can have FEWER givens than person (the citation may omit a middle
 * initial). Author may not have MORE — that would expand the person's name.
 */
function matches(a: ParsedCitation, p: ParsedCitation): boolean {
  if (a.last !== p.last) return false
  if (a.givens.length === 0) return false
  if (a.givens.length > p.givens.length) return false
  for (let i = 0; i < a.givens.length; i++) {
    const ag = a.givens[i]
    const pg = p.givens[i]
    if (ag.length === 1) {
      if (pg[0] !== ag[0]) return false
    } else if (pg.length === 1) {
      if (ag[0] !== pg[0]) return false
    } else {
      if (ag !== pg) return false
    }
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
