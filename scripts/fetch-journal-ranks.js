// scripts/fetch-journal-ranks.js
//
// For every DOI in the Publications data, ranks the paper by total citations
// against all research papers published in the same journal and year, using
// OpenAlex. Papers in the top TOP_PCT percent earn the "Highly cited" badge on
// their publication card (see PublicationItem.astro); the hover shows the
// rank, e.g. "#3 of 194 papers in Nature Human Behaviour (2020)".
//
// "Research papers" = OpenAlex type article|review with ≥ MIN_REFS references.
// The reference floor drops news, editorials, and comments, which OpenAlex
// also types as "article" and which would otherwise inflate the denominator
// (Nature 2019: 3,397 items → 1,187 research papers).
//
// Output: templates/journal-ranks.json, keyed by lowercase DOI. Committed, and
// refreshed monthly as part of `npm run refresh-scholar` (not at build time:
// ~3 API calls per paper is too slow for every deploy).

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PUBS_IN = resolve('src/data/publications.json')
const OUT = resolve('templates/journal-ranks.json')
const MAILTO = 'sjdavis@stanford.edu'
const MIN_REFS = 10
const MIN_COHORT = 20 // skip journal-years too small for a percentile to mean much
const TOP_PCT = 5

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path, params) {
  const qs = new URLSearchParams({ ...params, mailto: MAILTO })
  const url = `https://api.openalex.org/${path}?${qs}`
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) return null
      if (res.ok) return await res.json()
    } catch {}
    await wait(1500 * (i + 1))
  }
  throw new Error(`OpenAlex request failed: ${url}`)
}

const pubs = JSON.parse(await readFile(PUBS_IN, 'utf8'))
const dois = [...new Set(pubs.filter((p) => p.doi && !p.ignore).map((p) => p.doi.trim().toLowerCase()))]

const out = {}
let ranked = 0
for (const doi of dois) {
  const w = await get(`works/doi:${encodeURIComponent(doi)}`, {
    select: 'id,publication_year,cited_by_count,primary_location,type,referenced_works_count',
  })
  const src = w?.primary_location?.source
  if (!w || !src?.id || src.type !== 'journal') continue
  const sid = src.id.split('/').pop()
  const year = w.publication_year
  const cites = w.cited_by_count
  const cohort = `primary_location.source.id:${sid},publication_year:${year},type:article|review,referenced_works_count:>${MIN_REFS - 1}`
  const n = (await get('works', { filter: cohort, per_page: 1 }))?.meta?.count ?? 0
  const above = (await get('works', { filter: `${cohort},cited_by_count:>${cites}`, per_page: 1 }))?.meta?.count ?? 0
  if (n < MIN_COHORT) continue
  const rank = above + 1
  out[doi] = {
    journal: src.display_name,
    year,
    cites,
    rank,
    n,
    pct: Math.round((10000 * rank) / n) / 100,
  }
  ranked++
  await wait(100)
}

const meta = { as_of: new Date().toISOString().slice(0, 10), min_refs: MIN_REFS, min_cohort: MIN_COHORT, top_pct: TOP_PCT }
await writeFile(OUT, JSON.stringify({ meta, ranks: out }, null, 2) + '\n')
const top = Object.values(out).filter((r) => r.pct <= TOP_PCT).length
console.log(`[journal-ranks] ranked ${ranked}/${dois.length} DOIs; ${top} in the top ${TOP_PCT}% → ${OUT}`)
