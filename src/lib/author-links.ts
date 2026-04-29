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
 *   "Steven J. Davis"    → { last: "davis", givens: ["steven","j"] }   (natural order)
 *   "Robert J Andres"    → { last: "andres", givens: ["robert","j"] }
 *
 * Returns null if the token doesn't fit either shape.
 */
export function parseCitationToken(token: string): ParsedCitation | null {
  // Comma-form: "Last, given..."
  const commaMatch = token.match(/^([^,]+),\s*(.+?)\.?$/)
  if (commaMatch) {
    return {
      last: commaMatch[1].trim().toLowerCase(),
      givens: commaMatch[2]
        .split(/[\s.\-]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.toLowerCase()),
    }
  }
  // Natural-order fallback: "First Middle Last" with no comma. Last whitespace-
  // separated token is the surname, the rest are givens. Many publications use
  // this form (Scholar default, some journals' citation styles).
  const tokens = token.trim().split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    return {
      last: tokens[tokens.length - 1].toLowerCase(),
      givens: tokens
        .slice(0, -1)
        .map((t) => t.replace(/\./g, '').toLowerCase())
        .filter(Boolean),
    }
  }
  return null
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
/** Compare two surnames, allowing a hyphenated form on either side to
 *  match the trailing segment on the other (e.g. roster "Navarro-Fofrich"
 *  matches a paper's "Fofrich, R."). */
function lastNamesMatch(a: string, p: string): boolean {
  if (a === p) return true
  if (a.includes('-') && a.split('-').pop() === p) return true
  if (p.includes('-') && p.split('-').pop() === a) return true
  return false
}

function matches(a: ParsedCitation, p: ParsedCitation): boolean {
  if (!lastNamesMatch(a.last, p.last)) return false
  if (a.givens.length === 0 || p.givens.length === 0) return false
  // Compare only the givens both sides actually carry. The longer side
  // may have extra middle initials/names that the shorter side simply
  // didn't record (roster lists "Lyssa Freese", paper has "Freese, Lyssa
  // M." — same person, the M just wasn't in the sheet). Trades a small
  // false-positive risk for catching real lab members.
  const n = Math.min(a.givens.length, p.givens.length)
  for (let i = 0; i < n; i++) {
    const ag = a.givens[i]
    const pg = p.givens[i]
    if (ag.length === 1) {
      if (pg[0] !== ag[0]) return false
    } else if (pg.length === 1) {
      if (ag[0] !== pg[0]) return false
    } else if (ag === pg) {
      // exact match — common case
    } else if (
      ag.length >= 4 && pg.length >= 4 &&
      (pg.startsWith(ag) || ag.startsWith(pg))
    ) {
      // Nickname-prefix: "Steve" ↔ "Steven", "Cathy" ↔ "Catharine", etc.
      // Min 4 chars on both sides to avoid spurious short-prefix matches
      // (e.g. "Sam" → Samuel/Samantha).
    } else {
      return false
    }
  }
  return true
}

/**
 * Convert "Last, First Middle" → "First Middle Last" for display.
 * "Davis, Steven J."  → "Steven J. Davis"
 * "Davis, S.J."       → "S.J. Davis"
 * Tokens that don't fit the pattern (e.g. "et al.") are returned unchanged.
 */
export function toNaturalOrder(token: string): string {
  const m = token.match(/^([^,]+),\s*(.+)$/)
  if (!m) return token
  return `${m[2].trim()} ${m[1].trim()}`
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

  // Normalize whitespace before splitting — some sheet cells have hard
  // returns / tabs / runs of spaces in them which were producing inconsistent
  // line breaks in the rendered author lists (a name in a nowrap span with
  // an embedded newline was being broken differently than one without).
  const cleaned = (authorsStr ?? '').replace(/\s+/g, ' ').trim()

  return cleaned
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
