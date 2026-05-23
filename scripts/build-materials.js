// scripts/build-materials.js
//
// Build-time data pipeline for /tools/materials.
// Reads pre-aggregated CSVs from Pablo Busch's material-intensity dataset
// (github.com/pmbusch/material-intensity) and writes compact JSON layers into
// public/tools/materials/ for the explorer to fetch as static assets.
//
// Source paths default to a local clone but can be overridden via env vars
// for CI builds. Per EXPLORER_TOOLS_PLAN.md §2, the lazy country layer
// (flows-countries.json) is built separately and uploaded to R2.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

// ── Sources ─────────────────────────────────────────────────────────────────
// PROCESSED: Pablo's "Processed data (results)" — DMC + GDP + historical pop.
// PARAMETERS: cloned repo's Parameters/ — in-use stocks snapshot.
const PROCESSED_DIR =
  process.env.MATERIALS_PROCESSED_DIR ??
  resolve(homedir(), 'Claude Projects/material-intensity/Processed data (results)');
const PARAMETERS_DIR =
  process.env.MATERIALS_PARAMETERS_DIR ??
  resolve(homedir(), 'Claude Projects/material-intensity/Parameters');

const OUT_DIR = resolve('public/tools/materials');

// ── 22 UNEP material categories → 6 high-level groups ───────────────────────
// Mirrors the grouping used in Busch et al.'s figures. The Sankey-style
// label is the leaf category; the group is a coarser legend bucket users can
// toggle the explorer between.
const MATERIAL_GROUPS = {
  biomass: {
    label: 'Biomass',
    members: [
      'Crops',
      'Crop Residues',
      'Grazed biomass and fodder crops',
      'Wood',
      'Wild catch and harvest',
      'Non-wild animal products',
    ],
  },
  fossil: {
    label: 'Fossil fuels',
    members: ['Coal', 'Natural Gas', 'Petroleum', 'Oil shale and tar sands'],
  },
  metal: {
    label: 'Metal ores',
    members: ['Ferrous ores', 'Non-ferrous ores'],
  },
  nonmetallic: {
    label: 'Non-metallic minerals',
    members: [
      'Non-metallic minerals - construction dominant',
      'Non-metallic minerals - industrial or agricultural dominant',
      'Excavated earthen materials (including soil) nec',
    ],
  },
  products: {
    label: 'Manufactured products',
    members: [
      'Mixed / complex products nec.',
      'Other products mainly from fossil fuels e.g. plastics',
      'Products mainly from biomass nec.',
      'Products mainly from metals nec.',
      'Products mainly from non-metallic minerals',
      'Refined fossil fuels mainly for fuel e.g. LPG gasoline diesel',
    ],
  },
  waste: {
    label: 'Waste',
    members: ['Waste for final treatment and disposal'],
  },
};

const MATERIAL_TO_GROUP = Object.fromEntries(
  Object.entries(MATERIAL_GROUPS).flatMap(([group, { members }]) =>
    members.map((m) => [m, group]),
  ),
);

// ── Tiny RFC-4180-ish CSV parser (same approach as scripts/fetch-sheets.js) ─
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function rowsToObjects(rows) {
  const [header, ...data] = rows;
  return data.map((row) => Object.fromEntries(header.map((h, i) => [h, row[i]])));
}

async function readCsv(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing source CSV: ${path}`);
  }
  const text = await readFile(path, 'utf8');
  return rowsToObjects(parseCsv(text));
}

// ── Builders ────────────────────────────────────────────────────────────────

// Build a {regionOrMaterial: [value-per-year, ...]} layout from long-format
// rows. Years are returned alongside so the consumer can label the x axis.
function pivotToTimeseries(rows, keyCol, valueCol, allYears) {
  const out = {};
  for (const r of rows) {
    const k = r[keyCol];
    const y = Number(r.year);
    const v = Number(r[valueCol]);
    if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
    if (!out[k]) out[k] = new Array(allYears.length).fill(null);
    const idx = allYears.indexOf(y);
    if (idx >= 0) out[k][idx] = v;
  }
  return out;
}

function uniqueSorted(rows, col, coerce = (x) => x) {
  return [...new Set(rows.map((r) => coerce(r[col])))].sort((a, b) =>
    typeof a === 'number' ? a - b : String(a).localeCompare(String(b)),
  );
}

async function buildWorldFlows(years) {
  const rows = await readCsv(resolve(PROCESSED_DIR, 'materials_world_DMC.csv'));
  const materials = pivotToTimeseries(rows, 'material_category', 'DMC_Mt', years);
  return { years, materials };
}

async function buildRegionFlows(years) {
  const rows = await readCsv(resolve(PROCESSED_DIR, 'materials_region_DMC.csv'));
  const regions = {};
  for (const r of rows) {
    const region = r.Region;
    if (!regions[region]) regions[region] = {};
    const mat = r.material_category;
    const y = Number(r.year);
    const v = Number(r.DMC_Mt);
    if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
    if (!regions[region][mat]) regions[region][mat] = new Array(years.length).fill(null);
    const idx = years.indexOf(y);
    if (idx >= 0) regions[region][mat][idx] = v;
  }
  return { years, regions };
}

async function buildGdpPop(years) {
  const gdpWorld = await readCsv(resolve(PROCESSED_DIR, 'gdp_world.csv'));
  const gdpRegion = await readCsv(resolve(PROCESSED_DIR, 'gdp_region.csv'));
  const popWorld = await readCsv(resolve(PROCESSED_DIR, 'population_world_historical.csv'));
  const popRegion = await readCsv(resolve(PROCESSED_DIR, 'population_region_historical.csv'));

  const gdp = { World: new Array(years.length).fill(null) };
  for (const r of gdpWorld) {
    const idx = years.indexOf(Number(r.year));
    if (idx >= 0) gdp.World[idx] = Number(r.GDP_2015USD);
  }
  for (const r of gdpRegion) {
    if (!gdp[r.Region]) gdp[r.Region] = new Array(years.length).fill(null);
    const idx = years.indexOf(Number(r.year));
    if (idx >= 0) gdp[r.Region][idx] = Number(r.GDP_2015USD);
  }

  const population = { World: new Array(years.length).fill(null) };
  for (const r of popWorld) {
    const idx = years.indexOf(Number(r.year));
    if (idx >= 0) population.World[idx] = Number(r.population);
  }
  for (const r of popRegion) {
    if (!population[r.Region]) population[r.Region] = new Array(years.length).fill(null);
    const idx = years.indexOf(Number(r.year));
    if (idx >= 0) population[r.Region][idx] = Number(r.population);
  }

  return { years, gdp, population };
}

async function buildStocks2024() {
  const totalRows = await readCsv(resolve(PARAMETERS_DIR, 'stock_2024_total.csv'));

  const totals = {};
  for (const r of totalRows) {
    if (!totals[r.Region]) totals[r.Region] = {};
    if (!totals[r.Region][r.material]) totals[r.Region][r.material] = {};
    totals[r.Region][r.material][r.end_use] = Number(r.stock_Mt);
  }

  // Age-profile data (stock_2024_age_profile.csv, ~4.5k rows / ~225 KB JSON)
  // is intentionally excluded from the eager bundle — no v1 preset uses it.
  // If a future "where the stock came from" view ships, it becomes its own
  // lazy layer in R2 under ssl-data/materials/derived/.
  return { snapshotYear: 2024, totals };
}

async function buildMeta(worldRows, regionRows) {
  const years = uniqueSorted(worldRows, 'year', Number);
  const materials = uniqueSorted(worldRows, 'material_category');
  const regions = uniqueSorted(regionRows, 'Region');

  // Warn if any material is missing from our hardcoded grouping.
  const ungrouped = materials.filter((m) => !MATERIAL_TO_GROUP[m]);
  if (ungrouped.length) {
    console.warn(`[build-materials] ${ungrouped.length} material(s) missing from MATERIAL_GROUPS:`);
    for (const m of ungrouped) console.warn(`  - ${m}`);
  }

  return {
    yearRange: [years[0], years[years.length - 1]],
    years,
    regions,
    materials: materials.map((m) => ({ id: m, label: m, group: MATERIAL_TO_GROUP[m] ?? null })),
    groups: Object.entries(MATERIAL_GROUPS).map(([id, { label, members }]) => ({
      id,
      label,
      members,
    })),
    flows: ['DMC'], // Pablo's processed data ships DMC only; raw mfa13 has DE/DMC/DMI/Imports/Exports/PTB.
    source: {
      paper: 'Busch et al. — Global material consumption persists despite optimal efficiency and circularity',
      repo: 'https://github.com/pmbusch/material-intensity',
      built: new Date().toISOString().slice(0, 10),
    },
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('[build-materials] reading from:');
  console.log(`  processed: ${PROCESSED_DIR}`);
  console.log(`  parameters: ${PARAMETERS_DIR}`);

  // Read the world flows first so we can derive the canonical year axis from it.
  const worldRows = await readCsv(resolve(PROCESSED_DIR, 'materials_world_DMC.csv'));
  const regionRows = await readCsv(resolve(PROCESSED_DIR, 'materials_region_DMC.csv'));

  const meta = await buildMeta(worldRows, regionRows);
  const years = meta.years;

  const worldFlows = await buildWorldFlows(years);
  const regionFlows = await buildRegionFlows(years);
  const gdpPop = await buildGdpPop(years);
  const stocks2024 = await buildStocks2024();

  await mkdir(OUT_DIR, { recursive: true });

  const outputs = [
    ['meta.json', meta],
    ['flows-world.json', worldFlows],
    ['flows-regions.json', regionFlows],
    ['gdp-pop.json', gdpPop],
    ['stocks-2024.json', stocks2024],
  ];
  for (const [name, data] of outputs) {
    const path = resolve(OUT_DIR, name);
    const json = JSON.stringify(data);
    await writeFile(path, json, 'utf8');
    const kb = (json.length / 1024).toFixed(1);
    console.log(`[build-materials] wrote ${name}  (${kb} KB)`);
  }
  console.log(`[build-materials] done. ${outputs.length} files in ${OUT_DIR}`);
}

run().catch((err) => {
  console.error('[build-materials] FAILED:', err.message);
  process.exitCode = 1;
});
