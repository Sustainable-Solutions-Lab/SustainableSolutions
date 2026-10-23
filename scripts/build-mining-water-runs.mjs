// scripts/build-mining-water-runs.mjs
//
// Second data step for /tools/mining-water: the model runs behind the
// paper's Figure 2a and Extended Data Fig. 6, shared by Pablo Busch for the
// site (they are not in the public replication repo). Run it after
// build-mining-water.mjs, which writes the basin×mineral cells this counts
// into (and the local, gitignored deposit-to-cell map).
//
// Input, one folder per run with Metrics and per-deposit files:
//   DemandScenario/<scen>/{Base,Water_EpsNN}{,_Metrics}.csv
//       31 demand levels (the three IEA cases and the variants between and
//       around them), each solved at 14 cost ceilings.
//   BioDScenario/<SPS|APS|NZE>/<FIxx|none>/…
//       Each IEA demand case with basins above a fish-index threshold closed
//       to mining, at the same cost ceilings.
//   FW_FISH_Basin_FishIndex_Global.csv
//       Fish biodiversity index per AWARE basin, 0–100.
//
// What is published. Deposit data are licensed from S&P Global for summary
// statistics only, so nothing per deposit is kept. For each run: how many
// deposits in each basin×mineral cell produce anything 2025–2050, and, per
// mineral, how many produce, are added and are dropped against the run's
// reference. No IDs, tonnages, capacities or timing.
//
// Output: public/tools/mining-water/runs.json
//
// Usage:  MINING_WATER_RESULTS=<Results-Website folder> node scripts/build-mining-water-runs.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = process.env.MINING_WATER_RESULTS
if (!SRC || !existsSync(SRC)) {
  console.error('Set MINING_WATER_RESULTS to the Results-Website folder.')
  process.exit(1)
}
const OUT = resolve('public/tools/mining-water')
const REF = process.env.MINING_WATER_REPO_REF ?? 'main'

// Cost ceilings, as the paper labels them, and the run file for each.
const STEPS = ['0%', '0.5%', '1%', '2%', '3%', '4%', '5%', '6%', '8%', '10%', '12%', '15%', '20%', '25%']
const FILES = ['Base', 'Water_Eps00', 'Water_Eps01', 'Water_Eps02', 'Water_Eps03', 'Water_Eps04', 'Water_Eps05',
  'Water_Eps06', 'Water_Eps08', 'Water_Eps10', 'Water_Eps12', 'Water_Eps15', 'Water_Eps20', 'Water_Eps25']
const NAMED = { SPS: 'Current policies', APS: 'Pledges', NZE: 'Net-zero' }
// Fish-protection thresholds offered in the tool; "none" protects nothing.
const FISH = [['none', null], ['FI95', 95], ['FI90', 90], ['FI80', 80], ['FI70', 70], ['FI60', 60], ['FI50', 50]]

const lines = async (p) => (await readFile(p, 'utf8')).trim().split(/\r?\n/)

// Metrics: Parameter,Value,Units. Million USD and million m³ -> billions.
async function metrics(dir, file) {
  const m = {}
  for (const l of (await lines(join(dir, `${file}_Metrics.csv`))).slice(1)) {
    const [k, v] = l.split(',')
    m[k] = Number(v)
  }
  const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d
  return [r(m.Cost / 1e3), r(m['Water impact'] / 1e3), r(m.Water / 1e3), r(m['Slack Cobalt'], 3)]
}

// Per-deposit file: Name,ID,t,ktons_extracted,… Names may hold commas, so
// read from the right. Returns the set of deposit IDs that ever produce.
async function producing(dir, file) {
  const on = new Set()
  for (const l of (await lines(join(dir, `${file}.csv`))).slice(1)) {
    const c = l.split(',')
    if (Number(c[c.length - 4]) > 1e-6) on.add(Number(c[c.length - 6]))
  }
  return on
}

// Deposits producing in each cell, one byte per cell (no cell holds 255).
function cellCounts(cellOf, nCells, on) {
  const b = new Uint8Array(nCells)
  for (const id of on) if (cellOf[id] != null) b[cellOf[id]]++
  return Buffer.from(b).toString('base64')
}

// Per mineral and for all four: deposits producing, added and dropped
// against the reference run.
function tally(mineralOf, on, ref) {
  const out = { All: [0, 0, 0] }
  for (const m of new Set(Object.values(mineralOf))) out[m] = [0, 0, 0]
  for (const [id, m] of Object.entries(mineralOf)) {
    const a = on.has(Number(id)), b = ref.has(Number(id))
    for (const t of [out.All, out[m]]) { if (a) t[0]++; if (a && !b) t[1]++; if (b && !a) t[2]++ }
  }
  return out
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/)
  const cols = head.split(',').map((s) => s.replace(/"/g, ''))
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v.replace(/"/g, '')])))
}

async function main() {
  const { minerals, cells } = JSON.parse(await readFile(join(OUT, 'basin-deposits.json'), 'utf8'))
  const cellOf = JSON.parse(await readFile(resolve('.cache/mining-water/deposit-cells.json'), 'utf8'))
  const mineralOf = Object.fromEntries(Object.entries(cellOf).map(([id, k]) => [id, minerals[cells[k][1]]]))
  const count = (on) => cellCounts(cellOf, cells.length, on)

  // Cumulative 2025–2050 demand per run, Mt of metal, from the public repo.
  const dem = parseCsv(await (await fetch(
    `https://raw.githubusercontent.com/pmbusch/sustainable-mining/${REF}/Parameters/IEA_Demand.csv`)).text())
  const demandMt = {}
  for (const r of dem) demandMt[r.Scenario] = (demandMt[r.Scenario] ?? 0) +
    ['Copper', 'Nickel', 'Cobalt', 'Lithium'].reduce((a, m) => a + Number(r[m]), 0) / 1e3

  // Demand sweep: the frontier at every demand level, for the shaded bands.
  const sweep = []
  const producingBy = {}
  const statsBy = {}
  for (const scen of (await import('node:fs')).readdirSync(join(SRC, 'DemandScenario'))) {
    const dir = join(SRC, 'DemandScenario', scen)
    if (!existsSync(join(dir, 'Base_Metrics.csv'))) continue
    const pts = []
    for (const f of FILES) pts.push((await metrics(dir, f)).slice(0, 2))
    sweep.push({ name: scen, demand: Math.round(demandMt[scen] * 10) / 10, pts })
    if (NAMED[scen]) {
      const runs = []
      for (const f of FILES) runs.push(await producing(dir, f))
      producingBy[NAMED[scen]] = runs.map(count)
      statsBy[NAMED[scen]] = runs.map((on) => tally(mineralOf, on, runs[0]))
    }
  }
  sweep.sort((a, b) => a.demand - b.demand)

  // Fish protection, for each IEA demand case.
  const fish = { levels: FISH.map(([, fi]) => fi), byScenario: {} }
  for (const [scen, name] of Object.entries(NAMED)) {
    const series = {}, prod = {}, stats = {}
    let ref = null // no protection, least cost
    for (const [key, fi] of FISH) {
      const dir = join(SRC, 'BioDScenario', scen, key)
      const k = fi == null ? 'none' : String(fi)
      series[k] = []
      prod[k] = []
      stats[k] = []
      for (let i = 0; i < FILES.length; i++) {
        const [cost, water, consumed, unmetCo] = await metrics(dir, FILES[i])
        series[k].push({ step: STEPS[i], cost, water, consumed, unmetCo })
        const on = await producing(dir, FILES[i])
        ref ??= on
        prod[k].push(count(on))
        stats[k].push(tally(mineralOf, on, ref).All)
      }
    }
    fish.byScenario[name] = { series, producing: prod, stats }
  }

  // Basin fish index, only where it reaches the lowest threshold offered.
  const fishIndex = {}
  const minFi = Math.min(...FISH.map(([, f]) => f ?? 100))
  for (const l of (await lines(join(SRC, 'FW_FISH_Basin_FishIndex_Global.csv'))).slice(1)) {
    const [b, f] = l.split(',').map(Number)
    if (f > minFi) fishIndex[b] = Math.round(f * 10) / 10
  }

  const out = { steps: STEPS, sweep, producing: producingBy, stats: statsBy, fish, fishIndex }
  await writeFile(join(OUT, 'runs.json'), JSON.stringify(out))
  console.log(`runs.json: ${sweep.length} demand levels, ${Object.keys(producingBy).length} named, ` +
    `${fish.levels.length} fish levels × ${Object.keys(fish.byScenario).length} scenarios, ${Object.keys(fishIndex).length} fish-rich basins, ${cells.length} cells`)
}

main().catch((e) => { console.error(e); process.exit(1) })
