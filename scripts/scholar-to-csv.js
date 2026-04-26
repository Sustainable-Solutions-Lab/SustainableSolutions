// scripts/scholar-to-csv.js
// Convert a Google Scholar profile dump (templates/scholar-raw.json) into a CSV
// matching the Publications sheet schema (see CLAUDE.md § Google Sheets schemas).
//
// Limitations of Scholar list view:
//   - DOIs are not present in the list page (must be fetched per-paper)
//   - Author lists are abbreviated (e.g. "SJ Davis, NS Lewis, ...")
//   - Truncation marker "..." → 'et al.'
//   - Themes / lab_authors / featured / press_url cannot be inferred — left blank
//
// Run:
//   node scripts/scholar-to-csv.js
// Output: templates/publications-from-scholar.csv

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SRC = resolve('templates/scholar-raw.json')
const OUT = resolve('templates/publications-from-scholar.csv')

// ── Author reformat: "SJ Davis" → "Davis, S.J." ─────────────────────────────
function reformatAuthor(name) {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '...') return 'et al.'
  // Names with full first names ("Steven J Davis", "Jacqueline A. Dowling"):
  // detect by presence of a lowercase letter after the first space.
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return trimmed   // unparseable single token
  // If the first token is all-uppercase letters (Scholar's initials format):
  if (/^[A-Z]+$/.test(tokens[0])) {
    const initials = tokens[0]
    const last = tokens.slice(1).join(' ')
    const formatted = initials.split('').join('.') + '.'
    return `${last}, ${formatted}`
  }
  // Full first names: take last token as last name, rest as given names → initials.
  const last = tokens[tokens.length - 1]
  const givens = tokens.slice(0, -1)
  const initials = givens
    .filter((g) => g.length > 0 && g !== '.')
    .map((g) => g.replace(/\./g, '')[0]?.toUpperCase())
    .filter(Boolean)
    .map((c) => c + '.')
    .join('')
  return initials ? `${last}, ${initials}` : last
}

function reformatAuthors(authorsStr) {
  return authorsStr
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(reformatAuthor)
    .join('; ')
}

// ── Venue parse: "Science 360, 1419" → { journal, volume_issue, pages } ─────
function parseVenue(venue) {
  const orig = venue.trim()
  // 1. Try: "Journal Name <vol> (<issue>), <pages>"
  let m = orig.match(/^(.+?)\s+(\d+)\s*\(([^)]+)\)\s*,\s*(.+)$/)
  if (m) {
    return { journal: m[1].trim(), volume_issue: `${m[2]}(${m[3]})`, pages: m[4].trim() }
  }
  // 2. Try: "Journal Name <vol> (<issue>)"  (no pages)
  m = orig.match(/^(.+?)\s+(\d+)\s*\(([^)]+)\)\s*$/)
  if (m) {
    return { journal: m[1].trim(), volume_issue: `${m[2]}(${m[3]})`, pages: '' }
  }
  // 3. Try: "Journal Name <vol>, <pages>"
  m = orig.match(/^(.+?)\s+(\d+)\s*,\s*(.+)$/)
  if (m) {
    return { journal: m[1].trim(), volume_issue: m[2], pages: m[3].trim() }
  }
  // 4. Try: "Journal Name <vol>"  (no pages, no issue)
  m = orig.match(/^(.+?)\s+(\d+)\s*$/)
  if (m) {
    return { journal: m[1].trim(), volume_issue: m[2], pages: '' }
  }
  // 5. Fallback: whole string is the journal name
  return { journal: orig, volume_issue: '', pages: '' }
}

// ── CSV cell escape: wrap in quotes if contains comma/quote/newline ──────────
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

const HEADERS = [
  'authors', 'title', 'journal', 'year', 'month', 'volume_issue', 'pages',
  'doi', 'url', 'pdf_url', 'code_url', 'themes', 'lab_authors', 'featured', 'press_url',
]

async function main() {
  const raw = JSON.parse(await readFile(SRC, 'utf8'))
  const rows = [HEADERS]

  for (const p of raw) {
    const authors = reformatAuthors(p.authors)
    const { journal, volume_issue, pages } = parseVenue(p.venue)

    rows.push([
      authors,
      p.title,
      journal,
      p.year,
      '',                            // month (not in Scholar list)
      volume_issue,
      p.pages || pages,              // explicit `pages` override wins
      p.doi || '',                   // explicit `doi` override (some entries have it)
      '',                            // url
      '',                            // pdf_url
      '',                            // code_url
      '',                            // themes — manual
      'steve-davis',                 // lab_authors — Steve is the only known lab member so far
      'FALSE',                       // featured — manual
      '',                            // press_url
    ])
  }

  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(OUT, csv)
  console.log(`[scholar-to-csv] wrote ${rows.length - 1} rows → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
