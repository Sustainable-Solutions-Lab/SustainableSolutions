// scripts/fetch-external-pubs.js
//
// For every notable_pub_doi / recent_pub_doi in the People data that doesn't
// appear in Publications data, fetch metadata from Crossref and write a
// minimal Publication-shaped record to src/data/external-pubs.json. This
// lets person cards highlight pre-lab work (papers from before someone
// joined the group) without bloating the Publications sheet with non-lab
// papers.
//
// Caches results in templates/external-pubs.json so successive builds
// don't re-fetch unchanged DOIs.
//
// Run order: must run AFTER fetch-sheets.js (needs people.json and
// publications.json) and BEFORE astro build.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const PEOPLE_IN = resolve('src/data/people.json')
const PUBS_IN = resolve('src/data/publications.json')
const CACHE = resolve('templates/external-pubs.json')
const OUT = resolve('src/data/external-pubs.json')

const USER_AGENT = 'SustainableSolutionsLab/1.0 (mailto:sjdavis@stanford.edu)'
const RATE_DELAY_MS = 200

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── HTML entity decoder (Crossref returns titles with raw entities). ──
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™',
}
function decodeHtmlEntities(s) {
  if (!s) return s
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ent) => {
    if (ent[0] === '#') {
      const hex = ent[1] === 'x' || ent[1] === 'X'
      const code = hex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      if (Number.isFinite(code) && code > 0) return String.fromCodePoint(code)
      return match
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? match
  })
}

// ── Crossref response → Publication shape ──
function authorsFromCrossref(msg) {
  if (!msg.author?.length) return ''
  return msg.author
    .map((a) => {
      const last = (a.family ?? a.name ?? '').trim()
      if (!last) return null
      const givenStr = (a.given ?? '').trim()
      if (!givenStr) return last
      const tokens = givenStr.split(/[\s\-]+/).filter(Boolean)
      const first = tokens[0]
      const middles = tokens
        .slice(1)
        .map((t) => t.replace(/\./g, '')[0]?.toUpperCase())
        .filter(Boolean)
        .map((c) => c + '.')
        .join(' ')
      return `${last}, ${middles ? `${first} ${middles}` : first}`
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

async function fetchDoi(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Crossref ${doi}: ${res.status} ${res.statusText}`)
  const json = await res.json()
  return json.message
}

function pubRecord(msg) {
  const { year, month } = dateFromCrossref(msg)
  return {
    doi: msg.DOI,
    title: decodeHtmlEntities(msg.title?.[0] ?? ''),
    authors: decodeHtmlEntities(authorsFromCrossref(msg)),
    journal: decodeHtmlEntities(msg['container-title']?.[0] ?? ''),
    year,
    month,
    volume_issue: msg.volume
      ? msg.issue
        ? `${msg.volume}(${msg.issue})`
        : String(msg.volume)
      : null,
    pages: msg.page ?? null,
    url: msg.URL ?? `https://doi.org/${msg.DOI}`,
    total_citations: msg['is-referenced-by-count'] ?? null,
    pdf_url: null,
    code_url: null,
    themes: [],
    lab_authors: [],
    featured: false,
    press_url: null,
    abstract: null,
    image_filename: null,
    brief_url: null,
    ppt_url: null,
  }
}

async function main() {
  let people, pubs
  try {
    people = JSON.parse(await readFile(PEOPLE_IN, 'utf8'))
    pubs = JSON.parse(await readFile(PUBS_IN, 'utf8'))
  } catch (err) {
    console.error(`[fetch-external-pubs] missing input — run fetch-sheets.js first: ${err.message}`)
    process.exit(1)
  }

  // Collect every DOI mentioned in People notable/recent columns
  const wanted = new Set()
  for (const p of people) {
    for (const col of ['notable_pub_doi', 'recent_pub_doi']) {
      const v = p[col]
      if (typeof v === 'string' && v.trim()) wanted.add(v.trim().toLowerCase())
    }
  }

  // Subtract DOIs already in Publications
  const known = new Set()
  for (const p of pubs) if (p.doi) known.add(p.doi.toLowerCase())
  const externalDois = [...wanted].filter((d) => !known.has(d))

  // Load existing cache
  let cache = []
  try { cache = JSON.parse(await readFile(CACHE, 'utf8')) } catch {}
  const cacheByDoi = new Map(cache.map((c) => [c.doi.toLowerCase(), c]))

  // Fetch any DOIs missing from cache
  let fetched = 0
  let cached = 0
  let failed = 0
  const out = []
  for (const doi of externalDois) {
    const hit = cacheByDoi.get(doi)
    if (hit) {
      out.push(hit)
      cached++
      continue
    }
    try {
      const msg = await fetchDoi(doi)
      if (!msg) {
        console.warn(`  ? ${doi} — Crossref 404`)
        failed++
        continue
      }
      const rec = pubRecord(msg)
      out.push(rec)
      fetched++
      console.log(`  ✓ ${doi}  ←  ${rec.title.slice(0, 60)}`)
      await wait(RATE_DELAY_MS)
    } catch (err) {
      console.warn(`  ! ${doi} — ${err.message}`)
      failed++
    }
  }

  // Write outputs. Cache (committed) keeps everything; build output (gitignored)
  // mirrors what's actually referenced in current People data.
  await mkdir(resolve('src/data'), { recursive: true })
  await writeFile(OUT, JSON.stringify(out, null, 2))
  await writeFile(CACHE, JSON.stringify(out, null, 2))

  console.log('')
  console.log(`[fetch-external-pubs] external DOIs referenced: ${externalDois.length}`)
  console.log(`  cached:  ${cached}`)
  console.log(`  fetched: ${fetched}`)
  console.log(`  failed:  ${failed}`)
  console.log(`  → ${OUT}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
