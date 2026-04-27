// scripts/scholar-to-csv.js
//
// Generate a paste-into-sheet CSV that merges fresh Google Scholar data with
// the user's manual columns from the live Publications sheet. Auto-fields
// (authors, title, journal, year, doi, abstract, …) are overwritten from
// Scholar; manual fields (featured, ignore, brief_url, ppt_url, press_url,
// image_filename, pdf_url, code_url, lab_authors) are preserved by DOI key.
// Themes are auto-guessed if the sheet cell is blank, preserved if not.
//
// Output row order matches the live sheet's row order (so the user's sort is
// preserved through paste-wholesale). New Scholar papers not yet in the sheet
// are appended at the end. If no live sheet is available, output is in
// Scholar's display order.
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

// Column order — abstract is last (it's bulky and pushes other columns
// off-screen in the sheet). Manual flags (featured, ignore) and themes come
// after the auto-managed bibliographic fields, before the URLs.
const HEADERS = [
  'authors', 'title', 'journal', 'year', 'month', 'volume_issue', 'pages',
  'doi', 'url',
  'featured', 'ignore', 'themes', 'lab_authors',
  'pdf_url', 'code_url', 'brief_url', 'ppt_url', 'press_url', 'image_filename',
  'abstract',
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
function isTruncationToken(s) {
  if (!s) return true
  const t = s.trim().toLowerCase().replace(/[.,]/g, '')
  return t === '' || t === '...' || t === 'et al' || t === 'al' || t === 'et'
}

function reformatAuthor(name) {
  const trimmed = name.trim()
  if (!trimmed || isTruncationToken(trimmed)) return null
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return null
  if (tokens.some(isTruncationToken)) return null

  if (/^[A-Z]+$/.test(tokens[0])) {
    const initials = tokens[0]
    const last = tokens.slice(1).join(' ')
    return `${last}, ${initials.split('').join('.')}.`
  }

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
}

// Themes that used to be auto-guessed but have been retired. Stripped from
// existing sheet rows on the next refresh so they disappear from the site.
const RETIRED_THEMES = new Set(['solutions'])

function cleanThemes(s) {
  if (!s) return ''
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && !RETIRED_THEMES.has(x))
    .join(',')
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

// ── Auto-row builder (Scholar fields only) ──
function buildAuto(masterEntry, details, rawByNorm) {
  const m = masterEntry
  const d = details[m.id]
  if (d) {
    const { year, month } = parseDate(d.publication_date)
    const url = d.journal_link ?? (d.doi ? `https://doi.org/${d.doi}` : '')
    return {
      _source: 'detail',
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
      _source: 'raw',
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
    _source: 'minimal',
    authors: '',
    title: fixSubscripts(m.title),
    journal: '', year: '', month: '', volume_issue: '', pages: '',
    doi: '', url: '', abstract: '',
  }
}

// ── Merge auto + manual into a single output row ──
function buildMergedRow(auto, manual, counts) {
  let themes = cleanThemes((manual?.themes || '').trim())
  if (!themes) {
    themes = guessThemes(`${auto.title} ${auto.abstract}`)
    if (themes) counts.autoTheme++
  }
  // Sheet always wins. Scholar only fills cells that are blank in the sheet.
  // The mental model: the sheet is the source of truth; Scholar populates
  // what the user hasn't touched yet. To force a re-fill from Scholar for a
  // specific cell, clear it in the sheet.
  const preferSheet = (autoValue, manualValue) => {
    if (manualValue !== '' && manualValue != null) {
      const s = String(manualValue).trim()
      if (s !== '') return manualValue
    }
    return autoValue ?? ''
  }
  return {
    authors: preferSheet(auto.authors, manual?.authors),
    title: preferSheet(auto.title, manual?.title),
    journal: preferSheet(auto.journal, manual?.journal),
    year: preferSheet(auto.year, manual?.year),
    month: preferSheet(auto.month, manual?.month),
    volume_issue: preferSheet(auto.volume_issue, manual?.volume_issue),
    pages: preferSheet(auto.pages, manual?.pages),
    doi: preferSheet(auto.doi, manual?.doi),
    url: preferSheet(auto.url, manual?.url),
    featured: manual?.featured || 'FALSE',
    ignore: manual?.ignore || '',
    themes,
    lab_authors: (manual?.lab_authors || '').trim() || 'steve-davis',
    pdf_url: manual?.pdf_url || '',
    code_url: manual?.code_url || '',
    brief_url: manual?.brief_url || '',
    ppt_url: manual?.ppt_url || '',
    press_url: manual?.press_url || '',
    image_filename: manual?.image_filename || '',
    abstract: preferSheet(auto.abstract, manual?.abstract),
  }
}

// ── Sheet-only row passthrough (paper in sheet, no Scholar match) ──
function buildPassthroughRow(sheetRow) {
  return {
    authors: sheetRow.authors || '',
    title: sheetRow.title || '',
    journal: sheetRow.journal || '',
    year: sheetRow.year || '',
    month: sheetRow.month || '',
    volume_issue: sheetRow.volume_issue || '',
    pages: sheetRow.pages || '',
    doi: sheetRow.doi || '',
    url: sheetRow.url || '',
    featured: sheetRow.featured || 'FALSE',
    ignore: sheetRow.ignore || '',
    themes: cleanThemes(sheetRow.themes || ''),
    lab_authors: sheetRow.lab_authors || '',
    pdf_url: sheetRow.pdf_url || '',
    code_url: sheetRow.code_url || '',
    brief_url: sheetRow.brief_url || '',
    ppt_url: sheetRow.ppt_url || '',
    press_url: sheetRow.press_url || '',
    image_filename: sheetRow.image_filename || '',
    abstract: sheetRow.abstract || '',
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

  // Build all auto entries up front
  const autos = master.map((m) => buildAuto(m, details, rawByNorm))
  const autoByDoi = new Map()
  const autoByTitle = new Map()
  for (const a of autos) {
    if (a.doi) autoByDoi.set(a.doi.toLowerCase(), a)
    if (a.title) autoByTitle.set(normalizeTitle(a.title), a)
  }

  const sheetRows = await fetchSheet('SHEET_PUBLICATIONS_CSV')
  const counts = { detail: 0, raw: 0, minimal: 0, sheetOnly: 0, autoTheme: 0, newScholar: 0 }
  for (const a of autos) counts[a._source]++

  const out = []
  const usedAutos = new Set()

  if (sheetRows && sheetRows.length > 0) {
    console.log(`[scholar-to-csv] merging with ${sheetRows.length} sheet rows (preserving sheet order)`)
    // Iterate sheet in sheet order — preserves the user's chosen sort.
    for (const sheetRow of sheetRows) {
      if (!sheetRow.title?.trim() && !sheetRow.doi?.trim()) continue
      const doi = (sheetRow.doi || '').trim().toLowerCase()
      let auto = doi ? autoByDoi.get(doi) : null
      if (!auto && sheetRow.title) auto = autoByTitle.get(normalizeTitle(sheetRow.title))

      if (auto && !usedAutos.has(auto)) {
        usedAutos.add(auto)
        out.push(buildMergedRow(auto, sheetRow, counts))
      } else {
        // No Scholar match — preserve the sheet row as-is. (In-press papers,
        // book chapters, anything the user added manually.)
        counts.sheetOnly++
        out.push(buildPassthroughRow(sheetRow))
      }
    }
    // Append Scholar papers not yet in the sheet (newly published)
    for (const a of autos) {
      if (usedAutos.has(a)) continue
      counts.newScholar++
      out.push(buildMergedRow(a, null, counts))
    }
  } else {
    console.log('[scholar-to-csv] no sheet merge (SHEET_PUBLICATIONS_CSV not set or fetch failed)')
    for (const a of autos) out.push(buildMergedRow(a, null, counts))
  }

  const csvRows = [HEADERS, ...out.map((r) => HEADERS.map((h) => r[h]))]
  const csv = csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(CSV_OUT, csv)
  await writeFile(JSON_OUT, JSON.stringify(out, null, 2))

  console.log('')
  console.log(`[scholar-to-csv] wrote ${out.length} rows`)
  console.log(`  rich (from scholar-details):    ${counts.detail}`)
  console.log(`  raw  (from scholar-raw):        ${counts.raw}`)
  console.log(`  minimal (title only):           ${counts.minimal}`)
  console.log(`  new since last sheet refresh:   ${counts.newScholar}`)
  console.log(`  sheet-only (preserved as-is):   ${counts.sheetOnly}`)
  console.log(`  auto-guessed themes:            ${counts.autoTheme}`)
  console.log('')
  console.log(`  CSV:  ${CSV_OUT}`)
  console.log(`  JSON: ${JSON_OUT}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
