// scripts/lookup-missing-by-title.js
//
// For every row in templates/publications-from-scholar.csv that has a title
// but no DOI, query the Crossref REST API by title and fill in:
//   doi, authors, journal, year, month, volume_issue, pages
//
// Crossref returns scored matches; we accept a result only if the returned
// title's normalized form equals the row's normalized title (strict — better
// to leave a row alone than to attach the wrong DOI). Existing non-empty
// cells are never overwritten.
//
// Run:
//   node scripts/lookup-missing-by-title.js
//
// Rewrites templates/publications-from-scholar.csv in place. Idempotent:
// rows that now have a DOI are skipped on subsequent runs.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const INPUT = resolve('templates/publications-from-scholar.csv')
const USER_AGENT = 'SustainableSolutionsLab/1.0 (mailto:sjdavis@stanford.edu)'
const RATE_DELAY_MS = 200

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── CSV parse / serialize (same as enrich-from-crossref.js) ──
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
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

// ── Crossref response → schema fields ──
function authorsFromCrossref(msg) {
  if (!msg.author?.length) return null
  return msg.author
    .map((a) => {
      const last = (a.family ?? a.name ?? '').trim()
      if (!last) return null
      const givenStr = (a.given ?? '').trim()
      // Preserve full first name to keep "Yang" vs "Yuxin" distinct (matches
      // scholar-to-csv's reformatAuthor convention).
      if (!givenStr) return last
      const tokens = givenStr.split(/[\s\-]+/).filter(Boolean)
      const first = tokens[0]
      const middles = tokens
        .slice(1)
        .map((t) => t.replace(/\./g, '')[0]?.toUpperCase())
        .filter(Boolean)
        .map((c) => c + '.')
        .join(' ')
      const formatted = middles ? `${first} ${middles}` : first
      return `${last}, ${formatted}`
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

function journalFromCrossref(msg) {
  return msg['container-title']?.[0]?.trim() ?? null
}

function normalizeTitle(t) {
  return (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Crossref's full-text index is ASCII; subscript Unicode (CO₂, CH₄, …)
// silently drops out. Strip subscripts to digits before sending the query
// AND before comparing returned titles, so "CO₂" matches "CO2".
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'
function asciifyChemistry(t) {
  if (!t) return t
  return t.replace(/[₀-₉]/g, (c) => String(SUBSCRIPT_DIGITS.indexOf(c)))
    .replace(/[–—]/g, '-') // en/em dash → hyphen
    .replace(/[‘’]/g, "'") // smart single quotes
    .replace(/[“”]/g, '"') // smart double quotes
}

async function searchByTitle(title) {
  const queryTitle = asciifyChemistry(title)
  const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(queryTitle)}&rows=5`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Crossref ${res.status} ${res.statusText}`)
  const json = await res.json()
  const items = json?.message?.items ?? []
  const target = normalizeTitle(asciifyChemistry(title))
  // Strict match: any returned item whose normalized (asciified) title
  // equals ours. Crossref's index is ASCII so we asciify both sides.
  for (const item of items) {
    const cands = [...(item.title ?? []), ...(item['original-title'] ?? [])]
    for (const c of cands) {
      if (normalizeTitle(asciifyChemistry(c)) === target) return item
    }
  }
  return null
}

// ── Main ──
async function main() {
  const text = await readFile(INPUT, 'utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) {
    console.error(`[lookup-missing-by-title] no rows in ${INPUT}`)
    process.exit(1)
  }
  const headers = rows[0].map((h) => h.trim())
  const colIdx = Object.fromEntries(headers.map((h, i) => [h, i]))
  const required = ['title', 'doi', 'authors', 'journal', 'year', 'month', 'volume_issue', 'pages']
  const missing = required.filter((c) => !(c in colIdx))
  if (missing.length) {
    console.error(`[lookup-missing-by-title] input missing columns: ${missing.join(', ')}`)
    process.exit(1)
  }

  let candidates = 0
  let matched = 0
  let unmatched = 0
  let errors = 0
  const out = [headers]

  for (let r = 1; r < rows.length; r++) {
    const row = [...rows[r]]
    while (row.length < headers.length) row.push('')

    const title = (row[colIdx.title] ?? '').trim()
    const doi = (row[colIdx.doi] ?? '').trim()
    if (!title || doi) { out.push(row); continue }
    candidates++

    let item
    try {
      item = await searchByTitle(title)
      await wait(RATE_DELAY_MS)
    } catch (err) {
      errors++
      console.warn(`  ! "${title.slice(0, 60)}" — ${err.message}`)
      out.push(row)
      continue
    }

    if (!item) {
      unmatched++
      console.warn(`  ? "${title.slice(0, 60)}" — no strict-title match`)
      out.push(row)
      continue
    }

    matched++
    const fillIfEmpty = (col, value) => {
      if (value == null) return
      const i = colIdx[col]
      if (!row[i] || !row[i].trim()) row[i] = String(value)
    }
    const { year, month } = dateFromCrossref(item)
    fillIfEmpty('doi', item.DOI)
    fillIfEmpty('authors', authorsFromCrossref(item))
    fillIfEmpty('journal', journalFromCrossref(item))
    fillIfEmpty('year', year)
    fillIfEmpty('month', month)
    fillIfEmpty('volume_issue', volumeIssueFromCrossref(item))
    fillIfEmpty('pages', item.page?.toString().trim() ?? null)
    if (colIdx.url != null && (!row[colIdx.url] || !row[colIdx.url].trim()) && item.DOI) {
      row[colIdx.url] = `https://doi.org/${item.DOI}`
    }
    console.log(`  ✓ ${item.DOI}  ←  "${title.slice(0, 60)}"`)
    out.push(row)
  }

  const csv = out.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(INPUT, csv)

  console.log('')
  console.log(`[lookup-missing-by-title] candidates: ${candidates}`)
  console.log(`  matched:   ${matched}`)
  console.log(`  unmatched: ${unmatched}`)
  console.log(`  errors:    ${errors}`)
  console.log(`  → ${INPUT}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
