// scripts/migrate-themes-to-system-response.js
//
// One-shot migration that proposes values for two new columns on the
// Publications sheet:
//   system    — comma-separated of: energy, food, water, materials
//   response  — comma-separated of:
//                 mitigation, mitigation:trade, mitigation:corporate,
//                 mitigation:carbon-management,
//                 impacts, impacts:air-pollution, impacts:heat,
//                 impacts:flooding
//
// Maps existing `themes` tags to those values:
//
//   energy        → system: energy
//   electricity   → system: energy
//   food          → system: food
//   land          → system: food
//   water         → system: water
//   materials     → system: materials
//
//   emissions          → response: mitigation
//   trade              → response: mitigation:trade
//   corporate          → response: mitigation:corporate
//   carbon management  → response: mitigation:carbon-management
//   impacts            → response: impacts
//   fire               → response: impacts
//   air pollution      → response: impacts:air-pollution
//   heat               → response: impacts:heat
//   flooding           → response: impacts:flooding
//
// Output: templates/publications-with-axes.csv — full publications data
// with two new columns appended at the end. Paste into the sheet to seed,
// then review & correct ambiguous rows. Existing `themes` column is
// preserved untouched (kept as free-form catch-all).

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

const OUT = resolve('templates/publications-with-axes.csv')
const LOCAL_CSV = resolve('templates/publications-from-scholar.csv')

function parseCsv(text) {
  const rows = []
  let row = []
  let f = ''
  let q = false
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

const SYSTEM_MAP = {
  'energy': 'energy',
  'electricity': 'energy',
  'food': 'food',
  'land': 'food',
  'water': 'water',
  'materials': 'materials',
}

const RESPONSE_MAP = {
  'emissions': 'mitigation',
  'trade': 'mitigation:trade',
  'corporate': 'mitigation:corporate',
  'carbon management': 'mitigation:carbon-management',
  'impacts': 'impacts',
  'fire': 'impacts',
  'air pollution': 'impacts:air-pollution',
  'heat': 'impacts:heat',
  'flooding': 'impacts:flooding',
}

function derive(themesCell) {
  const themeArr = (themesCell || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const systems = new Set()
  const responses = new Set()
  for (const t of themeArr) {
    if (SYSTEM_MAP[t]) systems.add(SYSTEM_MAP[t])
    if (RESPONSE_MAP[t]) responses.add(RESPONSE_MAP[t])
  }
  return {
    system: [...systems].join(','),
    response: [...responses].join(','),
  }
}

async function fetchInput() {
  const url = process.env.SHEET_PUBLICATIONS_CSV
  if (url) {
    console.log(`[migrate-axes] fetching live sheet`)
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`sheet fetch failed: ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    return new TextDecoder('utf-8').decode(buf)
  }
  console.log(`[migrate-axes] using local ${LOCAL_CSV}`)
  return readFile(LOCAL_CSV, 'utf8')
}

async function main() {
  const text = await fetchInput()
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('no data rows')

  const headers = rows[0].map((h) => h.trim())
  const themesIdx = headers.indexOf('themes')
  if (themesIdx < 0) throw new Error('input missing `themes` column')

  // Append two new columns. If the source already has them (re-running
  // the migration), refresh in place.
  let sysIdx = headers.indexOf('system')
  let respIdx = headers.indexOf('response')
  if (sysIdx < 0) { headers.push('system'); sysIdx = headers.length - 1 }
  if (respIdx < 0) { headers.push('response'); respIdx = headers.length - 1 }

  const out = [headers]
  let countedSystem = 0
  let countedResponse = 0
  for (let i = 1; i < rows.length; i++) {
    const row = [...rows[i]]
    while (row.length < headers.length) row.push('')
    const themes = row[themesIdx] || ''
    const existingSys = (row[sysIdx] || '').trim()
    const existingResp = (row[respIdx] || '').trim()
    const { system, response } = derive(themes)
    // Don't clobber values the user has already curated.
    row[sysIdx] = existingSys || system
    row[respIdx] = existingResp || response
    if (row[sysIdx]) countedSystem++
    if (row[respIdx]) countedResponse++
    out.push(row)
  }

  const csv = out.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  await writeFile(OUT, csv)

  console.log('')
  console.log(`[migrate-axes] wrote ${out.length - 1} rows → ${OUT}`)
  console.log(`  rows with non-empty system:   ${countedSystem}`)
  console.log(`  rows with non-empty response: ${countedResponse}`)
  console.log('')
  console.log('  Next: paste this CSV into the Publications sheet (it has')
  console.log('  two new columns appended). Review and correct ambiguous')
  console.log('  rows in the sheet — the migration only handles direct')
  console.log('  tag mappings; nuance and corrections are up to you.')
}

main().catch((err) => { console.error(err); process.exit(1) })
