// scripts/generate-summaries.js
//
// For every row in templates/publications-from-scholar.csv that has an
// abstract but no summary, call the Anthropic API to generate a one-sentence
// summary. Writes back in place. Idempotent — re-runs skip rows that already
// have a summary.
//
// Requires ANTHROPIC_API_KEY in .env. Run with:
//   node scripts/generate-summaries.js
//
// Flags (env vars):
//   SUMMARY_MODEL    — defaults to 'claude-haiku-4-5' (fast, cheap)
//   SUMMARY_LIMIT    — max rows to process per run (default: all)
//   SUMMARY_REGEN=1  — overwrite existing summaries instead of skipping

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const INPUT = resolve('templates/publications-from-scholar.csv')
const API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.SUMMARY_MODEL || 'claude-haiku-4-5'
const LIMIT = parseInt(process.env.SUMMARY_LIMIT || '0', 10) || Infinity
const REGEN = process.env.SUMMARY_REGEN === '1'

if (!API_KEY) {
  console.error('[generate-summaries] ANTHROPIC_API_KEY not set in .env or env')
  process.exit(1)
}

// CSV parse / serialize (matches scholar-to-csv.js)
function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ }
      else if (c === '"') q = false
      else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f); rows.push(row); row = []; f = ''
    } else f += c
  }
  if (f.length > 0 || row.length > 0) { row.push(f); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}
function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

const SYSTEM = `You write one-sentence summaries of academic papers for the Sustainable Solutions Lab website (https://sustainablesolutions.stanford.edu).

Style:
- One sentence, ~15-25 words.
- Lead with the finding, not the question.
- Plain language, accessible to a non-expert. Avoid jargon when there's a clearer word.
- Active voice. Sentence case (no Title Case).
- Real Unicode units: 1.5 °C, CO₂, en-dash for ranges (2020–2050).
- No hype words: avoid "unlock", "leverage", "harness", "empower", "groundbreaking", "novel", "first-of-its-kind".
- No emoji. No exclamation marks.
- Don't restate the title. Add new information.
- Output ONLY the sentence. No quotes, no preamble, no markdown.`

async function summarize(title, journal, abstract) {
  const userMsg = `Title: ${title}
Journal: ${journal}

Abstract:
${abstract}

Write a one-sentence summary (15-25 words). Output the sentence only.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  const text = json.content?.[0]?.text?.trim() ?? ''
  // Strip any wrapping quotes the model might add
  return text.replace(/^["“]|["”]$/g, '').trim()
}

async function main() {
  const text = await readFile(INPUT, 'utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) {
    console.error(`[generate-summaries] no rows in ${INPUT}`)
    process.exit(1)
  }
  const headers = rows[0].map((h) => h.trim())
  const colIdx = Object.fromEntries(headers.map((h, i) => [h, i]))
  for (const c of ['title', 'journal', 'abstract', 'summary']) {
    if (!(c in colIdx)) {
      console.error(`[generate-summaries] missing required column: ${c}`)
      process.exit(1)
    }
  }

  const out = [headers]
  let candidates = 0; let generated = 0; let skipped = 0; let errors = 0

  for (let i = 1; i < rows.length; i++) {
    const row = [...rows[i]]
    while (row.length < headers.length) row.push('')
    const title = (row[colIdx.title] || '').trim()
    const journal = (row[colIdx.journal] || '').trim()
    const abstract = (row[colIdx.abstract] || '').trim()
    const summary = (row[colIdx.summary] || '').trim()

    if (!title || !abstract || abstract.length < 100) {
      out.push(row)
      continue
    }
    if (summary && !REGEN) {
      skipped++
      out.push(row)
      continue
    }
    candidates++
    if (generated >= LIMIT) {
      out.push(row)
      continue
    }
    try {
      const s = await summarize(title, journal, abstract)
      row[colIdx.summary] = s
      generated++
      console.log(`  ✓ ${title.slice(0, 60)}\n    → ${s}`)
    } catch (e) {
      errors++
      console.warn(`  ! ${title.slice(0, 60)} — ${e.message}`)
    }
    out.push(row)
  }

  const csv = out.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(INPUT, csv)

  console.log('')
  console.log(`[generate-summaries] candidates: ${candidates}`)
  console.log(`  generated: ${generated}`)
  console.log(`  skipped (already had summary): ${skipped}`)
  console.log(`  errors:    ${errors}`)
  console.log(`  → ${INPUT}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
