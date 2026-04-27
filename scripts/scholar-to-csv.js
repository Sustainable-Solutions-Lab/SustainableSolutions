// scripts/scholar-to-csv.js
//
// Merge Google Scholar data sources into a single Publications CSV that
// matches the schema in CLAUDE.md.
//
// Inputs (in order of richness):
//   templates/scholar-details.json — full per-paper details (preferred)
//   templates/scholar-master.json   — paper IDs + titles in display order
//   templates/scholar-raw.json      — original master scrape (fallback)
//
// For each paper in scholar-master.json:
//   1. If detail exists → use full authors / journal / year / vol / DOI / abstract.
//   2. Else if scholar-raw has a matching title → use truncated authors + venue.
//   3. Else → minimal row with just the title.
//
// Output: templates/publications-from-scholar.csv

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const MASTER_IN = resolve('templates/scholar-master.json')
const DETAILS_IN = resolve('templates/scholar-details.json')
const RAW_IN = resolve('templates/scholar-raw.json')
const OUT = resolve('templates/publications-from-scholar.csv')

// ── Subscript fix for chemical formulas. Scholar HTML often inserts a span
//    between the element and the digit (e.g. "CO" + <span>2</span>) which
//    decode-and-strip turns into "CO 2" — restore as Unicode subscripts. ──
function fixSubscripts(s) {
  if (!s) return s
  return s
    .replace(/\bCO\s*2\b/g, 'CO₂')
    .replace(/\bCH\s*4\b/g, 'CH₄')
    .replace(/\bN\s*2\s*O\b/g, 'N₂O')
    .replace(/\bH\s*2\s*O\b/g, 'H₂O')
    .replace(/\bSO\s*2\b/g, 'SO₂')
    .replace(/\bNO\s*2\b/g, 'NO₂')
    .replace(/\bNO\s*x\b/g, 'NOₓ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Author reformatter ──
//
// Output format: "Last, FirstFull M." — preserves the full first given name
// (so "Yang" and "Yuxin" remain distinct in author lists) while compressing
// middle/later given names to single initials.
//
// Handles two inputs:
//   - Initials-first ("SJ Davis") → no full first available; emits "Davis, S.J."
//   - Full-name ("Steven J. Davis") → emits "Davis, Steven J."
//
// Truncation marker "..." → "et al."
function reformatAuthor(name) {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '...') return 'et al.'
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return trimmed

  // Initials-only first token (Scholar's bare-master "SJ Davis" form)
  if (/^[A-Z]+$/.test(tokens[0])) {
    const initials = tokens[0]
    const last = tokens.slice(1).join(' ')
    return `${last}, ${initials.split('').join('.')}.`
  }

  // Full-name form: keep first given as-is, compress later givens to initials
  const last = tokens[tokens.length - 1]
  const givens = tokens.slice(0, -1)
  if (givens.length === 0) return last
  const first = givens[0].replace(/\.$/, '')
  const middles = givens
    .slice(1)
    .map((g) => g.replace(/\./g, ''))
    .filter(Boolean)
    .map((g) => g[0].toUpperCase() + '.')
    .join(' ')
  const formatted = middles ? `${first} ${middles}` : first
  return `${last}, ${formatted}`
}

function reformatAuthors(authorsStr) {
  if (!authorsStr) return ''
  return authorsStr
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(reformatAuthor)
    .join('; ')
}

// ── Date parsing (Scholar gives "2018/6/29" or just "2018/6" or "2018"). ──
function parseDate(date) {
  if (!date) return { year: null, month: null }
  const m = date.match(/^(\d{4})(?:[\/\-](\d{1,2}))?/)
  if (!m) return { year: null, month: null }
  return { year: parseInt(m[1], 10), month: m[2] ? parseInt(m[2], 10) : null }
}

function buildVolumeIssue(volume, issue) {
  if (!volume) return ''
  const v = String(volume).trim()
  const i = (issue ?? '').toString().trim()
  return i ? `${v}(${i})` : v
}

// ── Fallback venue parser (for entries missing detail data). ──
function parseVenue(venue) {
  const orig = (venue ?? '').trim()
  let m = orig.match(/^(.+?)\s+(\d+)\s*\(([^)]+)\)\s*,\s*(.+)$/)
  if (m) return { journal: m[1].trim(), volume_issue: `${m[2]}(${m[3]})`, pages: m[4].trim() }
  m = orig.match(/^(.+?)\s+(\d+)\s*\(([^)]+)\)\s*$/)
  if (m) return { journal: m[1].trim(), volume_issue: `${m[2]}(${m[3]})`, pages: '' }
  m = orig.match(/^(.+?)\s+(\d+)\s*,\s*(.+)$/)
  if (m) return { journal: m[1].trim(), volume_issue: m[2], pages: m[3].trim() }
  m = orig.match(/^(.+?)\s+(\d+)\s*$/)
  if (m) return { journal: m[1].trim(), volume_issue: m[2], pages: '' }
  return { journal: orig, volume_issue: '', pages: '' }
}

// ── Title normalization for raw ↔ master matching ──
function normalizeTitle(t) {
  return (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// ── CSV serializer ──
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

const HEADERS = [
  'authors', 'title', 'journal', 'year', 'month', 'volume_issue', 'pages',
  'doi', 'url', 'pdf_url', 'code_url', 'themes', 'lab_authors', 'featured', 'press_url',
  'abstract', 'image_filename', 'brief_url', 'ppt_url',
]

async function main() {
  const master = JSON.parse(await readFile(MASTER_IN, 'utf8'))
  const details = JSON.parse(await readFile(DETAILS_IN, 'utf8'))
  let raw = []
  try { raw = JSON.parse(await readFile(RAW_IN, 'utf8')) } catch {}

  const rawByNorm = new Map()
  for (const r of raw) rawByNorm.set(normalizeTitle(r.title), r)

  const rows = [HEADERS]
  let richN = 0
  let rawN = 0
  let minN = 0

  for (const m of master) {
    const d = details[m.id]
    let row
    if (d) {
      richN++
      const { year, month } = parseDate(d.publication_date)
      const url = d.journal_link ?? (d.doi ? `https://doi.org/${d.doi}` : '')
      row = [
        reformatAuthors(d.authors),
        fixSubscripts(d.title || m.title),
        d.journal || '',
        year || '',
        month || '',
        buildVolumeIssue(d.volume, d.issue),
        d.pages || '',
        d.doi || '',
        url,
        '', '', '',                      // pdf_url, code_url, themes
        'steve-davis',                   // lab_authors
        'FALSE', '',                     // featured, press_url
        fixSubscripts(d.abstract || ''),
        '', '', '',                      // image_filename, brief_url, ppt_url
      ]
    } else {
      const r = rawByNorm.get(normalizeTitle(m.title))
      if (r) {
        rawN++
        const v = parseVenue(r.venue)
        row = [
          reformatAuthors(r.authors),
          fixSubscripts(r.title),
          v.journal,
          r.year || '',
          '',
          v.volume_issue,
          v.pages,
          r.doi || '',
          r.doi ? `https://doi.org/${r.doi}` : '',
          '', '', '',
          'steve-davis',
          'FALSE', '',
          '', '', '', '',
        ]
      } else {
        minN++
        row = [
          '',                            // authors
          fixSubscripts(m.title),
          '', '', '', '', '', '', '', '', '', '',
          'steve-davis',
          'FALSE', '',
          '', '', '', '',
        ]
      }
    }
    rows.push(row)
  }

  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(OUT, csv)
  console.log('')
  console.log(`[scholar-to-csv] wrote ${rows.length - 1} rows → ${OUT}`)
  console.log(`  rich (from scholar-details):  ${richN}`)
  console.log(`  raw  (from scholar-raw):      ${rawN}`)
  console.log(`  minimal (title only):         ${minN}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
