// Canonicalize a date cell to ISO "YYYY-MM-DD" for sorting + display.
// Accepts:  2024-03-15, 3/15/2024, 3/15/24, 03/15/2024  (and missing day forms)
export function toIsoDate(d: string | null | undefined): string {
  if (!d) return '';
  const s = String(d).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) {
    const day = m[3] ?? '01';
    return `${m[1]}-${m[2].padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += yr >= 50 ? 1900 : 2000;
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return s; // unrecognized — sort as-is
}
