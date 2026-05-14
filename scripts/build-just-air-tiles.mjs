#!/usr/bin/env node
//
// Build PMTiles for the Just Air map tool.
//
// Inputs (Dropbox alias-resolved):
//   {SRC}/<City>/PM25_<City>_<scenario>_out.csv
//   {SRC}/<City>/benmap_<City>_<scenario>_out.csv
//   where <City> in 15 metros, <scenario> in {highCDR, lowCDR}.
//
// Output (in dist-tiles/just-air/):
//   just-air.pmtiles               single tileset, source-layer "just-air"
//   just-air-cities.json           city bbox + label manifest (committed)
//
// FEATURE MODEL
// ─────────────
// Every feature is a Point at its cell centroid carrying:
//   pixel_id?, city?, _scale, lng, lat,
//   pm25_low, pm25_high, pm25_diff,        (µg/m³)
//   mort_low, mort_high, mort_diff,        (deaths/cell)
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
          pix = { pixel_id: pid, ring, lng, lat };
          byPixel.set(pid, pix);
        }
        pix[targetCol] = val;
      }
    }
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
  return makePoint(p.lng, p.lat, {
    _scale: 1,
    pixel_id: p.pixel_id,
    city,
    pm25_low:  round(p.pm25_low, 3),
    pm25_high: round(p.pm25_high, 3),
    pm25_diff: round(p.pm25_high - p.pm25_low, 3),
    mort_low:  round(p.mort_low, 6),
    mort_high: round(p.mort_high, 6),
    mort_diff: round(p.mort_high - p.mort_low, 6),
  }, { minzoom: 9, maxzoom: 14 });
}

// ── Synthetic 9 km CONUS national grid (centroids) ──────────────────────────

function syntheticNational() {
  const bbox = { minLng: -125, maxLng: -66, minLat: 24, maxLat: 50 };
  const dLat = 0.09, dLng = 0.10;
  // Pre-position "urban-ish" centers for plausible PM₂.₅ gradient.
  const centers = [
    { lng: -118.2, lat: 34.0, w: 6 },
    { lng: -73.9,  lat: 40.7, w: 7 },
    { lng: -87.6,  lat: 41.9, w: 5 },
    { lng: -95.4,  lat: 29.8, w: 5 },
    { lng: -84.4,  lat: 33.8, w: 4 },
    { lng: -97.0,  lat: 32.8, w: 4 },
    { lng: -75.2,  lat: 39.95, w: 4 },
    { lng: -122.4, lat: 47.6, w: 3 },
    { lng: -122.4, lat: 37.8, w: 4 },
    { lng: -80.2,  lat: 25.8, w: 3 },
    { lng: -77.0,  lat: 38.9, w: 4 },
    { lng: -83.0,  lat: 42.3, w: 3 },
    { lng: -71.1,  lat: 42.4, w: 4 },
    { lng: -112.1, lat: 33.5, w: 3 },
    { lng: -117.4, lat: 33.9, w: 3 },
  ];
  // Return cells keyed by integer grid index so the supercell aggregator can
  // index them in O(1) without re-deriving floor()s downstream.
  const cells = [];
  let id = 0;
  let row = 0;
  for (let lat = bbox.minLat; lat < bbox.maxLat; lat += dLat, row++) {
    let col = 0;
    for (let lng = bbox.minLng; lng < bbox.maxLng; lng += dLng, col++) {
      let pm25_low = 5;
      for (const c of centers) {
        const dx = (lng - c.lng) * Math.cos((lat * Math.PI) / 180);
        const dy = (lat - c.lat);
        const r2 = dx * dx + dy * dy;
        pm25_low += c.w * Math.exp(-r2 / 2.0);
      }
      const noise = (Math.sin(id * 1.7) + Math.sin(id * 0.31)) * 0.15;
      const pm25_high = Math.max(2.5, pm25_low * (0.78 + noise * 0.04));
      const mort_low = pm25_low * 0.000003;
      const mort_high = pm25_high * 0.000003;
      cells.push({
        row, col,
        lng: lng + dLng / 2,
        lat: lat + dLat / 2,
        pm25_low, pm25_high,
        mort_low, mort_high,
      });
      id++;
    }
  }
  return cells;
}

// Tag each 9 km cell with a different tippecanoe zoom range depending on
// whether its centroid falls inside any of the 15 metro bboxes. Cells inside
// a bbox stop emitting at z6 so the 3 km / 1 km city tiers take over without
// the user seeing both sizes layered over the same area. Cells outside every
// bbox keep emitting all the way to z14 so rural areas still show 9 km
// coverage when the user zooms in there.
function nationalCellToPoint(c, cityBboxes) {
  const insideMetro = pointInAnyBbox(c.lng, c.lat, cityBboxes);
  const tcZoom = insideMetro
    ? { minzoom: 4, maxzoom: 6 }
    : { minzoom: 4 };  // omit maxzoom — emit at every zoom level
  return makePoint(c.lng, c.lat, {
    _scale: 9,
    pm25_low:  round(c.pm25_low, 2),
    pm25_high: round(c.pm25_high, 2),
    pm25_diff: round(c.pm25_high - c.pm25_low, 2),
    mort_low:  round(c.mort_low, 8),
    mort_high: round(c.mort_high, 8),
    mort_diff: round(c.mort_high - c.mort_low, 8),
  }, tcZoom);
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

function aggregateCityTo3km(pixels, city) {
  const BIN = 0.03; // degrees
  const bins = new Map();
  for (const p of pixels.values()) {
    if (p.pm25_low == null || p.pm25_high == null || p.mort_low == null || p.mort_high == null) {
      continue;
    }
    const bx = Math.floor(p.lng / BIN);
    const by = Math.floor(p.lat / BIN);
    const key = `${bx}:${by}`;
    let b = bins.get(key);
    if (!b) {
      b = { lng: 0, lat: 0, pm25_low: 0, pm25_high: 0, mort_low: 0, mort_high: 0, n: 0 };
      bins.set(key, b);
    }
    b.lng       += p.lng;
    b.lat       += p.lat;
    b.pm25_low  += p.pm25_low;
    b.pm25_high += p.pm25_high;
    b.mort_low  += p.mort_low;
    b.mort_high += p.mort_high;
    b.n++;
  }
  const out = [];
  for (const b of bins.values()) {
    const n = b.n;
    out.push(makePoint(b.lng / n, b.lat / n, {
      _scale: 3,
      city,
      pm25_low:  round(b.pm25_low  / n, 3),
      pm25_high: round(b.pm25_high / n, 3),
      pm25_diff: round((b.pm25_high - b.pm25_low) / n, 3),
      mort_low:  round(b.mort_low  / n, 6),
      mort_high: round(b.mort_high / n, 6),
      mort_diff: round((b.mort_high - b.mort_low) / n, 6),
    }, { minzoom: 7, maxzoom: 8 }));
  }
  return out;
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
      block = { lng: 0, lat: 0, pm25_low: 0, pm25_high: 0, mort_low: 0, mort_high: 0, n: 0 };
      blocks.set(key, block);
    }
    block.lng       += c.lng;
    block.lat       += c.lat;
    block.pm25_low  += c.pm25_low;
    block.pm25_high += c.pm25_high;
    block.mort_low  += c.mort_low;
    block.mort_high += c.mort_high;
    block.n++;
  }
  const out = [];
  for (const b of blocks.values()) {
    const n = b.n;
    out.push(makePoint(b.lng / n, b.lat / n, {
      _scale: 36,
      pm25_low:  round(b.pm25_low  / n, 2),
      pm25_high: round(b.pm25_high / n, 2),
      pm25_diff: round((b.pm25_high - b.pm25_low) / n, 2),
      mort_low:  round(b.mort_low  / n, 8),
      mort_high: round(b.mort_high / n, 8),
      mort_diff: round((b.mort_high - b.mort_low) / n, 8),
    }, { minzoom: 2, maxzoom: 3 }));
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
  console.log('Loading cities…');
  const manifest = [];
  let cityCount = 0;
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
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
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
  console.log('Generating synthetic 9 km CONUS grid…');
  const cityBboxesForFilter = manifest.map((m) => m.bbox);
  const nationalCellsAll = syntheticNational();
  const nationalCells = nationalCellsAll.filter((c) => isInsideConus(c.lng, c.lat));
  let inMetroCount = 0;
  for (const c of nationalCells) {
    if (pointInAnyBbox(c.lng, c.lat, cityBboxesForFilter)) inMetroCount++;
    await fh.write(JSON.stringify(nationalCellToPoint(c, cityBboxesForFilter)) + '\n');
  }
  console.log(`National 9 km: ${nationalCells.length} cells  (dropped ${nationalCellsAll.length - nationalCells.length} non-CONUS, ${inMetroCount} inside metro bboxes capped at z6)`);

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
