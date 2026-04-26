// scripts/enrich-from-crossref.js
//
// For every row in an input CSV that has a DOI, fetch metadata from the
// Crossref REST API and fill in any missing fields (year, month, journal,
// volume_issue, pages, authors). Existing non-empty cells are never
// overwritten — the script is additive.
//
// Run:
//   node scripts/enrich-from-crossref.js                      # default input
//   INPUT=templates/publications.csv \
//       node scripts/enrich-from-crossref.js                  # custom input
//
// Default input:  templates/publications-from-scholar.csv
// Output:         templates/publications-enriched.csv
//
// Crossref API: https://api.crossref.org/works/<doi>
// No auth required for reasonable usage. Polite User-Agent + small delay.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const INPUT = resolve(process.env.INPUT ?? 'templates/publications-from-scholar.csv')
const OUTPUT = resolve('templates/publications-enriched.csv')
const USER_AGENT = 'SustainableSolutionsLab/1.0 (mailto:sjdavis@stanford.edu)'
const RATE_DELAY_MS = 100

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Minimal CSV (RFC-4180-ish) parser/serializer ───────────────────────────
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// ── Crossref response → schema fields ──────────────────────────────────────
function authorsFromCrossref(msg) {
  if (!msg.author?.length) return null
  return msg.author
    .map((a) => {
      const last = (a.family ?? a.name ?? '').trim()
      if (!last) return null
      const givenStr = (a.given ?? '').trim()
      const initials = givenStr
        .split(/[\s\-]+/)
        .filter(Boolean)
        .map((g) => g.replace(/\./g, '')[0]?.toUpperCase())
        .filter(Boolean)
        .map((c) => c + '.')
        .join('')
      return initials ? `${last}, ${initials}` : last
    })
    .filter(Boolean)
    .join('; ')
}

function dateFromCrossref(msg) {
  const parts =
    msg['published-print']?.['date-parts']?.[0] ??
    msg['published-online']?.['date-parts']?.[0] ??
    msg.issued?.['date-parts']?.[0]
  if (!parts) return { year: null, month: null }
  return { year: parts[0] ?? null, month: parts[1] ?? null }
}

function volumeIssueFromCrossref(msg) {
  const v = msg.volume?.toString().trim()
  const i = msg.issue?.toString().trim()
  if (!v) return null
  return i ? `${v}(${i})` : v
}

function pagesFromCrossref(msg) {
  const p = msg.page?.toString().trim()
  return p || null
}

function journalFromCrossref(msg) {
  return msg['container-title']?.[0]?.trim() ?? null
}

async function fetchDOI(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Crossref ${doi}: ${res.status} ${res.statusText}`)
  const json = await res.json()
  return json.message
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const text = await readFile(INPUT, 'utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) {
    console.error(`[enrich-from-crossref] no rows in ${INPUT}`)
    process.exit(1)
  }
  const headers = rows[0].map((h) => h.trim())
  const colIdx = Object.fromEntries(headers.map((h, i) => [h, i]))

  const required = ['doi', 'authors', 'title', 'journal', 'year', 'volume_issue', 'pages', 'month']
  const missing = required.filter((c) => !(c in colIdx))
  if (missing.length) {
    console.error(`[enrich-from-crossref] input missing columns: ${missing.join(', ')}`)
    process.exit(1)
  }

  const out = [headers]
  let total = 0
  let touched = 0
  let notFound = 0
  let errors = 0

  for (let r = 1; r < rows.length; r++) {
    const row = [...rows[r]]
    while (row.length < headers.length) row.push('')
    total++

    const doi = (row[colIdx.doi] ?? '').trim()
    if (!doi) { out.push(row); continue }

    let msg
    try {
      msg = await fetchDOI(doi)
      await wait(RATE_DELAY_MS)
    } catch (err) {
      errors++
      console.warn(`  ! ${doi} — ${err.message}`)
      out.push(row)
      continue
    }
    if (!msg) {
      notFound++
      console.warn(`  ? ${doi} — not found`)
      out.push(row)
      continue
    }

    const fillIfEmpty = (col, value) => {
      if (value == null) return
      const i = colIdx[col]
      if (!row[i] || !row[i].trim()) {
        row[i] = String(value)
        return true
      }
      return false
    }

    const { year, month } = dateFromCrossref(msg)
    let changed = false
    if (fillIfEmpty('authors', authorsFromCrossref(msg))) changed = true
    if (fillIfEmpty('journal', journalFromCrossref(msg))) changed = true
    if (fillIfEmpty('year', year)) changed = true
    if (fillIfEmpty('month', month)) changed = true
    if (fillIfEmpty('volume_issue', volumeIssueFromCrossref(msg))) changed = true
    if (fillIfEmpty('pages', pagesFromCrossref(msg))) changed = true

    if (changed) touched++
    out.push(row)
  }

  const csv = out.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(OUTPUT, csv)
  console.log('')
  console.log(`[enrich-from-crossref] processed ${total} rows`)
  console.log(`  enriched: ${touched}`)
  console.log(`  not found: ${notFound}`)
  console.log(`  errors: ${errors}`)
  console.log(`  → ${OUTPUT}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
