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
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import * as XLSX from 'xlsx';

// ── Sources ─────────────────────────────────────────────────────────────────
// PROCESSED: Pablo's "Processed data (results)" — DMC + GDP + historical pop.
// PARAMETERS: cloned repo's Parameters/ — in-use stocks snapshot.
const PROCESSED_DIR =
  process.env.MATERIALS_PROCESSED_DIR ??
  resolve(homedir(), 'Claude Projects/material-intensity/Processed data (results)');
const PARAMETERS_DIR =
  process.env.MATERIALS_PARAMETERS_DIR ??
  resolve(homedir(), 'Claude Projects/material-intensity/Parameters');
const INPUTS_DIR =
  process.env.MATERIALS_INPUTS_DIR ??
  resolve(homedir(), 'Claude Projects/material-intensity/Inputs');

const OUT_DIR = resolve('public/tools/materials');
// Lazy layer (country-level) is too big for the eager bundle. Goes to R2,
// fetched on demand by the explorer when a country is selected.
const LAZY_OUT_DIR = resolve('dist-materials-lazy');

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

  // Country-level GDP (World Bank) and population (UN) — joined to UNEP
  // country names via the ISO3 codes in Dict_Countries.xlsx.
  const countryStats = readCountryStats(years);
  Object.assign(gdp, countryStats.gdp);
  Object.assign(population, countryStats.population);

  return { years, gdp, population };
}

// ── Country-level GDP + population (lookup helpers) ─────────────────────────
//
// Three source files:
//   Dict_Countries.xlsx                  UNEP_name → ISO3 → Region
//   WorldBank/API_NY.GDP.MKTP.KD_*.xls   GDP (constant 2015 US$), 1960–2025
//   UN/WPP2024_GEN_F01_*.xlsx            mid-year population, 1950–2023
//
// Keyed on UNEP_name in the output so the explorer's existing geo-string
// lookups (which use UNEP names everywhere) work without translation.

function readCountryStats(years) {
  const dict = readUnepIsoMap();
  const gdpByIso = readWorldBankGdp();
  const popByIso = readUnPopulation();

  const gdp = {};
  const population = {};
  let missing = { gdp: 0, pop: 0 };

  for (const { name, iso3 } of dict) {
    const g = gdpByIso.get(iso3);
    const p = popByIso.get(iso3);
    if (g) {
      gdp[name] = years.map((y) => (typeof g.get(y) === 'number' ? g.get(y) : null));
    } else missing.gdp++;
    if (p) {
      population[name] = years.map((y) => (typeof p.get(y) === 'number' ? p.get(y) : null));
    } else missing.pop++;
  }

  console.log(
    `[build-materials] country GDP: ${Object.keys(gdp).length}/${dict.length} matched, ${missing.gdp} missing`,
  );
  console.log(
    `[build-materials] country pop: ${Object.keys(population).length}/${dict.length} matched, ${missing.pop} missing`,
  );

  return { gdp, population };
}

function readUnepIsoMap() {
  const path = resolve(INPUTS_DIR, 'Dict_Countries.xlsx');
  if (!existsSync(path)) return [];
  const wb = XLSX.read(readFileSync(path));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  return rows
    .map((r) => ({ name: String(r.UNEP_name ?? '').trim(), iso3: String(r.ISO3 ?? '').trim() }))
    .filter((r) => r.name && r.iso3);
}

function readWorldBankGdp() {
  const path = resolve(INPUTS_DIR, 'WorldBank/API_NY.GDP.MKTP.KD_DS2_en_excel_v2_753.xls');
  if (!existsSync(path)) return new Map();
  const wb = XLSX.read(readFileSync(path));
  // Header row is row 3 (0-indexed) per the file's structure.
  const sheet = wb.Sheets['Data'] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const headerRow = rows[3];
  const yearCols = headerRow
    .map((v, i) => ({ year: Number(v), col: i }))
    .filter((c) => Number.isFinite(c.year) && c.year >= 1900 && c.year <= 2100);
  const isoCol = headerRow.indexOf('Country Code');

  const map = new Map(); // iso3 → Map<year, value>
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const iso = String(row[isoCol] ?? '').trim();
    if (!iso) continue;
    const perYear = new Map();
    for (const { year, col } of yearCols) {
      const v = row[col];
      if (typeof v === 'number' && Number.isFinite(v)) perYear.set(year, v);
    }
    if (perYear.size > 0) map.set(iso, perYear);
  }
  return map;
}

function readUnPopulation() {
  const path = resolve(INPUTS_DIR, 'UN/WPP2024_GEN_F01_DEMOGRAPHIC_INDICATORS_COMPACT.xlsx');
  if (!existsSync(path)) return new Map();
  const wb = XLSX.read(readFileSync(path));
  const sheet = wb.Sheets['Estimates'];
  if (!sheet) return new Map();
  // The "Estimates" sheet has a header row at row 16 (0-indexed).
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 16 });
  const header = rows[0];
  const isoCol = header.indexOf('ISO3 Alpha-code');
  const typeCol = header.indexOf('Type');
  const yearCol = header.indexOf('Year');
  const popCol = header.indexOf('Total Population, as of 1 July (thousands)');
  if (isoCol < 0 || yearCol < 0 || popCol < 0) {
    console.warn('[build-materials] UN file missing expected columns');
    return new Map();
  }

  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (typeCol >= 0 && row[typeCol] !== 'Country/Area') continue;
    const iso = String(row[isoCol] ?? '').trim();
    if (!iso) continue;
    const year = Number(row[yearCol]);
    const popThousands = Number(row[popCol]);
    if (!Number.isFinite(year) || !Number.isFinite(popThousands)) continue;
    if (!map.has(iso)) map.set(iso, new Map());
    map.get(iso).set(year, popThousands * 1000); // thousands → persons
  }
  return map;
}

// ── Country-level lazy layer ────────────────────────────────────────────────
//
// Source: Inputs/UNEP/mfa13_export.csv (249 countries × 22 mats × 6 flows
// × 55 years, ~25k rows, 37 MB raw). Packed shape:
//
//   { schema, years, countries[], materials[], flows[],
//     data: [ [c_idx, m_idx, f_idx, ...55 year values], … ] }
//
// String dimensions are stored once; data rows use integer ids. Empty
// rows (all-zero / all-blank) are dropped. Target ~3 MB JSON.

async function buildCountryFlows() {
  const path = resolve(INPUTS_DIR, 'UNEP/mfa13_export.csv');
  if (!existsSync(path)) {
    console.warn(`[build-materials] skipping country layer; missing: ${path}`);
    return null;
  }

  const rows = await readCsv(path);
  const yearKeys = Object.keys(rows[0] ?? {}).filter((k) => /^\d{4}$/.test(k));
  const years = yearKeys.map(Number).sort((a, b) => a - b);

  // Collect unique dimensions (preserve appearance order so ids are stable).
  const countries = [];
  const materials = [];
  const flows = [];
  const seen = { c: new Map(), m: new Map(), f: new Map() };
  const intern = (set, list, value) => {
    if (set.has(value)) return set.get(value);
    const id = list.length;
    list.push(value);
    set.set(value, id);
    return id;
  };

  const data = [];
  let dropped = 0;

  for (const r of rows) {
    const country = (r.Country ?? '').trim();
    const material = (r.Category ?? '').trim();
    const flow = (r['Flow code'] ?? '').trim();
    if (!country || !material || !flow) {
      dropped++;
      continue;
    }
    const values = yearKeys.map((k) => {
      const v = r[k];
      if (v === '' || v == null) return 0;
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      // tonnes → Mt, rounded to 4 decimal places (0.0001 Mt = 100 t precision,
      // well below the noise floor of national MFA estimates and a big help
      // for JSON size).
      return Math.round((n / 1e6) * 10000) / 10000;
    });
    if (values.every((v) => v === 0)) {
      dropped++;
      continue;
    }
    const cIdx = intern(seen.c, countries, country);
    const mIdx = intern(seen.m, materials, material);
    const fIdx = intern(seen.f, flows, flow);
    data.push([cIdx, mIdx, fIdx, ...values]);
  }

  console.log(
    `[build-materials] countries: ${countries.length} | mats: ${materials.length} | flows: ${flows.length} | rows: ${data.length} | dropped: ${dropped}`,
  );

  return {
    schema: 'country-flat-v1',
    years,
    countries,
    materials,
    flows,
    data,
  };
}

// ── World boundary TopoJSON (for the choropleth) ───────────────────────────
//
// Reads the Natural-Earth-derived world-atlas TopoJSON shipped via npm.
// Walks each country geometry, resolves world-atlas's country name to a
// UNEP_name from Dict_Countries (with a small alias table for the common
// abbreviations world-atlas uses), and writes the alias back as
// properties.unep_name. The choropleth then joins by unep_name directly,
// no runtime lookup table needed.
//
// Countries with no UNEP match (Antarctica, Kosovo, N. Cyprus, etc.) keep
// their existing name and render as 'no data' in the chart.

const WORLD_ATLAS_ALIASES = {
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Brunei': 'Brunei Darussalam',
  'Central African Rep.': 'Central African Republic',
  'Congo': 'Rep Congo',
  'Czechia': 'Czech Republic',
  "Côte d'Ivoire": "Cote d'Ivoire",
  'Dem. Rep. Congo': 'DR Congo',
  'Dominican Rep.': 'Dominican Republic',
  'Eq. Guinea': 'Equatorial Guinea',
  'Falkland Is.': 'Falkland Islands (Malvinas)',
  'Fiji': 'Fiji Islands',
  'Macedonia': 'North Macedonia',
  'Russia': 'Russian Federation',
  'S. Sudan': 'South Sudan',
  'Solomon Is.': 'Solomon Islands',
  'Vietnam': 'Viet Nam',
  'W. Sahara': 'Western Sahara',
  'eSwatini': 'Swaziland',
};

async function buildWorldBoundaries() {
  const topoPath = resolve('node_modules/world-atlas/countries-110m.json');
  if (!existsSync(topoPath)) {
    console.warn(`[build-materials] world-atlas not installed; skipping world boundaries`);
    return null;
  }
  const topo = JSON.parse(await readFile(topoPath, 'utf8'));
  const unepNames = new Set(readUnepIsoMap().map((d) => d.name));
  let matched = 0;
  let unmatched = [];
  for (const g of topo.objects.countries.geometries) {
    const raw = g.properties?.name ?? '';
    const candidate = WORLD_ATLAS_ALIASES[raw] ?? raw;
    if (unepNames.has(candidate)) {
      g.properties.unep_name = candidate;
      matched++;
    } else {
      unmatched.push(raw);
    }
  }
  console.log(
    `[build-materials] world boundaries: ${matched}/${topo.objects.countries.geometries.length} matched to UNEP names`,
  );
  if (unmatched.length) console.log(`  unmatched: ${unmatched.join(', ')}`);
  return topo;
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
  console.log(`[build-materials] done. ${outputs.length} eager files in ${OUT_DIR}`);

  // World boundary TopoJSON for the choropleth — bake in UNEP_name on each
  // country geometry so the chart can look up values without a runtime alias
  // table. ~110 KB raw, well within the eager bundle.
  const worldTopo = await buildWorldBoundaries();
  if (worldTopo) {
    const path = resolve(OUT_DIR, 'world-countries-110m.json');
    const json = JSON.stringify(worldTopo);
    await writeFile(path, json, 'utf8');
    const kb = (json.length / 1024).toFixed(1);
    console.log(`[build-materials] wrote world-countries-110m.json (${kb} KB)`);
  }

  // Lazy country layer — too big for the eager bundle; uploaded to R2.
  const countryFlows = await buildCountryFlows();
  if (countryFlows) {
    await mkdir(LAZY_OUT_DIR, { recursive: true });
    const path = resolve(LAZY_OUT_DIR, 'flows-countries.json');
    const json = JSON.stringify(countryFlows);
    await writeFile(path, json, 'utf8');
    const mb = (json.length / 1024 / 1024).toFixed(2);
    console.log(`[build-materials] wrote flows-countries.json (${mb} MB) → ${path}`);
    console.log('[build-materials] upload to R2:');
    console.log(`  rclone copy "${path}" r2:ssl-data/materials/derived/`);
  }
}

run().catch((err) => {
  console.error('[build-materials] FAILED:', err.message);
  process.exitCode = 1;
});
