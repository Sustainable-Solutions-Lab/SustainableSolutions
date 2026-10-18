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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import * as XLSX from 'xlsx';

// ── Sources ─────────────────────────────────────────────────────────────────
// REPO: a clone of github.com/pmbusch/material-intensity. Everything the
// explorer needs now lives in its Parameters/ (DMC, GDP, population, in-use
// stocks) and Inputs/ (dictionaries, raw UNEP/UN/World Bank files).
// PROCESSED: Pablo's "Processed data (results)" folder in the shared paper
// Dropbox — a fallback for files the public repo does not ship (currently
// only population_region_historical.csv).
const REPO_DIR =
  process.env.MATERIALS_REPO_DIR ??
  resolve(
    homedir(),
    'Library/CloudStorage/Dropbox/Papers/Active Prep/Material intensity/material-intensity',
  );
const PARAMETERS_DIR = process.env.MATERIALS_PARAMETERS_DIR ?? resolve(REPO_DIR, 'Parameters');
// Model outputs (Monte Carlo envelope, deterministic runs) live beside the
// inputs rather than inside Parameters/, and are indexed the same way.
const RESULTS_DIR = process.env.MATERIALS_RESULTS_DIR ?? resolve(REPO_DIR, 'Results');
const INPUTS_DIR = process.env.MATERIALS_INPUTS_DIR ?? resolve(REPO_DIR, 'Inputs');
const PROCESSED_DIR =
  process.env.MATERIALS_PROCESSED_DIR ??
  resolve(
    homedir(),
    'Library/CloudStorage/Dropbox/Papers/Active Prep/Material intensity',
    'Material use (w Pablo)/Processed data (results)',
  );

const OUT_DIR = resolve('public/tools/materials');
// Lazy layer (country-level) is too big for the eager bundle. Goes to R2,
// fetched on demand by the explorer when a country is selected.
const LAZY_OUT_DIR = resolve('build/materials-lazy');

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

// ── Flow types (Parameters/UNEP-Materials/) ─────────────────────────────────
// UNEP IRP publishes six accounts. DMC is what the explorer opens on and the
// only one in the eager bundle; the rest ride a lazy layer, since most views
// never ask for them.
const FLOWS = [
  { id: 'DMC', label: 'Domestic material consumption', eager: true },
  { id: 'DE', label: 'Domestic extraction' },
  { id: 'DMI', label: 'Direct material input' },
  { id: 'IMP', label: 'Imports' },
  { id: 'EXP', label: 'Exports' },
  { id: 'PTB', label: 'Physical trade balance' },
];

const LAZY_FLOWS = FLOWS.filter((f) => !f.eager);

// ── In-use stock dimensions (Parameters/stock_2024_total.csv) ───────────────
// The stock-flow model tracks three materials across four end-use categories,
// each split into two sub-uses. Upstream ids are snake_case; these are the
// labels the explorer shows, matching the panel labels in the paper figures.
const STOCK_MATERIAL_LABELS = {
  Metal_Fe: 'Ferrous ores',
  Metal_NonFe: 'Non-ferrous ores',
  'Non-metallic minerals': 'Non-metallic minerals',
};

const STOCK_END_USE_LABELS = {
  buildings: 'Buildings',
  civil_infrastructure: 'Civil infrastructure',
  machinery: 'Machinery',
  short_lived: 'Short-lived products',
};

const STOCK_SUB_USE_LABELS = {
  residential: 'Residential buildings',
  non_residential: 'Non-residential buildings',
  roads: 'Roads',
  civil_engineering: 'Civil engineering',
  machinery_group: 'Machinery',
  vehicles_group: 'Vehicles',
  durables: 'Durables',
  packaging: 'Packaging',
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

// Parameters/ is the canonical home for every aggregated CSV, but upstream
// reshuffles its folders periodically — twice in 2026 — so rather than
// hard-coding subfolders we index the tree once by filename and look CSVs up
// by basename. Anything upstream omits falls back to the Dropbox processed
// folder.
function indexParameters(dir) {
  const index = new Map();
  if (!existsSync(dir)) return index;
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const full = resolve(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      // First match wins, and entries are walked in sorted order, so a
      // duplicate basename resolves the same way on every machine.
      else if (!index.has(entry)) index.set(entry, full);
    }
  };
  walk(dir);
  return index;
}

const PARAMETER_FILES = new Map([
  ...indexParameters(PARAMETERS_DIR),
  ...indexParameters(RESULTS_DIR),
]);

function sourceCsv(name) {
  return PARAMETER_FILES.get(name) ?? resolve(PROCESSED_DIR, name);
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

async function buildWorldFlows(years, flow = 'DMC') {
  const rows = await readCsv(sourceCsv(`materials_world_${flow}.csv`));
  const materials = pivotToTimeseries(rows, 'material_category', `${flow}_Mt`, years);
  return { years, materials };
}

async function buildRegionFlows(years, flow = 'DMC') {
  const rows = await readCsv(sourceCsv(`materials_region_${flow}.csv`));
  const regions = {};
  for (const r of rows) {
    const region = r.Region;
    if (!regions[region]) regions[region] = {};
    const mat = r.material_category;
    const y = Number(r.year);
    const v = Number(r[`${flow}_Mt`]);
    if (!Number.isFinite(y) || !Number.isFinite(v)) continue;
    if (!regions[region][mat]) regions[region][mat] = new Array(years.length).fill(null);
    const idx = years.indexOf(y);
    if (idx >= 0) regions[region][mat][idx] = v;
  }
  return { years, regions };
}

async function buildGdpPop(years) {
  const gdpWorld = await readCsv(sourceCsv('gdp_world.csv'));
  const gdpRegion = await readCsv(sourceCsv('gdp_region.csv'));
  const popWorld = await readCsv(sourceCsv('population_world_historical.csv'));
  const popRegion = await readCsv(sourceCsv('population_region_historical.csv'));

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

// The five non-DMC accounts, world and region, in one lazily-fetched file.
// Same inner shape as the eager layers so derive() can swap one for the other.
async function buildExtraFlows(years) {
  const world = {};
  const regions = {};
  for (const { id } of LAZY_FLOWS) {
    world[id] = (await buildWorldFlows(years, id)).materials;
    regions[id] = (await buildRegionFlows(years, id)).regions;
  }
  return { years, world, regions };
}

async function buildStocks2024() {
  const rows = await readCsv(sourceCsv('stock_2024_total.csv'));

  // totals[region][material][superCategory][subUse] = Mt in use at end-2024.
  const totals = {};
  for (const r of rows) {
    const v = Number(r.stock_Mt);
    if (!Number.isFinite(v)) continue;
    const byMaterial = (totals[r.Region] ??= {});
    const byCategory = (byMaterial[r.material] ??= {});
    const bySubUse = (byCategory[r.super_category] ??= {});
    bySubUse[r.sub_use] = (bySubUse[r.sub_use] ?? 0) + v;
  }

  // Age-profile data (stock_2024_age_profile.csv, ~13k rows) is intentionally
  // excluded from the eager bundle — no v1 preset uses it. If an age-pyramid
  // view ships, it becomes its own lazy layer in R2 under
  // ssl-data/materials/derived/.
  return {
    snapshotYear: 2024,
    materialLabels: STOCK_MATERIAL_LABELS,
    endUseLabels: STOCK_END_USE_LABELS,
    subUseLabels: STOCK_SUB_USE_LABELS,
    totals,
  };
}

// ── SSP driver projections (Parameters/IIASA/ssp_drivers.csv) ───────────────
//
// IIASA's SSP database ships population and GDP per capita per region per
// scenario, plus an index normalised to 1 in the base year. Levels differ
// from the UN/World Bank history the rest of the tool uses, so projections
// are anchored the way Busch et al. anchor them: the 2024 historical value
// times the scenario index. Regional GDP follows the identity used upstream,
// GDP_index = Population_index x GDP-per-capita_index, and world totals are
// summed over regions (world GDP per capita is the ratio of the two sums).

const PROJECTION_START = 2024;
const PROJECTION_END = 2060;

async function buildSspDrivers(historyYears, gdpPop) {
  const rows = await readCsv(sourceCsv('ssp_drivers.csv'));

  const years = [];
  for (let y = PROJECTION_START; y <= PROJECTION_END; y++) years.push(y);
  const scenarios = uniqueSorted(rows, 'scenario');

  // index[variable][scenario][region][year]
  const index = {};
  for (const r of rows) {
    const y = Number(r.year);
    const idx = Number(r.index);
    if (!Number.isFinite(y) || !Number.isFinite(idx)) continue;
    if (y < PROJECTION_START || y > PROJECTION_END) continue;
    ((index[r.variable] ??= {})[r.scenario] ??= {})[r.region] ??= {};
    index[r.variable][r.scenario][r.region][y] = idx;
  }

  const popIdx = index.Population ?? {};
  const gdppcIdx = index['GDP|PPP [per capita]'] ?? {};

  const base = (series, region) => {
    const arr = series[region];
    const i = historyYears.indexOf(PROJECTION_START);
    return arr && i >= 0 ? arr[i] : null;
  };

  const regions = {};
  const worldPop = {};
  const worldGdp = {};

  for (const scenario of scenarios) {
    for (const region of Object.keys(popIdx[scenario] ?? {})) {
      const pop2024 = base(gdpPop.population, region);
      const gdp2024 = base(gdpPop.gdp, region);
      if (pop2024 == null || gdp2024 == null) continue;

      const bucket = (regions[region] ??= { population: {}, gdp: {}, gdpPerCapita: {} });
      const pop = [];
      const gdp = [];
      const gdppc = [];
      for (const y of years) {
        const pi = popIdx[scenario]?.[region]?.[y];
        const gi = gdppcIdx[scenario]?.[region]?.[y];
        if (!Number.isFinite(pi) || !Number.isFinite(gi)) {
          pop.push(null);
          gdp.push(null);
          gdppc.push(null);
          continue;
        }
        const p = pop2024 * pi;
        const g = gdp2024 * pi * gi;
        pop.push(p);
        gdp.push(g);
        gdppc.push(g / p);
        (worldPop[scenario] ??= {})[y] = (worldPop[scenario][y] ?? 0) + p;
        (worldGdp[scenario] ??= {})[y] = (worldGdp[scenario][y] ?? 0) + g;
      }
      bucket.population[scenario] = pop;
      bucket.gdp[scenario] = gdp;
      bucket.gdpPerCapita[scenario] = gdppc;
    }
  }

  const world = { population: {}, gdp: {}, gdpPerCapita: {} };
  for (const scenario of scenarios) {
    world.population[scenario] = years.map((y) => worldPop[scenario]?.[y] ?? null);
    world.gdp[scenario] = years.map((y) => worldGdp[scenario]?.[y] ?? null);
    world.gdpPerCapita[scenario] = years.map((y) => {
      const p = worldPop[scenario]?.[y];
      const g = worldGdp[scenario]?.[y];
      return p ? g / p : null;
    });
  }

  return {
    years,
    scenarios,
    anchorYear: PROJECTION_START,
    world,
    regions,
    source: {
      drivers: 'IIASA SSP database (basic drivers), indexed to 2024 = 1',
      anchors: 'UN WPP 2024 population and World Bank GDP (2015 US$)',
    },
  };
}

// ── Projected material flows (Results/) ─────────────────────────────────────
//
// Two published products, complementary:
//   mc_envelope.csv          world totals per material group, 2025-2060, with
//                            the Monte Carlo percentile band (1000 runs).
//   deterministic_results.csv one run per SSP, by region and material, with
//                            primary consumption and in-use stock.
// The envelope carries the uncertainty but only globally; the deterministic
// runs carry the regional and scenario detail but no band. The explorer uses
// whichever fits the view, so both ship.
//
// Note on basis: the model projects PRIMARY consumption from the stock-flow
// model, and for metals that is ore-equivalent, which sits about 25% above
// UNEP's DMC metal-ore series in 2024. Biomass, fossil fuels and non-metallic
// minerals line up with history to within a couple of percent.

// Pablo's group ids → the explorer's.
const PROJECTION_GROUPS = {
  biomass: 'biomass',
  fossil_fuels: 'fossil',
  metal_fe: 'metal',
  metal_nonfe: 'metal',
  nonmetallic_minerals: 'nonmetallic',
  Biomass: 'biomass',
  'Fossil fuels': 'fossil',
  'Metal ores': 'metal',
  'Non-metallic minerals': 'nonmetallic',
};

const PERCENTILES = ['p05', 'p25', 'p50', 'p75', 'p95', 'p_min', 'p_max'];

async function buildProjections() {
  const envelopeRows = await readCsv(sourceCsv('mc_envelope.csv'));
  const detRows = await readCsv(sourceCsv('deterministic_results.csv'));
  if (envelopeRows.length === 0 && detRows.length === 0) return null;

  const years = uniqueSorted(envelopeRows, 'year', Number);
  const slot = (y) => years.indexOf(Number(y));

  // Envelope: world totals per group, Gt in the source, Mt here to match flows.
  const envelope = {};
  for (const r of envelopeRows) {
    const group = PROJECTION_GROUPS[r.material_group];
    const i = slot(r.year);
    if (!group || i < 0) continue;
    const bucket = (envelope[group] ??= Object.fromEntries(
      PERCENTILES.map((k) => [k, new Array(years.length).fill(null)]),
    ));
    for (const k of PERCENTILES) {
      const v = Number(r[k]);
      if (Number.isFinite(v)) bucket[k][i] = v * 1000;
    }
  }

  // Deterministic: one line per SSP, per region and world, for consumption and
  // the in-use stock that drives it.
  const deterministic = {};
  const stock = {};
  const add = (target, ssp, geo, group, i, v) => {
    if (!Number.isFinite(v)) return;
    const byGeo = (target[ssp] ??= {});
    const byGroup = (byGeo[geo] ??= {});
    const arr = (byGroup[group] ??= new Array(years.length).fill(null));
    arr[i] = (arr[i] ?? 0) + v;
  };

  for (const r of detRows) {
    const group = PROJECTION_GROUPS[r.material_group];
    const i = slot(r.year);
    if (!group || i < 0) continue;
    const flow = Number(r.primary_consumption_Mt);
    const inUse = Number(r.in_use_stock_Mt);
    for (const geo of [r.region, 'World']) {
      add(deterministic, r.ssp_label, geo, group, i, flow);
      add(stock, r.ssp_label, geo, group, i, inUse);
    }
  }

  return {
    years,
    scenarios: uniqueSorted(detRows, 'ssp_label'),
    groups: [...new Set(Object.values(PROJECTION_GROUPS))],
    envelope,
    deterministic,
    stock,
    basis:
      'Modelled primary consumption. Metal ores are ore-equivalent and sit above the UNEP DMC series at the 2024 splice.',
  };
}

// ── Sensitivity: the Monte Carlo ensemble behind Figure 5 ───────────────────
//
// Three tables, all keyed to the same 1000 runs and the same outcome: total
// (population-inclusive) world material consumption CAGR 2025–2060, against
// the GDP CAGR each run was drawn with.
//
//   runs        per-run outcome, plus the regression that defines which runs
//               beat their own growth (Pablo's panel b)
//   levers      multivariate lm over every lever in real units, each
//               coefficient × a fixed, physically meaningful change (panel c)
//   importance  LightGBM/TreeSHAP attribution, averaged within material
//               growth bins and renormalised to 100% per bin (panel a)
//
// "Absolute decoupling" here is simply mat_cagr < 0 — the simple definition
// this figure uses, not the four-class scheme 04-Decoupling.R also produces.

// Family colours as the paper assigns them, so bars match print.
const LEVER_FAMILY_COLORS = {
  'Driver SSP': '#1f78b4',
  'Regional divergence': '#6a3d9a',
  Intensity: '#e31a1c',
  'Material recovery': '#33a02c',
  Mining: '#8c510a',
  Lifetime: '#ff7f00',
  Other: '#999999',
};

const GROWTH_BINS = ['<0%', '0-1%', '1-2%', '>2%'];

// Least squares through (x, fitted y) recovers the line Pablo fitted: the
// cached fit_mat_cagr column is that line already evaluated at each run's x.
function recoverFit(xs, yFits) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = yFits.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (yFits[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

// Growth rates are percent-per-year everywhere downstream; the source holds
// them as fractions.
const pct = (v) => (Number.isFinite(v) ? Number((v * 100).toPrecision(6)) : null);
const num = (v, digits = 6) => (Number.isFinite(v) ? Number(v.toPrecision(digits)) : null);

async function buildSensitivity() {
  const scatterRows = await readCsv(sourceCsv('Figure5_Scatter.csv'));
  if (scatterRows.length === 0) return null;
  const leverRows = await readCsv(sourceCsv('Figure5_LeverEffects.csv'));
  const importanceRows = await readCsv(sourceCsv('Figure5_GrowthImportance.csv'));

  const sspLevels = uniqueSorted(scatterRows, 'ssp');
  const bins = GROWTH_BINS.filter((b) => scatterRows.some((r) => r.growth_bin === b));

  // Columns rather than records: a third of the bytes, and every consumer
  // wants whole columns anyway.
  const runs = {
    id: [],
    matCagr: [],
    gdpCagr: [],
    ssp: [],
    t2060: [],
    fossilIndex: [],
    decouple: [],
    selected: [],
    bin: [],
  };
  const xs = [];
  const yFits = [];
  for (const r of scatterRows) {
    const mat = Number(r.mat_cagr);
    const gdp = Number(r.gdp_cagr);
    if (!Number.isFinite(mat) || !Number.isFinite(gdp)) continue;
    runs.id.push(Number(r.run_id));
    runs.matCagr.push(pct(mat));
    runs.gdpCagr.push(pct(gdp));
    runs.ssp.push(sspLevels.indexOf(r.ssp));
    runs.t2060.push(num(Number(r.t_2060), 4));
    runs.fossilIndex.push(num(Number(r.fossil_index_world), 4));
    runs.decouple.push(r.abs_decouple === 'TRUE' ? 1 : 0);
    runs.selected.push(r.selected === 'TRUE' ? 1 : 0);
    runs.bin.push(bins.indexOf(r.growth_bin));
    const fitted = Number(r.fit_mat_cagr);
    if (Number.isFinite(fitted)) {
      xs.push(gdp);
      yFits.push(fitted);
    }
  }

  const recovered = recoverFit(xs, yFits);
  const residSigma = Number(scatterRows[0].resid_sigma);
  const seMult = Number(scatterRows[0].se_mult);
  const fit = recovered
    ? {
        // Both axes are in %/yr, so the slope — a ratio — carries over unscaled.
        slope: num(recovered.slope),
        intercept: pct(recovered.intercept),
        residSigma: pct(residSigma),
        seMult: Number.isFinite(seMult) ? seMult : 1,
      }
    : null;

  // Each lever's effect is its coefficient times its OWN delta, and the deltas
  // differ (+0.1 kg/USD vs +20yr vs +25%) — so the delta travels with the row
  // and the chart has to print it beside the bar.
  // Some display labels carry their own delta ("Fe (+25%)") and some do not;
  // the delta is printed beside every bar, so strip the duplicate.
  const trimDelta = (label, delta) => {
    const m = /^(.*?)\s*\(([^()]*)\)$/.exec(label ?? '');
    return m && m[2].trim() === (delta ?? '').trim() ? m[1].trim() : label;
  };

  const levers = leverRows
    .map((r) => ({
      order: Number(r.order),
      label: trimDelta(r.display_label, r.delta_label),
      group: r.group_label,
      family: r.family,
      delta: r.delta_label,
      effect: num(Number(r.effect_pp)),
      lo: num(Number(r.ci_lo_pp)),
      hi: num(Number(r.ci_hi_pp)),
      significant: r.significant === 'TRUE',
      color: LEVER_FAMILY_COLORS[r.family] ?? LEVER_FAMILY_COLORS.Other,
    }))
    .filter((l) => Number.isFinite(l.effect))
    .sort((a, b) => a.order - b.order);

  const importance = {};
  for (const r of importanceRows) {
    const bin = r.growth_bin;
    if (!bins.includes(bin)) continue;
    const share = Number(r.pct);
    if (!Number.isFinite(share)) continue;
    (importance[bin] ??= []).push({
      label: r.display_label,
      pct: num(share),
      order: Number(r.stack_order),
      color: r.fill_hex,
    });
  }
  // Stack order descends in the source; keep it so every bin stacks alike.
  for (const bin of Object.keys(importance)) importance[bin].sort((a, b) => b.order - a.order);

  const binCounts = {};
  for (const b of runs.bin) {
    const name = bins[b];
    if (name) binCounts[name] = (binCounts[name] ?? 0) + 1;
  }

  return {
    nRuns: runs.id.length,
    window: [2025, PROJECTION_END],
    sspLevels,
    bins,
    binCounts,
    runs,
    fit,
    levers,
    importance,
    notes: {
      outcome:
        'Total world material consumption CAGR 2025–2060, population included, against the GDP CAGR each run was drawn with.',
      decouple: 'Absolute decoupling means consumption falls outright — a CAGR below zero.',
      selected:
        'Runs sitting more than one residual standard deviation below the fitted line: material growth well under what their GDP growth implies.',
      levers:
        'Multivariate regression over every lever in real units, each coefficient scaled by its own physically meaningful change. Bars are not comparable between levers with different deltas.',
      importance:
        'TreeSHAP attribution from a gradient-boosted surrogate, averaged within each growth bin and renormalised to 100%.',
    },
  };
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
    flows: FLOWS.map(({ id, label, eager }) => ({ id, label, eager: eager === true })),
    source: {
      paper: 'Busch et al. — Global material consumption persists despite optimal efficiency and circularity',
      repo: 'https://github.com/pmbusch/material-intensity',
      built: new Date().toISOString().slice(0, 10),
    },
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────

// Local to this section: CSV cells arrive as strings, and every number shipped
// to the browser is trimmed to six significant digits to keep the payload small.
const cell = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toPrecision(6)) : null;
};
const round6 = (v) => (Number.isFinite(v) ? Number(v.toPrecision(6)) : null);

// ── Live projection model ────────────────────────────────────────────────────
// src/tools/materials/model.ts runs the paper's model in the browser so that
// moving a slider reprojects rather than interpolating a precomputed grid.
// Everything it needs is assembled here; the shapes match ModelInputs.

const SSP_SAMPLED = ['SSP1', 'SSP2', 'SSP3', 'SSP5'];
const SSP_ALL = ['SSP1', 'SSP2', 'SSP3', 'SSP4', 'SSP5'];
const MODEL_YEARS = [];
for (let y = 2025; y <= 2060; y++) MODEL_YEARS.push(y);

const BIOMASS_INTENSITY_KEYS = {
  Crops: 'crops',
  'Grazed biomass and fodder crops': 'grazed_biomass',
  Wood: 'wood',
  'Other biomass': 'other_biomass',
};
const BIOMASS_FLOW_LABEL = {
  crops: 'Crops',
  grazed_biomass: 'Grazed biomass and fodder crops',
  other_biomass: 'Other biomass',
  wood: 'Wood',
};
const FOSSIL_FLOW_LABEL = {
  coal: 'Coal',
  gas: 'Natural Gas',
  oil: 'Petroleum',
  other_fossil: 'Other fossil fuels',
};

// The four free-text end-use rows in the Excel sheets -> the model's key.
function classifySuperUse(value) {
  const s = String(value ?? '').toLowerCase();
  if (s.includes('build')) return 'buildings';
  if (s.includes('civil')) return 'civil';
  if (s.includes('short')) return 'sl_products';
  if (s.includes('machin')) return 'machinery';
  return null;
}

function readSheet(file, name, skip = 0) {
  const path = resolve(INPUTS_DIR, file);
  if (!existsSync(path)) return [];
  const wb = XLSX.read(readFileSync(path));
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { raw: true, range: skip });
}

async function buildProjectionInputs() {
  const driverRows = await readCsv(sourceCsv('ssp_drivers.csv'));
  if (driverRows.length === 0) return null;

  const regions = [...new Set(driverRows.map((r) => r.region))].filter((r) => r && r !== 'World').sort();

  const pickIndex = (variable, scenarios) => {
    const out = {};
    for (const s of scenarios) {
      out[s] = {};
      for (const r of regions) out[s][r] = new Array(MODEL_YEARS.length).fill(null);
    }
    for (const row of driverRows) {
      if (row.variable !== variable) continue;
      const y = Number(row.year);
      const slot = out[row.scenario]?.[row.region];
      if (!slot || y < 2025 || y > 2060) continue;
      slot[y - 2025] = cell(row.index);
    }
    return out;
  };

  const gdpRows = (await readCsv(sourceCsv('gdp_region.csv'))).filter((r) => Number(r.year) === 2024);
  const popRows = (await readCsv(sourceCsv('population_region_historical.csv'))).filter(
    (r) => Number(r.year) === 2024,
  );

  // 2024 mass anchors for the Kaya flow materials, on the model's own
  // categories: everything minor collapses into "Other biomass" / "Other
  // fossil fuels", exactly as 02-RunSimulations.R collapses it.
  const dict = new Map(
    readSheet('Dict_Materials.xlsx', 'Categories').map((r) => [r.Material_22, r.Material_group]),
  );
  const namedBiomass = new Set(['Crops', 'Grazed biomass and fodder crops', 'Wood', 'Crop Residues']);
  const namedFossil = new Set(['Coal', 'Natural Gas', 'Petroleum']);
  const m2024 = {};
  for (const row of await readCsv(sourceCsv('materials_region_DMC.csv'))) {
    if (Number(row.year) !== 2024) continue;
    const group = dict.get(row.material_category);
    let label = row.material_category;
    if (group === 'Biomass') label = namedBiomass.has(label) ? label : 'Other biomass';
    else if (group === 'Fossil fuels') label = namedFossil.has(label) ? label : 'Other fossil fuels';
    else continue;
    m2024[row.Region] ??= {};
    m2024[row.Region][label] = (m2024[row.Region][label] ?? 0) + (cell(row.DMC_Mt) ?? 0);
  }

  // 2024 intensity levels and each SSP's own target, by region.
  const flowInt2024 = {};
  const sspFlowTargets = {};
  const addFlowRow = (region, key, row) => {
    if (!region || !key) return;
    flowInt2024[region] ??= {};
    flowInt2024[region][key] ??= cell(row['kg/USD 2024']);
    for (const ssp of SSP_ALL) {
      const t = cell(row[ssp]);
      if (t == null) continue;
      sspFlowTargets[key] ??= {};
      sspFlowTargets[key][ssp] ??= {};
      sspFlowTargets[key][ssp][region] ??= t;
    }
  };
  for (const row of readSheet('MatIntensity_Assumptions.xlsx', 'Biomass')) {
    addFlowRow(row.Region, BIOMASS_INTENSITY_KEYS[row.Category], row);
  }
  for (const row of readSheet('MatIntensity_Assumptions.xlsx', 'FossilFuels')) {
    addFlowRow(row.Region, row.fuel === 'Other fossil fuels' ? 'other_fossil' : row.fuel, row);
  }

  const stockInt2024 = { metal_ores: {}, nonmetallic_minerals: {} };
  const sspStockTargets = { metal_ores: {}, nonmetallic_minerals: {} };
  for (const [sheetName, group] of [
    ['MetalOres', 'metal_ores'],
    ['NonMetallicMinerals', 'nonmetallic_minerals'],
  ]) {
    for (const row of readSheet('MatIntensity_Assumptions.xlsx', sheetName, 1)) {
      const key = classifySuperUse(row.end_use);
      const region = row.region;
      if (!key || !region) continue;
      stockInt2024[group][region] ??= {};
      stockInt2024[group][region][key] ??= cell(row['kg/USD 2024']);
      for (const ssp of SSP_ALL) {
        const t = cell(row[ssp]);
        if (t == null) continue;
        sspStockTargets[group][key] ??= {};
        sspStockTargets[group][key][ssp] ??= {};
        sspStockTargets[group][key][ssp][region] ??= t;
      }
    }
  }

  // Intensity ratio bounds (endpoint / 2024): flows differ by SSP, stocks don't.
  const flowRatioBounds = {};
  for (const r of await readCsv(sourceCsv('flow_ratio_bounds.csv'))) {
    flowRatioBounds[r.mat_key] ??= {};
    flowRatioBounds[r.mat_key][r.ssp] ??= {};
    flowRatioBounds[r.mat_key][r.ssp][r.region] = [cell(r.ratio_min), cell(r.ratio_max)];
  }
  const stockRatioBounds = {};
  for (const r of await readCsv(sourceCsv('stock_ratio_bounds.csv'))) {
    stockRatioBounds[r.material_group] ??= {};
    stockRatioBounds[r.material_group][r.mat_key] ??= {};
    stockRatioBounds[r.material_group][r.mat_key][r.region] = [cell(r.ratio_min), cell(r.ratio_max)];
  }
  const intensityWorldBounds = {};
  for (const r of await readCsv(sourceCsv('intensity_world_bounds.csv'))) {
    intensityWorldBounds[r.param] = { min: cell(r.bound_min), max: cell(r.bound_max), base: cell(r.int_2024) };
  }

  // How far world material intensity actually moves across the paper's 1,000
  // runs, as an annual rate: material CAGR relative to GDP CAGR. The driver
  // slider is bounded by this, because pushing every material's endpoint to
  // its own bound at once is a corner the Latin hypercube never draws, and
  // in that corner the stock model stops building for a decade.
  let intensityCagrRange = null;
  for (const r of await readCsv(sourceCsv('Figure5_Scatter.csv'))) {
    const mat = Number(r.mat_cagr);
    const gdp = Number(r.gdp_cagr);
    if (!Number.isFinite(mat) || !Number.isFinite(gdp)) continue;
    const v = (1 + mat) / (1 + gdp) - 1;
    intensityCagrRange ??= { min: v, max: v };
    intensityCagrRange.min = Math.min(intensityCagrRange.min, v);
    intensityCagrRange.max = Math.max(intensityCagrRange.max, v);
  }
  if (intensityCagrRange) {
    intensityCagrRange = { min: num(intensityCagrRange.min), max: num(intensityCagrRange.max) };
  }

  // 2024 stock by end use, and the cohort age profile the dynamic stock model
  // starts from. Upstream reports the profile in 5-year bins; spreading each
  // bin evenly over the years it covers removes the staircase that would
  // otherwise show up in the retirement curve.
  const stock2024 = {};
  for (const r of await readCsv(sourceCsv('stock_2024_total.csv'))) {
    stock2024[r.material] ??= {};
    stock2024[r.material][r.Region] ??= {};
    stock2024[r.material][r.Region][r.sub_use] = cell(r.stock_Mt);
  }

  const bins = new Map();
  for (const r of await readCsv(sourceCsv('stock_2024_age_profile.csv'))) {
    const cohort = Number(r.cohort_year);
    if (!Number.isFinite(cohort) || cohort < 1884) continue;
    const key = `${r.material}\u0000${r.Region}\u0000${r.sub_use}`;
    let byYear = bins.get(key);
    if (!byYear) bins.set(key, (byYear = new Map()));
    byYear.set(cohort, (byYear.get(cohort) ?? 0) + (cell(r.surviving_stock_Mt) ?? 0));
  }
  const ageProfile = {};
  for (const [key, byYear] of bins) {
    const [material, region, subUse] = key.split('\u0000');
    const cohorts = [...byYear.keys()].sort((a, b) => a - b);
    const dense = new Map();
    let prev = null;
    for (const cohort of cohorts) {
      const gap = prev === null ? 5 : cohort - prev;
      const perYear = byYear.get(cohort) / gap;
      for (let y = cohort - gap + 1; y <= cohort; y++) dense.set(y, (dense.get(y) ?? 0) + perYear);
      prev = cohort;
    }
    const start = Math.min(...dense.keys());
    const end = Math.max(...dense.keys());
    const stocks = [];
    for (let y = start; y <= end; y++) stocks.push(round6(dense.get(y) ?? 0));
    ageProfile[material] ??= {};
    ageProfile[material][region] ??= {};
    ageProfile[material][region][subUse] = { start, stocks };
  }

  // 2024 stock log-growth per end use: the model eases out of this rate rather
  // than opening 2025 with a step.
  const growthPairs = new Map();
  for (const r of await readCsv(sourceCsv('stock_trajectory_subenduse.csv'))) {
    const y = Number(r.year);
    if (y !== 2023 && y !== 2024) continue;
    const key = `${r.material}\u0000${r.Region}\u0000${r.sub_use}`;
    const slot = growthPairs.get(key) ?? {};
    slot[y] = cell(r.stock_Mt);
    growthPairs.set(key, slot);
  }
  const stockGrowthHist = {};
  for (const [key, v] of growthPairs) {
    if (!(v[2023] > 0) || !(v[2024] > 0)) continue;
    const [material, region, subUse] = key.split('\u0000');
    stockGrowthHist[material] ??= {};
    stockGrowthHist[material][region] ??= {};
    stockGrowthHist[material][region][subUse] = Math.log(v[2024] / v[2023]);
  }

  const recycRows = readSheet('Recycling_Assumptions.xlsx', 'Recycling_EOL').filter(
    (r) => r.Region && !String(r.Region).includes('—'),
  );
  const downRows = readSheet('Recycling_Assumptions.xlsx', 'Downcycling').filter(
    (r) => r.Region && !String(r.Region).includes('—'),
  );

  const lifetimes = {};
  for (const r of readSheet('MC_Assumptions.xlsx', 'Lifetimes')) {
    if (!r.sub_use) continue;
    lifetimes[r.sub_use] = {
      superCategory: r.super_category,
      meanLife: cell(r.mean_life),
      k: cell(r.weibull_k),
      meanMin: cell(r.mean_life_min),
      meanMax: cell(r.mean_life_max),
      kMin: cell(r.k_min),
      kMax: cell(r.k_max),
    };
  }
  const mcParams = {};
  for (const r of readSheet('MC_Assumptions.xlsx', 'Parameters')) {
    if (!r.parameter_name) continue;
    mcParams[r.parameter_name] = { min: cell(r.min), central: cell(r.central_value), max: cell(r.max) };
  }

  return {
    regions,
    sspSampled: SSP_SAMPLED,
    years: MODEL_YEARS,
    baseYear: 2024,
    forecastEnd: 2060,
    popIndex: pickIndex('Population', SSP_SAMPLED),
    gdppcIndex: pickIndex('GDP|PPP [per capita]', SSP_SAMPLED),
    gdp2024: Object.fromEntries(gdpRows.map((r) => [r.Region, cell(r.GDP_2015USD)])),
    pop2024: Object.fromEntries(popRows.map((r) => [r.Region, cell(r.population)])),
    m2024,
    flowInt2024,
    stockInt2024,
    flowRatioBounds,
    stockRatioBounds,
    intensityWorldBounds,
    intensityCagrRange,
    stock2024,
    ageProfile,
    stockGrowthHist,
    recyclingNow: {
      fe: Object.fromEntries(recycRows.map((r) => [r.Region, cell(r.Recycling_rate_Fe)])),
      nonfe: Object.fromEntries(recycRows.map((r) => [r.Region, cell(r.Recycling_rate_NonFe)])),
    },
    downcyclingNow: Object.fromEntries(downRows.map((r) => [r.Region, cell(r['Downcycling rate'])])),
    lifetimes,
    mcParams,
    gradeOre2024: { fe: 0.4, nonfe: 0.016 },
  };
}

// ── What each SSP means for temperature ──────────────────────────────────────
// An SSP is a socioeconomic story, not a forcing level: ScenarioMIP runs each
// one at several forcing levels, so "the temperature of SSP2" is a range, not
// a number. The tool prints that range rather than inventing a single figure.

async function buildSspWarming() {
  const dir = resolve(INPUTS_DIR, 'IIASA_SSP/2026-MIP-CMIP7');
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find((f) => f.startsWith('climate_iamc_data-'));
  if (!file) return null;
  const rows = await readCsv(resolve(dir, file));
  const variable = 'Climate Assessment|Surface Temperature (GSAT)|Median [MAGICC v7.6.0a3]';
  const by = {};
  for (const r of rows) {
    if (r.variable !== variable) continue;
    const m = /SSP(\d)/.exec(r.scenario ?? '');
    const v = cell(r['2100']);
    if (!m || v == null) continue;
    (by[`SSP${m[1]}`] ??= []).push(v);
  }
  const out = {};
  for (const [ssp, vals] of Object.entries(by)) {
    vals.sort((a, b) => a - b);
    out[ssp] = {
      min: vals[0],
      median: vals[(vals.length - 1) >> 1],
      max: vals[vals.length - 1],
      runs: vals.length,
    };
  }
  return Object.keys(out).length ? out : null;
}

// ── Measured intensity trends ────────────────────────────────────────────────
// The 1988-2024 annual rate of change of each efficiency lever's intensity at
// world level, for the reference tick on its slider: 36 years, the span of the
// projection. Flows are UNEP DMC of the lever's materials per dollar of world
// GDP; stocks are MISO2 in-use stock of the lever's end uses per dollar.

async function buildIntensityHistory(years, worldFlows, gdpPop) {
  const FROM = 1988;
  const TO = 2024;
  const gy = gdpPop.years;
  const gdp = gdpPop.gdp.World;
  const g0 = gdp?.[gy.indexOf(FROM)];
  const g1 = gdp?.[gy.indexOf(TO)];
  if (!g0 || !g1) return null;
  const rate = (a, b) => (a > 0 && b > 0 ? num(Math.pow(b / g1 / (a / g0), 1 / (TO - FROM)) - 1) : null);

  const i0 = years.indexOf(FROM);
  const i1 = years.indexOf(TO);
  const flow = (names) => {
    let a = 0;
    let b = 0;
    for (const n of names) {
      a += worldFlows.materials[n]?.[i0] ?? 0;
      b += worldFlows.materials[n]?.[i1] ?? 0;
    }
    return rate(a, b);
  };

  const stockRows = await readCsv(sourceCsv('stock_trajectory_1970_2024.csv'));
  const stock = (material, uses) => {
    let a = 0;
    let b = 0;
    for (const r of stockRows) {
      if (r.material !== material || !uses.includes(r.end_use)) continue;
      const y = Number(r.year);
      const v = Number(r.stock_Mt);
      if (!Number.isFinite(v)) continue;
      if (y === FROM) a += v;
      else if (y === TO) b += v;
    }
    return rate(a, b);
  };

  return {
    from: FROM,
    to: TO,
    biomass: flow(['Crops', 'Grazed biomass and fodder crops', 'Wood']),
    fossil: flow(['Coal', 'Natural Gas', 'Petroleum']),
    metalStock: stock('Metal ores', ['buildings', 'civil_infrastructure', 'machinery', 'short_lived']),
    mineralStock: stock('Non-metallic minerals', ['buildings', 'civil_infrastructure']),
  };
}

// ── Monte Carlo envelope ─────────────────────────────────────────────────────
// The paper's 1,000 published draws, run back through the same model the
// explorer uses, so the spread drawn behind someone's own scenario is the
// paper's spread at whatever slice they are looking at. Quantiles are taken
// per measure: a ratio of medians is not the median of the ratio.

const ENVELOPE_QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];

function quantileSorted(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

async function buildEnvelope(modelInputs) {
  if (!modelInputs) return null;
  const matrixPath = sourceCsv('mc_input_matrix.csv');
  if (!existsSync(matrixPath)) {
    console.log('[build-materials] no mc_input_matrix.csv — skipping envelope');
    return null;
  }
  const draws = await readCsv(matrixPath);
  if (draws.length === 0) return null;

  const model = await import('../src/tools/materials/model.ts');
  const { runModel, defaultLevers, GROUP_KEYS } = model;

  // One draw becomes one parameter set exactly as 02-RunSimulations.R maps it:
  // intensity draws stay in [0,1], global scalars land semi-uniformly either
  // side of their central value.
  const semi = (name, u) => {
    const p = modelInputs.mcParams[name];
    return u < 0.5 ? p.min + 2 * u * (p.central - p.min) : p.central + 2 * (u - 0.5) * (p.max - p.central);
  };
  const leversFor = (row) => {
    const u = (k) => Number(row[k]);
    const levers = defaultLevers(modelInputs);
    levers.sspU = u('ssp_u');
    levers.flowIntensityU = {
      crops: u('intensity_crops_global'),
      grazed_biomass: u('intensity_grazed_biomass_global'),
      wood: u('intensity_wood_global'),
      coal: u('intensity_coal_global'),
      gas: u('intensity_gas_global'),
      oil: u('intensity_oil_global'),
    };
    levers.stockIntensityU = {
      metal_ores: {
        buildings: u('intensity_buildings_metalOres_global'),
        civil: u('intensity_civil_metalOres_global'),
        machinery: u('intensity_machinery_metalOres_global'),
        sl_products: u('intensity_sl_products_metalOres_global'),
      },
      nonmetallic_minerals: {
        buildings: u('intensity_buildings_nonMetallic_global'),
        civil: u('intensity_civil_nonMetallic_global'),
      },
    };
    levers.recyclingFe = semi('RECYCLING_RATE_FE', u('recycling_rate_fe'));
    levers.recyclingNonFe = semi('RECYCLING_RATE_NONFE', u('recycling_rate_nonfe'));
    levers.downcycling = semi('DOWNCYCLING', u('downcycling'));
    levers.gradeOreFe = semi('GRADE_ORE_FE', u('grade_ore_fe'));
    levers.gradeOreNonFe = semi('GRADE_ORE_NONFE', u('grade_ore_nonfe'));
    levers.targetYear = Math.round(semi('TARGET_YEAR', u('target_year')));
    levers.convergenceYear = Math.round(semi('RECYC_CONVERGENCE_YR', u('recyc_convergence_yr')));
    levers.maxSecondaryBuildCivil = semi('MAX_SECONDARY_BUILD_CIVIL', u('max_secondary_build_civil'));
    levers.maxSecondaryRoads = semi('MAX_SECONDARY_ROADS', u('max_secondary_roads'));
    levers.shareConcreteBuildings = semi('SHARE_CONCRETE_BUILDINGS', u('share_concrete_buildings'));
    levers.shareConcreteCivil = semi('SHARE_CONCRETE_CIVIL', u('share_concrete_civil'));
    levers.shareAggConcrete = semi('SHARE_AGG_CONCRETE', u('share_agg_concrete'));
    levers.shareGranularRoad = semi('SHARE_GRANULAR_ROAD', u('share_granular_road'));
    levers.lifetimeU = {
      buildings: { mean: u('lifetime_mean_buildings'), k: u('lifetime_k_buildings') },
      civil_infrastructure: {
        mean: u('lifetime_mean_civil_infrastructure'),
        k: u('lifetime_k_civil_infrastructure'),
      },
      machinery: { mean: u('lifetime_mean_machinery'), k: u('lifetime_k_machinery') },
      short_lived: { mean: u('lifetime_mean_short_lived'), k: u('lifetime_k_short_lived') },
    };
    return levers;
  };

  const places = ['World', ...modelInputs.regions];
  const groups = ['total', ...GROUP_KEYS];
  const measures = ['consumption', 'perCapita', 'intensity'];
  const nYears = modelInputs.years.length;

  // samples[place][group][measure][year] = one value per run
  const samples = {};
  for (const place of places) {
    samples[place] = {};
    for (const group of groups) {
      samples[place][group] = {};
      for (const measure of measures) {
        samples[place][group][measure] = Array.from({ length: nYears }, () => []);
      }
    }
  }

  const started = Date.now();
  let matCagrs = [];
  const scatter = { gdpGrowth: [], lever: {}, cagr: {} };
  for (const row of draws) {
    const run = runModel(modelInputs, leversFor(row));
    for (const place of places) {
      const world = place === 'World';
      const pop = world ? run.population : run.popByRegion[place];
      const gdp = world ? run.gdp : run.gdpByRegion[place];
      if (!pop || !gdp) continue;
      for (const group of groups) {
        const series =
          group === 'total'
            ? world
              ? run.primary.total
              : GROUP_KEYS.reduce((acc, g) => {
                  const s = run.primary.byRegionGroup[place]?.[g];
                  if (s) for (let i = 0; i < nYears; i++) acc[i] += s[i];
                  return acc;
                }, new Float64Array(nYears))
            : world
              ? run.primary.byGroup[group]
              : run.primary.byRegionGroup[place]?.[group];
        if (!series) continue;
        const bucket = samples[place][group];
        for (let i = 0; i < nYears; i++) {
          bucket.consumption[i].push(series[i]);
          bucket.perCapita[i].push((series[i] * 1e6) / pop[i]);
          bucket.intensity[i].push((series[i] * 1e9) / gdp[i]);
        }
      }
    }
    const t = run.primary.total;
    if (t[0] > 0 && t[nYears - 1] > 0) {
      matCagrs.push(Math.pow(t[nYears - 1] / t[0], 1 / (nYears - 1)) - 1);
    }

    // Where this run sits on every contour axis, and what it grew at — the
    // cloud of published runs the contour panels draw underneath the surface.
    const levers = leversFor(row);
    const blend = model.resolveSsp(modelInputs, levers.sspU);
    // Per person, to match the contour axis and the slider readout — not total
    // GDP, which grows faster because population does too.
    const gdp = run.gdp;
    const pop = run.population;
    const pc0 = gdp[0] / pop[0];
    const pc1 = gdp[nYears - 1] / pop[nYears - 1];
    scatter.gdpGrowth.push(round6(Math.pow(pc1 / pc0, 1 / (nYears - 1)) - 1));
    for (const lever of model.INTENSITY_LEVER_KEYS) {
      const spec = model.INTENSITY_LEVERS[lever];
      const u = spec.flows.length
        ? levers.flowIntensityU[spec.flows[0]]
        : levers.stockIntensityU[spec.stocks[0][0]][spec.stocks[0][1]];
      (scatter.lever[lever] ??= []).push(round6(model.leverWorldValue(modelInputs, lever, u, blend).value));
    }
    (scatter.lever.metalRecycling ??= []).push(round6((levers.recyclingFe + levers.recyclingNonFe) / 2));
    (scatter.lever.mineralDowncycling ??= []).push(round6(levers.downcycling));
    for (const g of [...GROUP_KEYS, 'total']) {
      const series = g === 'total' ? run.primary.total : run.primary.byGroup[g];
      const ok = series[0] > 0 && series[nYears - 1] > 0;
      (scatter.cagr[g] ??= []).push(
        ok ? round6(Math.pow(series[nYears - 1] / series[0], 1 / (nYears - 1)) - 1) : null,
      );
    }
  }

  const bands = {};
  for (const place of places) {
    bands[place] = {};
    for (const group of groups) {
      bands[place][group] = {};
      for (const measure of measures) {
        const out = { p05: [], p25: [], p50: [], p75: [], p95: [], min: [], max: [] };
        for (let i = 0; i < nYears; i++) {
          const sorted = samples[place][group][measure][i].slice().sort((a, b) => a - b);
          if (sorted.length === 0) continue;
          out.p05.push(round6(quantileSorted(sorted, 0.05)));
          out.p25.push(round6(quantileSorted(sorted, 0.25)));
          out.p50.push(round6(quantileSorted(sorted, 0.5)));
          out.p75.push(round6(quantileSorted(sorted, 0.75)));
          out.p95.push(round6(quantileSorted(sorted, 0.95)));
          out.min.push(round6(sorted[0]));
          out.max.push(round6(sorted[sorted.length - 1]));
        }
        bands[place][group][measure] = out;
      }
    }
  }

  matCagrs.sort((a, b) => a - b);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[build-materials] envelope: ${draws.length} published draws re-run in ${secs}s; ` +
      `world material growth ${(100 * matCagrs[0]).toFixed(2)}% to ${(100 * matCagrs[matCagrs.length - 1]).toFixed(2)}%/yr`,
  );

  return {
    years: modelInputs.years,
    runs: draws.length,
    quantiles: ENVELOPE_QUANTILES,
    bands,
    /** Sorted world material-growth rates, for "where does my scenario sit". */
    worldGrowth: matCagrs.map((v) => round6(v)),
    /** One point per published run, for the contour panels' background cloud. */
    scatter,
    growthShareAbove: round6(matCagrs.filter((v) => v > 0).length / matCagrs.length),
  };
}

async function run() {
  console.log('[build-materials] reading from:');
  console.log(`  parameters: ${PARAMETERS_DIR}`);
  console.log(`  results: ${RESULTS_DIR}`);
  console.log(`  processed (fallback): ${PROCESSED_DIR}`);

  // Read the world flows first so we can derive the canonical year axis from it.
  const worldRows = await readCsv(sourceCsv('materials_world_DMC.csv'));
  const regionRows = await readCsv(sourceCsv('materials_region_DMC.csv'));

  const meta = await buildMeta(worldRows, regionRows);
  const years = meta.years;

  const worldFlows = await buildWorldFlows(years);
  const regionFlows = await buildRegionFlows(years);
  const gdpPop = await buildGdpPop(years);
  const stocks2024 = await buildStocks2024();
  const sspDrivers = await buildSspDrivers(years, gdpPop);
  const extraFlows = await buildExtraFlows(years);
  const projections = await buildProjections();
  const sensitivity = await buildSensitivity();
  const modelInputs = await buildProjectionInputs();
  if (modelInputs) modelInputs.intensityHistRate = await buildIntensityHistory(years, worldFlows, gdpPop);
  const envelope = await buildEnvelope(modelInputs);
  const sspWarming = await buildSspWarming();

  await mkdir(OUT_DIR, { recursive: true });

  const outputs = [
    ['meta.json', meta],
    ['flows-world.json', worldFlows],
    ['flows-regions.json', regionFlows],
    ['gdp-pop.json', gdpPop],
    ['stocks-2024.json', stocks2024],
    ['ssp-drivers.json', sspDrivers],
    ...(projections ? [['projections.json', projections]] : []),
    ...(sensitivity ? [['sensitivity.json', sensitivity]] : []),
    ...(modelInputs ? [['model-inputs.json', modelInputs]] : []),
    ...(envelope ? [['envelope.json', envelope]] : []),
    ...(sspWarming ? [['ssp-warming.json', sspWarming]] : []),
  ];
  for (const [name, data] of outputs) {
    const path = resolve(OUT_DIR, name);
    const json = JSON.stringify(data);
    await writeFile(path, json, 'utf8');
    const kb = (json.length / 1024).toFixed(1);
    console.log(`[build-materials] wrote ${name}  (${kb} KB)`);
  }
  console.log(`[build-materials] done. ${outputs.length} eager files in ${OUT_DIR}`);

  // Lazy, but served from public/ rather than R2 — 5 accounts is a few hundred
  // KB, nothing like the 7 MB country layer.
  {
    const path = resolve(OUT_DIR, 'flows-extra.json');
    const json = JSON.stringify(extraFlows);
    await writeFile(path, json, 'utf8');
    console.log(
      `[build-materials] wrote flows-extra.json (${(json.length / 1024).toFixed(0)} KB, lazy) — ${LAZY_FLOWS.map((f) => f.id).join(', ')}`,
    );
  }

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
