// scripts/scrape-scholar.js
//
// Walks Steve's Google Scholar profile and saves rich per-paper metadata.
//
// Two stages, each writes a JSON file:
//   1. master  → templates/scholar-master.json  (paper IDs + titles, in order)
//   2. details → templates/scholar-details.json (full authors, abstract, DOI,
//                                                journal link, citation chart, etc.)
//
// The details stage is resumable: it skips IDs already present in the JSON,
// writes after every paper, and reports progress.
//
// Usage:
//   node scripts/scrape-scholar.js master
//   node scripts/scrape-scholar.js details
//   node scripts/scrape-scholar.js              (runs both)
//
// Polite: 3 s delay between detail-page fetches, browser-style User-Agent.
// Stops cleanly if Scholar starts serving CAPTCHA pages.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const USER_ID = 'QP6TMv8AAAAJ'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const DELAY_MS = 3000

const MASTER_URL = `https://scholar.google.com/citations?user=${USER_ID}&hl=en&cstart=0&pagesize=100`
const detailUrl = (paperId) =>
  `https://scholar.google.com/citations?view_op=view_citation&hl=en&user=${USER_ID}&citation_for_view=${USER_ID}:${paperId}`

const MASTER_OUT = resolve('templates/scholar-master.json')
const DETAILS_OUT = resolve('templates/scholar-details.json')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Fetcher ────────────────────────────────────────────────────────────────
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const html = await res.text()
  if (/please show you'?re not a robot|recaptcha|gs_captcha/i.test(html)) {
    throw new Error('CAPTCHA — Scholar is throttling. Wait a while and retry.')
  }
  return html
}

// ── HTML helpers ────────────────────────────────────────────────────────────
function decodeHtml(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
}

function stripTags(s) {
  return decodeHtml(String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

// ── Master extraction ──────────────────────────────────────────────────────
function extractMaster(html) {
  // Each paper row has an anchor:
  //   <a href="/citations?view_op=view_citation&hl=en&user=...&citation_for_view=USER:PAPER" class="gsc_a_at">TITLE</a>
  const re =
    /<a[^>]+href="[^"]*citation_for_view=[A-Za-z0-9]+:([A-Za-z0-9_-]+)[^"]*"[^>]*class="gsc_a_at"[^>]*>([^<]+)<\/a>/g
  const out = []
  const seen = new Set()
  let m
  while ((m = re.exec(html)) !== null) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, title: decodeHtml(m[2]) })
  }
  return out
}

// ── Detail extraction ──────────────────────────────────────────────────────
function extractDetail(html, master) {
  // Field rows: <div class="gs_scl"><div class="gsc_oci_field">KEY</div><div class="gsc_oci_value">VAL</div></div>
  const fields = {}
  const fieldRe =
    /<div class="gs_scl">\s*<div class="gsc_oci_field">([^<]+)<\/div>\s*<div class="gsc_oci_value"[^>]*>([\s\S]+?)<\/div>\s*<\/div>/g
  let f
  while ((f = fieldRe.exec(html)) !== null) {
    fields[decodeHtml(f[1].trim())] = f[2]
  }

  // Journal link (which often contains the DOI for many publishers)
  let journalLink = null
  const linkM = html.match(/<a id="gsc_oci_title_link" href="([^"]+)"/)
  if (linkM) journalLink = decodeHtml(linkM[1])

  // DOI: extract from journal link or anywhere on the page.
  // Pattern: 10.<4-9 digits>/<rest until quote, space, or angle bracket>
  let doi = null
  const doiRe = /10\.\d{4,9}\/[^\s"'<>?#]+/g
  const doiCandidates = []
  let dm
  while ((dm = doiRe.exec(html)) !== null) {
    let candidate = dm[0].replace(/[.,;:)]+$/, '')
    if (!doiCandidates.includes(candidate)) doiCandidates.push(candidate)
  }
  // First candidate is usually the paper's own DOI
  if (doiCandidates.length > 0) doi = doiCandidates[0]

  // Citation chart: years from gsc_oci_g_t spans, counts from gsc_oci_g_al spans (in order)
  const yearRe = /<span class="gsc_oci_g_t"[^>]*>(\d+)<\/span>/g
  const countRe = /<span class="gsc_oci_g_al"[^>]*>(\d+)<\/span>/g
  const years = []
  const counts = []
  let y
  while ((y = yearRe.exec(html)) !== null) years.push(parseInt(y[1], 10))
  let c
  while ((c = countRe.exec(html)) !== null) counts.push(parseInt(c[1], 10))
  const citations = years.map((yr, i) => ({ year: yr, count: counts[i] ?? 0 }))

  // Total citations count
  let totalCitations = null
  const totalM = (fields['Total citations'] ?? '').match(/Cited by\s*(\d+)/)
  if (totalM) totalCitations = parseInt(totalM[1], 10)

  return {
    id: master.id,
    title: master.title,
    authors: stripTags(fields['Authors']),
    publication_date: stripTags(fields['Publication date']),
    journal: stripTags(fields['Journal'] ?? fields['Source'] ?? fields['Conference'] ?? ''),
    volume: stripTags(fields['Volume']),
    issue: stripTags(fields['Issue']),
    pages: stripTags(fields['Pages']),
    publisher: stripTags(fields['Publisher']),
    abstract: stripTags(fields['Description']),
    journal_link: journalLink,
    doi,
    total_citations: totalCitations,
    citations,
  }
}

// ── Stages ─────────────────────────────────────────────────────────────────
async function runMaster() {
  const html = await fetchHtml(MASTER_URL)
  const papers = extractMaster(html)
  if (papers.length === 0) throw new Error('No papers found on master profile.')
  await writeFile(MASTER_OUT, JSON.stringify(papers, null, 2))
  console.log(`[scrape-scholar] master: wrote ${papers.length} papers → ${MASTER_OUT}`)
}

async function runDetails() {
  const masterText = await readFile(MASTER_OUT, 'utf8')
  const master = JSON.parse(masterText)

  let details = {}
  try {
    details = JSON.parse(await readFile(DETAILS_OUT, 'utf8'))
  } catch {}

  const todo = master.filter((p) => !details[p.id])
  console.log(
    `[scrape-scholar] details: ${todo.length} papers to fetch (${master.length - todo.length} already cached)`,
  )

  let n = 0
  for (const p of todo) {
    n++
    try {
      const html = await fetchHtml(detailUrl(p.id))
      details[p.id] = extractDetail(html, p)
      await writeFile(DETAILS_OUT, JSON.stringify(details, null, 2))
      const t = (details[p.id].title ?? '').slice(0, 60)
      console.log(`[scrape-scholar]  ✓ ${n}/${todo.length}  ${p.id}  ${t}`)
    } catch (err) {
      console.warn(`[scrape-scholar]  ✗ ${n}/${todo.length}  ${p.id}  ${err.message}`)
      // Stop on CAPTCHA — don't burn through retries
      if (/CAPTCHA/.test(err.message)) {
        console.warn('[scrape-scholar] aborting; rerun later to resume.')
        return
      }
    }
    if (n < todo.length) await wait(DELAY_MS)
  }
  console.log('[scrape-scholar] details: complete.')
}

// ── Entry ──────────────────────────────────────────────────────────────────
const action = process.argv[2] ?? 'all'

try {
  if (action === 'master' || action === 'all') await runMaster()
  if (action === 'details' || action === 'all') await runDetails()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
