// src/lib/roles.ts
// Classify a free-form role string into one of three categories — student,
// postdoc, or staff — and map each category to a Spectral palette color.
// Used by ActiveMemberCard to drive the left-edge stripe.

export type RoleCategory = 'student' | 'postdoc' | 'staff'

export const ROLE_COLORS: Record<RoleCategory, string> = {
  student: 'var(--spectral-9)',   // green
  postdoc: 'var(--spectral-10)',  // blue
  staff:   'var(--spectral-11)',  // purple
}

export function roleCategory(role: string | null | undefined): RoleCategory {
  const r = (role ?? '').toLowerCase()
  if (/postdoc/.test(r)) return 'postdoc'
  if (/\b(phd|ph\.?d\.?|doctoral|graduate|undergraduate|undergrad|m\.?s\.?|m\.?sc\.?|student)\b/.test(r)) return 'student'
  return 'staff'
}

export function roleColor(role: string | null | undefined): string {
  return ROLE_COLORS[roleCategory(role)]
}
