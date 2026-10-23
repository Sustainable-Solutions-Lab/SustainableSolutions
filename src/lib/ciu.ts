// The Conceptual Investigations Unit has its own site; role lines and
// research cards that name the unit link out to it.
export const CIU_URL = 'https://ciunit.org';
const CIU_NAME = 'Conceptual Investigations Unit';

// Splits a role string around the unit's name so the name can render as a link.
export function splitCiu(text: string | null | undefined): { before: string; name: string | null; after: string } {
  const s = text ?? '';
  const i = s.indexOf(CIU_NAME);
  if (i < 0) return { before: s, name: null, after: '' };
  return { before: s.slice(0, i), name: CIU_NAME, after: s.slice(i + CIU_NAME.length) };
}
