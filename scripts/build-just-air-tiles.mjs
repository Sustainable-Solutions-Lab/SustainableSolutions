#!/usr/bin/env node
//
// Build PMTiles for the Just Air map tool.
//
// Inputs (Dropbox alias-resolved):
//   {SRC}/<City>/PM25_<City>_<scenario>_out.csv
//   {SRC}/<City>/benmap_<City>_<scenario>_out.csv
//   {SRC}/<City>/demographic_income_<City>.csv
//   {SRC}/<City>/demographic_percent_white_<City>.csv
//   {SRC}/CONUS/PM25_CONUS_2050<scenario>_out.csv
//   {SRC}/CONUS/benmap_CONUS_2050<scenario>_out.csv
//   {SRC}/CONUS/population_CONUS.csv
// where <City> in 15 metros, <scenario> in {highCDR, lowCDR} for cities,
// and {HighCDR, LowCDR, REF} for CONUS.
//
// Output (in dist-tiles/just-air/):
//   just-air.pmtiles               single tileset, source-layer "just-air"
//   just-air-cities.json           city bbox + label manifest (committed)
//
// FEATURE MODEL
// ─────────────
// Every feature is a Point at its cell centroid carrying:
//   pixel_id?, city?, _scale, lng, lat,
//   pm25_low, pm25_high, pm25_ref, pm25_diff,    (µg/m³)
//   mort_low, mort_high, mort_ref, mort_diff,    (deaths/cell)
//   population,                                  (people/cell, when known)
//   income, percent_white                        (city-tier only)
//
// _scale is the cell side length in km. It drives the circle-radius
// expression in the renderer (see src/tools/map/lib/use-just-air-layers.js):
//
//   _scale = 1   native city pixel                 visible z 8-14
//   _scale = 9   synthetic national 9 km cell      visible z 5-11
//   _scale = 36  4×4 supercell aggregation         visible z 0-6
//
// Each scale lives at its appropriate zoom band; bands overlap by ~1 zoom
// step so transitions feel like a cross-fade rather than a hard cut.
//
// Run from repo root:  node scripts/build-just-air-tiles.mjs
//
// Requires: tippecanoe, pmtiles on PATH.

import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC = '/Users/stevedavis/Library/CloudStorage/Dropbox/Papers/In Press/Just CDR (w Cande)/Outputs for map app';
const OUT_DIR = resolve(REPO_ROOT, 'dist-tiles/just-air');
const MANIFEST_OUT = resolve(REPO_ROOT, 'public/tools/just-air/just-air-cities.json');
const DISTRIBUTIONS_OUT = resolve(REPO_ROOT, 'public/tools/just-air/distributions.json');
const US_STATES_GEOJSON = resolve(REPO_ROOT, 'public/us-states.geojson');

// ── CONUS clipping ──────────────────────────────────────────────────────────
//
// Load the 48-state GeoJSON once. Each state polygon is wrapped in its own
// turf feature so booleanPointInPolygon can be called against it; we also
// pre-compute bbox for each so the per-cell check can short-circuit before
// running the (more expensive) ray-casting.
let CONUS_FEATURES = null;
async function loadConusFeatures() {
  if (CONUS_FEATURES) return CONUS_FEATURES;
  const text = await fs.readFile(US_STATES_GEOJSON, 'utf8');
  const fc = JSON.parse(text);
  CONUS_FEATURES = fc.features.map((f) => ({ feature: f, bbox: bbox(f) }));
  return CONUS_FEATURES;
}

function isInsideConus(lng, lat) {
  // turf's bbox is [west, south, east, north]; reject early if outside any
  // state bbox before doing the polygon test.
  for (const { feature, bbox: b } of CONUS_FEATURES) {
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    if (booleanPointInPolygon([lng, lat], feature)) return true;
  }
  return false;
}

const CITIES = [
  'Atlanta', 'Boston', 'Chicago', 'Dallas', 'DC', 'Detroit', 'Houston',
  'LA', 'Miami', 'NY', 'Philadelphia', 'Phoenix', 'Riverside', 'Seattle', 'SF',
];

const SCENARIOS = [
  { id: 'highCDR', short: 'high' },
  { id: 'lowCDR',  short: 'low'  },
];

// ── CSV / R-geometry parsing ────────────────────────────────────────────────

function* csvRows(text) {
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); yield row; row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); yield row; }
}

// R-style "list(c(lng1,lng2,...,lngN,lat1,lat2,...,latN))" → GeoJSON ring.
function parseRingFromR(s) {
  if (!s) return null;
  const m = s.match(/list\(c\(([\s\S]+?)\)\)/);
  if (!m) return null;
  const nums = m[1].split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
  if (nums.length < 6 || nums.length % 2 !== 0) return null;
  const half = nums.length / 2;
  const lngs = nums.slice(0, half);
  const lats = nums.slice(half);
  const ring = lngs.map((lng, i) => [lng, lats[i]]);
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

async function readCsvRows(path) {
  const text = await fs.readFile(path, 'utf8');
  const rows = [];
  let header = null;
  for (const r of csvRows(text)) {
    if (!header) { header = r.map((c) => c.replace(/^"|"$/g, '')); continue; }
    if (r.length < header.length) continue;
    // R exports the geometry column unquoted; inner commas explode into many
    // CSV cells. Re-join everything from the last expected column onward.
    const obj = {};
    for (let i = 0; i < header.length - 1; i++) obj[header[i]] = r[i];
    obj[header[header.length - 1]] = r.slice(header.length - 1).join(',');
    rows.push(obj);
  }
  return rows;
}

// ── Per-city load + merge ───────────────────────────────────────────────────

async function loadCity(city) {
  const cityDir = join(SRC, city);
  if (!existsSync(cityDir)) {
    console.warn(`  ${city}: directory missing, skipping`);
    return null;
  }
  const byPixel = new Map();
  for (const { id, short } of SCENARIOS) {
    for (const kind of ['PM25', 'benmap']) {
      const path = join(cityDir, `${kind}_${city}_${id}_out.csv`);
      if (!existsSync(path)) {
        console.warn(`    missing ${basename(path)}`);
        continue;
      }
      const rows = await readCsvRows(path);
      const valueCol = kind === 'PM25' ? 'Values' : 'Mortality';
      const targetCol = `${kind === 'PM25' ? 'pm25' : 'mort'}_${short}`;
      for (const r of rows) {
        const pid = r.pixel_ID;
        const val = Number(r[valueCol]);
        if (!Number.isFinite(val)) continue;
        let pix = byPixel.get(pid);
        if (!pix) {
          const ring = parseRingFromR(r.geometry);
          if (!ring) continue;
          const corners = ring.slice(0, 4);
          const lng = corners.reduce((s, p) => s + p[0], 0) / corners.length;
          const lat = corners.reduce((s, p) => s + p[1], 0) / corners.length;
          pix = {
            pixel_id: pid,
            row: Number(r.Row),
            col: Number(r.Column),
            ring, lng, lat,
          };
          byPixel.set(pid, pix);
        }
        pix[targetCol] = val;
      }
    }
  }

  // Demographics — income and percent non-Hispanic white. The percent_white
  // file also carries per-pixel Population, which the other city files lack.
  const incomePath = join(cityDir, `demographic_income_${city}.csv`);
  if (existsSync(incomePath)) {
    const rows = await readCsvRows(incomePath);
    for (const r of rows) {
      const pix = byPixel.get(r.pixel_ID);
      if (!pix) continue;
      const v = Number(r.value);
      if (Number.isFinite(v)) pix.income = v;
    }
  }
  const whitePath = join(cityDir, `demographic_percent_white_${city}.csv`);
  if (existsSync(whitePath)) {
    const rows = await readCsvRows(whitePath);
    for (const r of rows) {
      const pix = byPixel.get(r.pixel_ID);
      if (!pix) continue;
      const v = Number(r.value);
      const pop = Number(r.Population);
      if (Number.isFinite(v)) pix.percent_white = v;
      if (Number.isFinite(pop)) pix.population = pop;
    }
  }

  // Clip out city pixels that fall outside the CONUS state polygons. The
  // input model grid often extends a short distance past the coastline
  // (NY harbour, Long Island Sound, Chesapeake Bay, etc.); without this
  // those pixels render as cells offshore of every state outline.
  for (const [pid, pix] of byPixel) {
    if (!isInsideConus(pix.lng, pix.lat)) byPixel.delete(pid);
  }

  return { city, pixels: byPixel };
}

// ── Feature emission helpers ────────────────────────────────────────────────

function round(n, places) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

// tippecanoe respects an inline `tippecanoe: { minzoom, maxzoom }` key on
// each feature and uses it instead of the global -Z/-z range. We exploit
// that to confine each scale to its own zoom band so tippecanoe's
// drop-densest sampling doesn't strip the coarser scales out at low zoom.
function makePoint(lng, lat, props, tcZoom) {
  const f = {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Point', coordinates: [round(lng, 5), round(lat, 5)] },
  };
  if (tcZoom) f.tippecanoe = tcZoom;
  return f;
}

function cityPixelToPoint(p, city) {
  if (p.pm25_low == null || p.pm25_high == null || p.mort_low == null || p.mort_high == null) {
    return null;
  }
  const props = {
    _scale: 1,
    pixel_id: p.pixel_id,
    city,
    pm25_low:  round(p.pm25_low, 3),
    pm25_high: round(p.pm25_high, 3),
    pm25_diff: round(p.pm25_high - p.pm25_low, 3),
    mort_low:  round(p.mort_low, 6),
    mort_high: round(p.mort_high, 6),
    mort_diff: round(p.mort_high - p.mort_low, 6),
  };
  if (p.income != null)        props.income        = round(p.income, 0);
  if (p.percent_white != null) props.percent_white = round(p.percent_white, 1);
  if (p.population != null)    props.population    = round(p.population, 1);
  // 1 km city pixels appear from z=7 onward — the 3 km bins own z=6 only,
  // then hand off to native resolution.
  return makePoint(p.lng, p.lat, props, { minzoom: 7, maxzoom: 14 });
}

// ── Real CONUS 9 km grid loader ─────────────────────────────────────────────
//
// Reads the seven CONUS-scale CSVs in {SRC}/CONUS/ and joins them by pixel_ID
// into one cell record per pixel. Returns cells with the shape expected by
// nationalCellToPoint and the aggregators downstream (lng, lat, row, col,
// plus per-scenario PM2.5/mortality and population).
//
// The Row/Column columns in the source CSVs are the native modeling grid
// indices, so we use them directly for 2×2 / 4×4 aggregation rather than
// re-deriving from lat/lon — that keeps blocks square in the source grid
// space, even though the grid itself is slightly rotated in geographic
// coordinates.

const CONUS_DIR = join(SRC, 'CONUS');

async function loadConusGrid() {
  const byPixel = new Map();

  // `divisor` lets us convert per-cell counts (deaths/cell, people/cell)
  // into per-km² densities so the units match the city tier (which is
  // already on a 1 km grid, so its raw values are already per km²).
  // Each CONUS source pixel is ~9 km × 9 km = 81 km², so we divide by 81
  // when reading mortality and population. PM₂.₅ is already an intensive
  // measurement (concentration µg/m³), no division.
  async function joinFile(fname, valueCol, targetCol, divisor = 1) {
    const path = join(CONUS_DIR, fname);
    if (!existsSync(path)) {
      console.warn(`  CONUS: missing ${fname}`);
      return;
    }
    const rows = await readCsvRows(path);
    for (const r of rows) {
      const pid = r.pixel_ID;
      let pix = byPixel.get(pid);
      if (!pix) {
        const ring = parseRingFromR(r.geometry);
        if (!ring) continue;
        const corners = ring.slice(0, 4);
        const lng = corners.reduce((s, p) => s + p[0], 0) / corners.length;
        const lat = corners.reduce((s, p) => s + p[1], 0) / corners.length;
        pix = {
          pixel_id: pid,
          row: Number(r.Row),
          col: Number(r.Column),
          lng, lat,
        };
        byPixel.set(pid, pix);
      }
      const v = Number(r[valueCol]);
      if (Number.isFinite(v)) pix[targetCol] = v / divisor;
    }
  }

  const CELL_AREA_KM2 = 81; // each CONUS source pixel is ≈9 km × 9 km

  await joinFile('PM25_CONUS_2050LowCDR_out.csv',   'Values',     'pm25_low');
  await joinFile('PM25_CONUS_2050HighCDR_out.csv',  'Values',     'pm25_high');
  await joinFile('PM25_CONUS_2050REF_out.csv',      'Values',     'pm25_ref');
  await joinFile('benmap_CONUS_2050LowCDR_out.csv', 'Mortality',  'mort_low',   CELL_AREA_KM2);
  await joinFile('benmap_CONUS_2050HighCDR_out.csv','Mortality',  'mort_high',  CELL_AREA_KM2);
  await joinFile('benmap_CONUS_2050REF_out.csv',    'Mortality',  'mort_ref',   CELL_AREA_KM2);
  await joinFile('population_CONUS.csv',            'Population', 'population', CELL_AREA_KM2);

  return Array.from(byPixel.values());
}

// Tag each 9 km cell with a different tippecanoe zoom range depending on
// whether its centroid falls inside any of the 15 metro bboxes. Cells inside
// a bbox stop emitting at z6 so the 3 km / 1 km city tiers take over without
// the user seeing both sizes layered over the same area. Cells outside every
// bbox keep emitting all the way to z14 so rural areas still show 9 km
// coverage when the user zooms in there.
// Fields carried through every national tier (9 / 18 / 36 km). The diffs
// (pm25_diff, mort_diff) are derived post-aggregation rather than averaged,
// so they remain a true high − low at the aggregated cell rather than the
// mean of underlying diffs (which would differ if any pixel was missing
// either scenario).
const NATIONAL_FIELDS = [
  'pm25_low', 'pm25_high', 'pm25_ref',
  'mort_low', 'mort_high', 'mort_ref',
  'population',
];

function fieldDecimals(name) {
  if (name.startsWith('mort')) return 8;
  if (name.startsWith('pm25')) return 2;
  if (name === 'population')   return 1;
  if (name === 'income')       return 0;
  if (name === 'percent_white')return 1;
  return 3;
}

// Returns true if a CONUS-grid cell looks like a "no data" sentinel from
// the source CMAQ-style model output — zero PM₂.₅ across every scenario.
// Cells with population > 0 can still be sentinels (e.g. narrow coastal
// strips where the model didn't run); we drop them to avoid the dark
// navy circles that BuRd(0) renders for v=0 in the diverging PM map.
function isNoDataCell(c) {
  const low  = c.pm25_low  ?? 0
  const high = c.pm25_high ?? 0
  const ref  = c.pm25_ref  ?? 0
  return low === 0 && high === 0 && ref === 0
}

function nationalCellToPoint(c, cityBboxes, isCityCovered) {
  // 9 km cells everywhere from z=5 — *except* cells that fall inside the
  // footprint of high-resolution city pixels, which are capped at z=5 so
  // they vanish at z=6 once the 3 km city bins are visible. The result
  // at z≥6 inside metros: 3 km bins where city pixels exist, 9 km cells
  // filling the gaps (water edges, bbox margins, etc.) with no halo
  // overlap between the two scales.
  const tcZoom = isCityCovered ? { minzoom: 5, maxzoom: 5 } : { minzoom: 5 };
  const props = { _scale: 9 };
  for (const f of NATIONAL_FIELDS) {
    if (c[f] != null && Number.isFinite(c[f])) props[f] = round(c[f], fieldDecimals(f));
  }
  if (props.pm25_high != null && props.pm25_low != null) {
    props.pm25_diff = round(props.pm25_high - props.pm25_low, 2);
  }
  if (props.mort_high != null && props.mort_low != null) {
    props.mort_diff = round(props.mort_high - props.mort_low, 8);
  }
  return makePoint(c.lng, c.lat, props, tcZoom);
}

function pointInAnyBbox(lng, lat, bboxes) {
  for (const b of bboxes) {
    if (lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]) return true;
  }
  return false;
}

// ── 3 km aggregation of native city pixels ──────────────────────────────────
//
// Bin every city's pixels into ~3 km cells (0.03° in lat / lng — accurate to
// ~1% at mid-latitudes, fine for visual aggregation). One emitted feature per
// bin carries the mean of the underlying pixels and `_scale = 3`. tippecanoe
// keeps these at zoom 5–10 so they bridge the 9 km national surface and the
// native 1 km city pixels rather than the user having to zoom all the way in
// before any city-scale detail appears.

const CITY_FIELDS = [
  'pm25_low', 'pm25_high',
  'mort_low', 'mort_high',
  'income', 'percent_white', 'population',
];

function aggregateCityTo3km(pixels, city) {
  // Bin by source-grid Row/Column rather than degrees so the resulting
  // 3 km cells form a regular grid in projected (Lambert) space —
  // matching how the 9/18/36 km national tiers are built. Degree-binning
  // produced scattered empty cells inside cities because the 1 km source
  // grid doesn't align cleanly with degree boundaries.
  const BLOCK = 3;
  const bins = new Map();
  for (const p of pixels.values()) {
    if (p.pm25_low == null || p.pm25_high == null || p.mort_low == null || p.mort_high == null) {
      continue;
    }
    if (!Number.isFinite(p.row) || !Number.isFinite(p.col)) continue;
    const bx = Math.floor(p.col / BLOCK);
    const by = Math.floor(p.row / BLOCK);
    const key = `${bx}:${by}`;
    let b = bins.get(key);
    if (!b) {
      b = { lng: 0, lat: 0, n: 0, sums: {}, counts: {} };
      bins.set(key, b);
    }
    b.lng += p.lng; b.lat += p.lat; b.n++;
    for (const f of CITY_FIELDS) {
      const v = p[f];
      if (v != null && Number.isFinite(v)) {
        b.sums[f] = (b.sums[f] ?? 0) + v;
        b.counts[f] = (b.counts[f] ?? 0) + 1;
      }
    }
  }
  const out = [];
  for (const b of bins.values()) {
    const n = b.n;
    const props = { _scale: 3, city };
    for (const f of CITY_FIELDS) {
      if (b.counts[f] > 0) {
        props[f] = round(b.sums[f] / b.counts[f], f.startsWith('pm25') ? 3 : f.startsWith('mort') ? 6 : fieldDecimals(f));
      }
    }
    if (props.pm25_high != null && props.pm25_low != null) {
      props.pm25_diff = round(props.pm25_high - props.pm25_low, 3);
    }
    if (props.mort_high != null && props.mort_low != null) {
      props.mort_diff = round(props.mort_high - props.mort_low, 6);
    }
    // 3 km city bins: in z=5 and z=6 tiles only (layer gates display at
    // z=6). At z=7, the 1 km native pixels take over, so the 3 km tier
    // doesn't need to be in z=7 tiles.
    out.push(makePoint(b.lng / n, b.lat / n, props, { minzoom: 5, maxzoom: 6 }));
  }
  return out;
}

// ── 2×2 mid-tier aggregation of the 9 km national grid (≈18 km) ─────────────
//
// Bridges the 36 km supercells (z 2–3) and the 9 km national grid (z 4+).
// Without this tier, the user saw a near-empty z=4 frame as supercells faded
// out before the 9 km grid registered as visible. Emitted at z 3–4 only.

function aggregate18km(cells) {
  return aggregateSupercells(cells, 2).map((f) => {
    f.properties._scale = 18;
    // Only z=4 — the 36 km supercells own z=3, the 9 km grid owns z=5+.
    f.tippecanoe = { minzoom: 4, maxzoom: 4 };
    return f;
  });
}

// ── 4×4 supercell aggregation of the 9 km national grid ─────────────────────
//
// Group the 9 km cells into 4×4 blocks (≈36 km). For each block emit one
// Point at the block centroid with field means. These supercells are the
// only thing tippecanoe keeps at very low zooms (z<6).

function aggregateSupercells(cells, blockSize = 4) {
  const blocks = new Map();
  for (const c of cells) {
    const br = Math.floor(c.row / blockSize);
    const bc = Math.floor(c.col / blockSize);
    const key = `${br}:${bc}`;
    let block = blocks.get(key);
    if (!block) {
      block = { lng: 0, lat: 0, n: 0, sums: {}, counts: {} };
      blocks.set(key, block);
    }
    block.lng += c.lng; block.lat += c.lat; block.n++;
    for (const f of NATIONAL_FIELDS) {
      const v = c[f];
      if (v != null && Number.isFinite(v)) {
        block.sums[f] = (block.sums[f] ?? 0) + v;
        block.counts[f] = (block.counts[f] ?? 0) + 1;
      }
    }
  }
  const out = [];
  for (const b of blocks.values()) {
    const n = b.n;
    const props = { _scale: 36 };
    for (const f of NATIONAL_FIELDS) {
      if (b.counts[f] > 0) props[f] = round(b.sums[f] / b.counts[f], fieldDecimals(f));
    }
    if (props.pm25_high != null && props.pm25_low != null) {
      props.pm25_diff = round(props.pm25_high - props.pm25_low, 2);
    }
    if (props.mort_high != null && props.mort_low != null) {
      props.mort_diff = round(props.mort_high - props.mort_low, 8);
    }
    out.push(makePoint(b.lng / n, b.lat / n, props, { minzoom: 2, maxzoom: 3 }));
  }
  return out;
}

// ── Build pipeline ──────────────────────────────────────────────────────────

function run(cmd, args) {
  console.log('  $', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} failed with status ${r.status}`);
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`SOURCE not found: ${SRC}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(MANIFEST_OUT), { recursive: true });

  await loadConusFeatures();
  console.log(`Loaded CONUS clip mask: ${CONUS_FEATURES.length} state polygons`);

  const mergedGeoJson = join(OUT_DIR, 'just-air.geojsonl');
  const fh = await fs.open(mergedGeoJson, 'w');

  // ── Cities ─────────────────────────────────────────────────────────────
  // Also build a spatial index of every emitted city-pixel centroid so the
  // national 9 km emission loop below can suppress cells that fall inside
  // high-resolution coverage. Bucket size = 0.04° (~4 km); we test a 3×3
  // neighborhood per national cell so any city pixel within ~5 km of the
  // 9 km cell centroid flags it as covered.
  const COVERAGE_BUCKET = 0.04;
  const cityCoverage = new Set();
  function addCoverage(lng, lat) {
    cityCoverage.add(`${Math.floor(lng / COVERAGE_BUCKET)}:${Math.floor(lat / COVERAGE_BUCKET)}`);
  }
  function isCityCovered(lng, lat) {
    const cx = Math.floor(lng / COVERAGE_BUCKET);
    const cy = Math.floor(lat / COVERAGE_BUCKET);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (cityCoverage.has(`${cx + dx}:${cy + dy}`)) return true;
      }
    }
    return false;
  }

  console.log('Loading cities…');
  const manifest = [];
  let cityCount = 0;
  // Collect city-pixel values for the demographic layers' nationwide
  // distribution chart. Population is included from both the city tier
  // and the CONUS 9 km tier later; income / percent_white only exist on
  // city pixels.
  const cityValuesAll = { income: [], percent_white: [] };
  for (const city of CITIES) {
    const result = await loadCity(city);
    if (!result) continue;
    const { pixels } = result;
    let minLng =  Infinity, minLat =  Infinity, maxLng = -Infinity, maxLat = -Infinity;
    let n = 0;
    for (const p of pixels.values()) {
      const f = cityPixelToPoint(p, city);
      if (!f) continue;
      await fh.write(JSON.stringify(f) + '\n');
      const [lng, lat] = f.geometry.coordinates;
      addCoverage(lng, lat);
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      if (p.income != null && Number.isFinite(p.income)) cityValuesAll.income.push(p.income);
      if (p.percent_white != null && Number.isFinite(p.percent_white)) cityValuesAll.percent_white.push(p.percent_white);
      n++;
    }
    cityCount += n;

    // 3 km city aggregation tier — bridges 9 km national → 1 km city pixels.
    const cityAgg = aggregateCityTo3km(pixels, city);
    for (const f of cityAgg) await fh.write(JSON.stringify(f) + '\n');

    manifest.push({
      slug: city.toLowerCase(),
      label: city,
      bbox: [round(minLng, 4), round(minLat, 4), round(maxLng, 4), round(maxLat, 4)],
      pixels: n,
    });
    console.log(`  ${city.padEnd(14)} ${n.toString().padStart(6)} pixels  +${cityAgg.length} 3 km bins`);
  }
  console.log(`Cities total: ${cityCount} pixel features`);
  await fs.writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2));
  console.log(`Manifest      → ${MANIFEST_OUT}`);

  // ── National 9 km (CONUS-clipped, metro-tagged) ────────────────────────
  // Generate the regular grid, drop cells outside the 48 state polygons, and
  // tag each remaining cell with a tippecanoe zoom range that depends on
  // whether its centroid falls inside any of the 15 metro bboxes computed
  // above. The bbox set is the same one used to render the box overlay, so
  // the tile-level filtering lines up exactly with what the user sees on
  // the map.
  console.log('Loading real CONUS 9 km grid (joined PM25 + benmap + population)…');
  const cityBboxesForFilter = manifest.map((m) => m.bbox);
  const nationalCellsAll = await loadConusGrid();
  // Drop cells outside CONUS and cells that look like "no data" sentinels
  // (PM₂.₅ = 0 across every scenario — common along coastlines and the
  // grid's outer edge). The latter were rendering as dark navy circles in
  // the BuRd-diverging PM map.
  const nationalCells = nationalCellsAll.filter((c) => isInsideConus(c.lng, c.lat) && !isNoDataCell(c));
  const droppedNoData = nationalCellsAll.filter((c) => isInsideConus(c.lng, c.lat) && isNoDataCell(c)).length;
  let inMetroCount = 0;
  let coveredCount = 0;
  for (const c of nationalCells) {
    const insideMetro = pointInAnyBbox(c.lng, c.lat, cityBboxesForFilter);
    if (insideMetro) inMetroCount++;
    const covered = insideMetro && isCityCovered(c.lng, c.lat);
    if (covered) coveredCount++;
    await fh.write(JSON.stringify(nationalCellToPoint(c, cityBboxesForFilter, covered)) + '\n');
  }
  console.log(`National 9 km: ${nationalCells.length} cells  (dropped ${nationalCellsAll.length - nationalCells.length - droppedNoData} non-CONUS, ${droppedNoData} no-data sentinels, ${inMetroCount} inside metro bboxes — of which ${coveredCount} city-covered → capped at z=5)`);

  // ── National 18 km mid tier (CONUS-clipped) ────────────────────────────
  // Bridges supercells → 9 km grid so z=4 is never blank.
  console.log('Aggregating to 18 km mid tier…');
  const mid18All = aggregate18km(nationalCells);
  const mid18 = mid18All.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return isInsideConus(lng, lat);
  });
  for (const f of mid18) await fh.write(JSON.stringify(f) + '\n');
  console.log(`National 18 km: ${mid18.length} cells  (dropped ${mid18All.length - mid18.length} non-CONUS)`);

  // ── National 36 km supercells (CONUS-clipped) ──────────────────────────
  console.log('Aggregating to 36 km supercells…');
  const supercellsAll = aggregateSupercells(nationalCells);
  const supercells = supercellsAll.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return isInsideConus(lng, lat);
  });
  for (const f of supercells) await fh.write(JSON.stringify(f) + '\n');
  console.log(`National 36 km: ${supercells.length} supercells  (dropped ${supercellsAll.length - supercells.length} non-CONUS)`);

  await fh.close();
  console.log(`Merged GeoJSONL → ${mergedGeoJson}`);

  // ── Nationwide value-distribution snapshots ────────────────────────────
  // The sidebar's distribution chart reads this JSON instead of
  // querySourceFeatures-on-the-fly so the histogram represents the full
  // CONUS distribution and stays stable as the user pans / zooms. Each
  // variable gets up to TARGET_SAMPLE values, evenly-strided across the
  // source population so the shape of the distribution is preserved.
  console.log('Computing nationwide distributions…');
  const TARGET_SAMPLE = 12000;
  function evenSample(values, n) {
    if (values.length <= n) return [...values];
    const step = values.length / n;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = values[Math.floor(i * step)];
    return out;
  }
  function collectNational(field) {
    const out = [];
    for (const c of nationalCells) {
      const v = c[field];
      if (v != null && Number.isFinite(v)) out.push(v);
    }
    return out;
  }
  function collectNationalDiff(low, high) {
    const out = [];
    for (const c of nationalCells) {
      if (c[low] != null && c[high] != null && Number.isFinite(c[low]) && Number.isFinite(c[high])) {
        out.push(c[high] - c[low]);
      }
    }
    return out;
  }
  const distributions = {
    pm25_low:      evenSample(collectNational('pm25_low'),  TARGET_SAMPLE),
    pm25_high:     evenSample(collectNational('pm25_high'), TARGET_SAMPLE),
    pm25_diff:     evenSample(collectNationalDiff('pm25_low', 'pm25_high'), TARGET_SAMPLE),
    mort_low:      evenSample(collectNational('mort_low'),  TARGET_SAMPLE),
    mort_high:     evenSample(collectNational('mort_high'), TARGET_SAMPLE),
    mort_diff:     evenSample(collectNationalDiff('mort_low', 'mort_high'), TARGET_SAMPLE),
    population:    evenSample(collectNational('population'), TARGET_SAMPLE),
    income:        evenSample(cityValuesAll.income,         TARGET_SAMPLE),
    percent_white: evenSample(cityValuesAll.percent_white,  TARGET_SAMPLE),
  };
  // Round to short decimals so the JSON stays compact.
  for (const k of Object.keys(distributions)) {
    const dec = k.startsWith('mort') ? 5 : k.startsWith('pm25') ? 2 : k === 'population' ? 1 : k === 'income' ? 0 : 1;
    distributions[k] = distributions[k].map((v) => round(v, dec));
  }
  await fs.writeFile(DISTRIBUTIONS_OUT, JSON.stringify(distributions));
  const totalVals = Object.values(distributions).reduce((s, a) => s + a.length, 0);
  console.log(`Distributions → ${DISTRIBUTIONS_OUT}  (${totalVals.toLocaleString()} values)`);

  // ── Tippecanoe → mbtiles → PMTiles ─────────────────────────────────────
  // -Z2 -z14: full zoom range. drop-densest-as-needed keeps the sparser
  // (coarser) features at low zoom and lets the dense city points appear
  // only once tile size permits — naturally producing the LOD cascade.
  console.log('Running tippecanoe…');
  const mbt = join(OUT_DIR, 'just-air.mbtiles');
  run('tippecanoe', [
    '-o', mbt, '--force',
    '-l', 'just-air',
    '-Z', '2', '-z', '14',
    '--drop-densest-as-needed',
    '--no-feature-limit', '--no-tile-size-limit',
    mergedGeoJson,
  ]);

  console.log('Converting → PMTiles…');
  const pmt = mbt.replace(/\.mbtiles$/, '.pmtiles');
  run('pmtiles', ['convert', mbt, pmt, '--force']);
  const stat = await fs.stat(pmt);
  console.log(`  ${basename(pmt)} ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

  console.log('\nDone. Upload this file to R2:');
  console.log(`  ${pmt}`);
  console.log(`  Target URL: https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/just-air.pmtiles`);
}

main().catch((e) => { console.error(e); process.exit(1); });
