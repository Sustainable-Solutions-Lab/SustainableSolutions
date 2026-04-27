// scripts/scholar-to-csv.js
//
// Generate a paste-into-sheet CSV that merges fresh Google Scholar data with
// the user's manual columns from the live Publications sheet. Auto-fields
// (authors, title, journal, year, doi, abstract, …) are overwritten from
// Scholar; manual fields (featured, brief_url, ppt_url, press_url,
// image_filename, pdf_url, code_url, lab_authors) are preserved by DOI key.
// Themes are auto-guessed if the sheet cell is blank, preserved if not.
//
// Inputs:
//   templates/scholar-master.json   — display-order paper list
//   templates/scholar-details.json  — per-paper rich detail (authors, abstract…)
//   templates/scholar-raw.json      — fallback truncated-author master scrape
//   SHEET_PUBLICATIONS_CSV (env)    — optional; live published sheet for merge
//
// Outputs:
//   templates/publications-from-scholar.csv   — paste this into the sheet
//   templates/publications-from-scholar.json  — typed objects, for inspection
//
// "et al." is never emitted — the reformatter drops truncation tokens. Papers
// without detail records will show only their (truncated) Scholar master
// authors until a successful detail-page rescrape fills them in.

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Tiny .env loader (no dependency). Skips silently if file is missing. ──
function loadDotenv() {
  const envPath = resolve('.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  }
}
loadDotenv()

// ── Paths ──
const MASTER_IN = resolve('templates/scholar-master.json')
const DETAILS_IN = resolve('templates/scholar-details.json')
const RAW_IN = resolve('templates/scholar-raw.json')
const CSV_OUT = resolve('templates/publications-from-scholar.csv')
const JSON_OUT = resolve('templates/publications-from-scholar.json')

const HEADERS = [
  'authors', 'title', 'journal', 'year', 'month', 'volume_issue', 'pages',
  'doi', 'url', 'pdf_url', 'code_url', 'themes', 'lab_authors',
  'featured', 'press_url', 'abstract', 'image_filename', 'brief_url', 'ppt_url',
]

// ── RFC-4180-ish CSV parse (matches scripts/fetch-sheets.js) ──
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { q = false }
      else { field += c }
    } else {
      if (c === '"') q = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else { field += c }
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function rowsToObjects(rows) {
  const [header, ...data] = rows
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])))
}

// ── Subscript fix (Scholar separates "CO" + <span>2</span> with a space). ──
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
// Output: "Last, First M." Drops "et al." / "..." tokens entirely (the user
// wants every author shown — partial lists are better than fake completion).
//
// Inputs handled:
//   "Steven J. Davis"  → "Davis, Steven J."     (full-name form)
//   "SJ Davis"         → "Davis, S.J."          (initials-first form)
//   "et al."           → null (dropped)
//   "..."              → null (dropped)
//   garbage like "et al. Benoit G." → null (dropped — better than rendering
//   "al., Benoit G.")
function isTruncationToken(s) {
  if (!s) return true
  const t = s.trim().toLowerCase().replace(/[.,]/g, '')
  return t === '' || t === '...' || t === 'et al' || t === 'al' || t === 'et'
}

function reformatAuthor(name) {
  const trimmed = name.trim()
  if (!trimmed || isTruncationToken(trimmed)) return null
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return null  // bare "Smith" with no given name — skip
  // Guard: any internal token that looks like "et" / "al." poisons the segment
  if (tokens.some(isTruncationToken)) return null

  // Initials-first ("SJ Davis")
  if (/^[A-Z]+$/.test(tokens[0])) {
    const initials = tokens[0]
    const last = tokens.slice(1).join(' ')
    return `${last}, ${initials.split('').join('.')}.`
  }

  // Full-name form: keep first given as-is, compress later givens to initials.
  const last = tokens[tokens.length - 1]
  const givens = tokens.slice(0, -1)
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
    .filter(Boolean)
    .join('; ')
}

// ── Date / venue parsing ──
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

function normalizeTitle(t) {
  return (t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// ── Theme classifier ──
// Multi-label, keyword-based. A theme is included if it scores ≥ 2 keyword
// matches in the title+abstract. If nothing scores ≥ 2, the single
// highest-scoring theme (≥ 1) is used. Empty string if nothing matches.
const THEME_KEYWORDS = {
  'energy-systems': [
    /\bdecarboniz/i, /\bnet[-\s]?zero\b/i, /\brenewable/i, /\bsolar\b/i, /\bwind\b/i,
    /\bnuclear\b/i, /\bhydrogen\b/i, /\bbatter(y|ies)\b/i, /\benergy storage\b/i,
    /\belectric(ity|ification)?\b/i, /\bgrid\b/i, /\bpower (plant|sector|system)/i,
    /\bcoal\b/i, /\bnatural gas\b/i, /\btransport(ation)?\b/i, /\bvehicles?\b/i,
    /\bbuildings?\b/i, /\bheating\b/i, /\bfuels?\b/i, /\bsteel\b/i, /\bcement\b/i,
  ],
  'land-use': [
    /\bland[-\s]use\b/i, /\bagricultur/i, /\bcrops?\b/i, /\bfarm/i, /\bforest/i,
    /\bdeforestation\b/i, /\bbiomass\b/i, /\blivestock\b/i, /\birrigation\b/i,
    /\bsoil\b/i, /\byield\b/i, /\bfertilizer/i, /\bfood\b/i, /\bdiet/i,
    /\bnitrogen\b/i, /\bcattle\b/i,
  ],
  'trade': [
    /\btrade\b/i, /\bembodied\b/i, /\bconsumption[-\s]based\b/i, /\bsupply[-\s]?chain/i,
    /\bimport/i, /\bexport/i, /\bleakage\b/i, /\btransferred emissions/i,
    /\bscope[-\s]?3\b/i, /\bvalue[-\s]?chain/i, /\bproduction[-\s]based\b/i,
    /\binternational/i,
  ],
  'impacts': [
    /\bheatwave/i, /\bdrought/i, /\bflood/i, /\bmortality\b/i, /\b(public )?health\b/i,
    /\bextreme weather\b/i, /\bsea[-\s]level\b/i, /\bclimate (damage|risk)/i,
    /\bexposure\b/i, /\bvulnerab/i, /\bhazard\b/i, /\bdisaster\b/i,
    /\bwildfire/i, /\bsmoke\b/i, /\bair pollution\b/i, /\bparticulate\b/i,
    /\bpm\s?2\.5\b/i, /\bozone\b/i,
  ],
  'solutions': [
    /\bmitigation\b/i, /\bsequestration\b/i, /\bcarbon (capture|removal)/i,
    /\bnegative emissions\b/i, /\bbeccs\b/i, /\bcdr\b/i, /\bdac\b/i,
    /\boffset/i, /\babatement\b/i, /\bscenario\b/i, /\bpathway\b/i,
    /\bcarbon (sink|stock)/i, /\bafforestation\b/i, /\breforestation\b/i,
    /\bnature[-\s]based\b/i,
  ],
}

function guessThemes(text) {
  const blob = text || ''
  if (!blob.trim()) return ''
  const scores = {}
  for (const [theme, patterns] of Object.entries(THEME_KEYWORDS)) {
    let score = 0
    for (const p of patterns) if (p.test(blob)) score++
    if (score > 0) scores[theme] = score
  }
  const strong = Object.entries(scores).filter(([, s]) => s >= 2)
  if (strong.length > 0) return strong.map(([t]) => t).join(',')
  const ranked = Object.entries(scores).sort(([, a], [, b]) => b - a)
  return ranked[0]?.[0] ?? ''
}

// ── CSV serializer ──
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// ── Live sheet fetch (optional) ──
async function fetchSheet(envName) {
  const url = process.env[envName]
  if (!url) return null
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) {
      console.warn(`[scholar-to-csv] ${envName} returned ${res.status}; skipping merge`)
      return null
    }
    const buf = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder('utf-8').decode(buf)
    const rows = parseCsv(text)
    if (rows.length < 2) return null
    return rowsToObjects(rows)
  } catch (e) {
    console.warn(`[scholar-to-csv] ${envName} fetch error: ${e.message}; skipping merge`)
    return null
  }
}

// ── Main ──
async function main() {
  const master = JSON.parse(await readFile(MASTER_IN, 'utf8'))
  const details = JSON.parse(await readFile(DETAILS_IN, 'utf8'))
  let raw = []
  try { raw = JSON.parse(await readFile(RAW_IN, 'utf8')) } catch {}

  const rawByNorm = new Map()
  for (const r of raw) rawByNorm.set(normalizeTitle(r.title), r)

  // Live sheet → manual-field lookup
  const sheetRows = await fetchSheet('SHEET_PUBLICATIONS_CSV')
  const sheetByDoi = new Map()
  const sheetByTitle = new Map()
  const sheetSeen = new Set()
  if (sheetRows) {
    for (const r of sheetRows) {
      const doi = (r.doi || '').trim().toLowerCase()
      if (doi) sheetByDoi.set(doi, r)
      if (r.title) sheetByTitle.set(normalizeTitle(r.title), r)
    }
    console.log(`[scholar-to-csv] merging with ${sheetRows.length} sheet rows`)
  } else {
    console.log('[scholar-to-csv] no sheet merge (SHEET_PUBLICATIONS_CSV not set or fetch failed)')
  }

  function findSheetMatch(doi, title) {
    if (doi) {
      const m = sheetByDoi.get(doi.trim().toLowerCase())
      if (m) return m
    }
    if (title) {
      const m = sheetByTitle.get(normalizeTitle(title))
      if (m) return m
    }
    return null
  }

  function buildAuto(m) {
    const d = details[m.id]
    if (d) {
      const { year, month } = parseDate(d.publication_date)
      const url = d.journal_link ?? (d.doi ? `https://doi.org/${d.doi}` : '')
      return {
        source: 'detail',
        authors: reformatAuthors(d.authors),
        title: fixSubscripts(d.title || m.title),
        journal: d.journal || '',
        year: year || '',
        month: month || '',
        volume_issue: buildVolumeIssue(d.volume, d.issue),
        pages: d.pages || '',
        doi: d.doi || '',
        url,
        abstract: fixSubscripts(d.abstract || ''),
      }
    }
    const r = rawByNorm.get(normalizeTitle(m.title))
    if (r) {
      const v = parseVenue(r.venue)
      return {
        source: 'raw',
        authors: reformatAuthors(r.authors),
        title: fixSubscripts(r.title),
        journal: v.journal,
        year: r.year || '',
        month: '',
        volume_issue: v.volume_issue,
        pages: v.pages,
        doi: r.doi || '',
        url: r.doi ? `https://doi.org/${r.doi}` : '',
        abstract: '',
      }
    }
    return {
      source: 'minimal',
      authors: '',
      title: fixSubscripts(m.title),
      journal: '', year: '', month: '', volume_issue: '', pages: '',
      doi: '', url: '', abstract: '',
    }
  }

  const counts = { detail: 0, raw: 0, minimal: 0, sheetOnly: 0, autoTheme: 0 }
  const out = []

  for (const m of master) {
    const auto = buildAuto(m)
    counts[auto.source]++

    const manual = findSheetMatch(auto.doi, auto.title)
    if (manual) sheetSeen.add(manual)

    let themes = (manual?.themes || '').trim()
    if (!themes) {
      themes = guessThemes(`${auto.title} ${auto.abstract}`)
      if (themes) counts.autoTheme++
    }

    out.push({
      authors: auto.authors,
      title: auto.title,
      journal: auto.journal,
      year: auto.year,
      month: auto.month,
      volume_issue: auto.volume_issue,
      pages: auto.pages,
      doi: auto.doi,
      url: auto.url,
      pdf_url: manual?.pdf_url || '',
      code_url: manual?.code_url || '',
      themes,
      lab_authors: (manual?.lab_authors || '').trim() || 'steve-davis',
      featured: manual?.featured || 'FALSE',
      press_url: manual?.press_url || '',
      abstract: auto.abstract,
      image_filename: manual?.image_filename || '',
      brief_url: manual?.brief_url || '',
      ppt_url: manual?.ppt_url || '',
    })
  }

  // Append sheet rows that aren't in Scholar (in-press, book chapters, etc.)
  if (sheetRows) {
    for (const r of sheetRows) {
      if (sheetSeen.has(r)) continue
      if (!r.title?.trim()) continue
      counts.sheetOnly++
      out.push({
        authors: r.authors || '',
        title: r.title,
        journal: r.journal || '',
        year: r.year || '',
        month: r.month || '',
        volume_issue: r.volume_issue || '',
        pages: r.pages || '',
        doi: r.doi || '',
        url: r.url || '',
        pdf_url: r.pdf_url || '',
        code_url: r.code_url || '',
        themes: r.themes || '',
        lab_authors: r.lab_authors || '',
        featured: r.featured || 'FALSE',
        press_url: r.press_url || '',
        abstract: r.abstract || '',
        image_filename: r.image_filename || '',
        brief_url: r.brief_url || '',
        ppt_url: r.ppt_url || '',
      })
    }
  }

  const csvRows = [HEADERS, ...out.map((r) => HEADERS.map((h) => r[h]))]
  const csv = csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(CSV_OUT, csv)
  await writeFile(JSON_OUT, JSON.stringify(out, null, 2))

  console.log('')
  console.log(`[scholar-to-csv] wrote ${out.length} rows`)
  console.log(`  rich (from scholar-details):   ${counts.detail}`)
  console.log(`  raw  (from scholar-raw):       ${counts.raw}`)
  console.log(`  minimal (title only):          ${counts.minimal}`)
  console.log(`  sheet-only (preserved as-is):  ${counts.sheetOnly}`)
  console.log(`  auto-guessed themes:           ${counts.autoTheme}`)
  console.log('')
  console.log(`  CSV:  ${CSV_OUT}`)
  console.log(`  JSON: ${JSON_OUT}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
