#!/usr/bin/env node
//
// Build PMTiles for the Just Air map tool.
//
// Inputs (Dropbox alias-resolved):
//   {SRC}/<City>/PM25_<City>_<scenario>_out.csv
//   {SRC}/<City>/benmap_<City>_<scenario>_out.csv
//   where <City> in 15 metros, <scenario> in {highCDR, lowCDR}.
//
// Outputs (in dist-tiles/just-air/):
//   just-air-cities.pmtiles       all 15 cities, 4 layers (pm25, mort) × 2 scenarios + diffs
//   just-air-national.pmtiles      synthetic 9 km CONUS surface
//   just-air-cities.json           city bbox + label manifest (small, committed to repo)
//
// Each PMTiles feature carries:
//   pixel_id, city, lng, lat,
//   pm25_low, pm25_high, pm25_diff,        (µg/m³)
//   mort_low, mort_high, mort_diff,        (deaths)
//
// The map style picks the active (pollutant × scenario) combo via a paint
// expression on these properties.
//
// Run from repo root:  node scripts/build-just-air-tiles.mjs
//
// Requires: tippecanoe, pmtiles on PATH.

import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC = '/Users/stevedavis/Library/CloudStorage/Dropbox/Papers/In Press/Just CDR (w Cande)/Outputs for map app';
const OUT_DIR = resolve(REPO_ROOT, 'dist-tiles/just-air');
const MANIFEST_OUT = resolve(REPO_ROOT, 'public/tools/just-air/just-air-cities.json');

const CITIES = [
  'Atlanta', 'Boston', 'Chicago', 'Dallas', 'DC', 'Detroit', 'Houston',
  'LA', 'Miami', 'NY', 'Philadelphia', 'Phoenix', 'Riverside', 'Seattle', 'SF',
];

const SCENARIOS = [
  { id: 'highCDR', short: 'high' },
  { id: 'lowCDR',  short: 'low'  },
];

// ── CSV / R-geometry parsing ────────────────────────────────────────────────

// CSV with quoted fields that contain unescaped commas inside the geometry
// column. Minimal RFC-4180-style parser: walks char by char, toggling inQuotes.
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
  // Ensure closed
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
    // The R export emits the geometry column UNQUOTED, so its inner commas
    // (from list(c(lng1, lng2, ..., lat1, lat2, ...))) split into many CSV
    // cells. Re-join everything from the last expected column onward.
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
  // Read all 4 CSVs (PM25 × 2 scenarios, benmap × 2 scenarios)
  const byPixel = new Map(); // pixel_id → { lng, lat, ring, pm25_low/high, mort_low/high }
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
        const id = r.pixel_ID;
        const val = Number(r[valueCol]);
        if (!Number.isFinite(val)) continue;
        let pix = byPixel.get(id);
        if (!pix) {
          const ring = parseRingFromR(r.geometry);
          if (!ring) continue;
          // Centroid (mean of first 4 ring points, ignoring the closing repeat).
          const corners = ring.slice(0, 4);
          const lng = corners.reduce((s, p) => s + p[0], 0) / corners.length;
          const lat = corners.reduce((s, p) => s + p[1], 0) / corners.length;
          pix = { pixel_id: id, ring, lng, lat };
          byPixel.set(id, pix);
        }
        pix[targetCol] = val;
      }
    }
  }
  return { city, pixels: byPixel };
}

// ── GeoJSON emission for city tilesets ──────────────────────────────────────

function pixelToFeature(p, city) {
  const props = {
    pixel_id: p.pixel_id,
    city,
    lng: round(p.lng, 5),
    lat: round(p.lat, 5),
    pm25_low:  round(p.pm25_low, 3),
    pm25_high: round(p.pm25_high, 3),
    mort_low:  round(p.mort_low, 6),
    mort_high: round(p.mort_high, 6),
  };
  // Diffs (high - low). Negative = high CDR is better; positive = worse.
  if (props.pm25_low != null && props.pm25_high != null) {
    props.pm25_diff = round(props.pm25_high - props.pm25_low, 3);
  }
  if (props.mort_low != null && props.mort_high != null) {
    props.mort_diff = round(props.mort_high - props.mort_low, 6);
  }
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [p.ring] } };
}

function round(n, places) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

// ── Synthetic 9 km CONUS national grid ──────────────────────────────────────
//
// CONUS bbox: lng -125 to -66, lat 24 to 50 (approx).
// 9 km in degrees: ~0.0815° lat, ~0.10° lng at mid-latitudes. Use 0.09 × 0.10
// cells for a regular grid producing ~290 × 590 = ~170k cells.

function syntheticNational() {
  const bbox = { minLng: -125, maxLng: -66, minLat: 24, maxLat: 50 };
  const dLat = 0.09, dLng = 0.10;
  const features = [];
  // Pre-position "urban-ish" centers for plausible PM₂.₅ gradient. Doesn't
  // matter that this is fake — real values overwrite at next data drop.
  const centers = [
    { lng: -118.2, lat: 34.0, w: 6 }, // LA
    { lng: -73.9,  lat: 40.7, w: 7 }, // NYC
    { lng: -87.6,  lat: 41.9, w: 5 }, // Chicago
    { lng: -95.4,  lat: 29.8, w: 5 }, // Houston
    { lng: -84.4,  lat: 33.8, w: 4 }, // Atlanta
    { lng: -97.0,  lat: 32.8, w: 4 }, // DFW
    { lng: -75.2,  lat: 39.95, w: 4 }, // Philly
    { lng: -122.4, lat: 47.6, w: 3 }, // Seattle
    { lng: -122.4, lat: 37.8, w: 4 }, // SF
    { lng: -80.2,  lat: 25.8, w: 3 }, // Miami
    { lng: -77.0,  lat: 38.9, w: 4 }, // DC
    { lng: -83.0,  lat: 42.3, w: 3 }, // Detroit
    { lng: -71.1,  lat: 42.4, w: 4 }, // Boston
    { lng: -112.1, lat: 33.5, w: 3 }, // Phoenix
    { lng: -117.4, lat: 33.9, w: 3 }, // Riverside
  ];
  let id = 0;
  for (let lat = bbox.minLat; lat < bbox.maxLat; lat += dLat) {
    for (let lng = bbox.minLng; lng < bbox.maxLng; lng += dLng) {
      // Background field
      let pm25_low = 5;
      // Boost near urban centers, with quadratic falloff up to ~400 km radius
      for (const c of centers) {
        const dx = (lng - c.lng) * Math.cos((lat * Math.PI) / 180);
        const dy = (lat - c.lat);
        const r2 = dx * dx + dy * dy;
        pm25_low += c.w * Math.exp(-r2 / 2.0);
      }
      // High-CDR scenario has lower PM₂.₅ — uniform ~20% reduction with some noise.
      const noise = (Math.sin(id * 1.7) + Math.sin(id * 0.31)) * 0.15;
      const pm25_high = Math.max(2.5, pm25_low * (0.78 + noise * 0.04));
      // Mortality scales loosely with concentration; pretend rate of ~5 per
      // µg/m³ per cell (per-cell totals tiny since cells are 9 km).
      const mort_low = pm25_low * 0.000003;
      const mort_high = pm25_high * 0.000003;
      features.push({
        type: 'Feature',
        properties: {
          gid: id++,
          pm25_low:  round(pm25_low, 2),
          pm25_high: round(pm25_high, 2),
          pm25_diff: round(pm25_high - pm25_low, 2),
          mort_low:  round(mort_low, 8),
          mort_high: round(mort_high, 8),
          mort_diff: round(mort_high - mort_low, 8),
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [round(lng,        4), round(lat,        4)],
            [round(lng + dLng, 4), round(lat,        4)],
            [round(lng + dLng, 4), round(lat + dLat, 4)],
            [round(lng,        4), round(lat + dLat, 4)],
            [round(lng,        4), round(lat,        4)],
          ]],
        },
      });
    }
  }
  return features;
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

  // ── Cities: load each, write GeoJSONL + bbox manifest ──────────────────
  console.log('Loading cities…');
  const cityGeoJson = join(OUT_DIR, 'just-air-cities.geojsonl');
  const manifest = [];
  const cityHandle = await fs.open(cityGeoJson, 'w');
  let total = 0;
  for (const city of CITIES) {
    const result = await loadCity(city);
    if (!result) continue;
    const { pixels } = result;
    let minLng =  Infinity, minLat =  Infinity, maxLng = -Infinity, maxLat = -Infinity;
    let n = 0;
    for (const p of pixels.values()) {
      // Skip pixels missing any of the 4 measurements (rare data drops)
      if (p.pm25_low == null || p.pm25_high == null || p.mort_low == null || p.mort_high == null) continue;
      const f = pixelToFeature(p, city);
      await cityHandle.write(JSON.stringify(f) + '\n');
      for (const [lng, lat] of f.geometry.coordinates[0]) {
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      }
      n++;
    }
    total += n;
    manifest.push({
      slug: city.toLowerCase(),
      label: city,
      bbox: [round(minLng, 4), round(minLat, 4), round(maxLng, 4), round(maxLat, 4)],
      pixels: n,
    });
    console.log(`  ${city.padEnd(14)} ${n.toString().padStart(6)} pixels`);
  }
  await cityHandle.close();
  await fs.writeFile(MANIFEST_OUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${total} city pixels → ${cityGeoJson}`);
  console.log(`Wrote manifest               → ${MANIFEST_OUT}`);

  // ── National synthetic grid ────────────────────────────────────────────
  console.log('Generating synthetic 9 km CONUS grid…');
  const natFeatures = syntheticNational();
  const natGeoJson = join(OUT_DIR, 'just-air-national.geojsonl');
  const natHandle = await fs.open(natGeoJson, 'w');
  for (const f of natFeatures) await natHandle.write(JSON.stringify(f) + '\n');
  await natHandle.close();
  console.log(`Wrote ${natFeatures.length} national cells → ${natGeoJson}`);

  // ── Tippecanoe → mbtiles → pmtiles ─────────────────────────────────────
  console.log('Running tippecanoe (cities)…');
  const citiesMbt = join(OUT_DIR, 'just-air-cities.mbtiles');
  run('tippecanoe', [
    '-o', citiesMbt, '--force',
    '-l', 'cities',
    '--minimum-zoom=8', '--maximum-zoom=14',
    '--drop-densest-as-needed',
    '--no-feature-limit', '--no-tile-size-limit',
    cityGeoJson,
  ]);

  console.log('Running tippecanoe (national)…');
  const nationalMbt = join(OUT_DIR, 'just-air-national.mbtiles');
  run('tippecanoe', [
    '-o', nationalMbt, '--force',
    '-l', 'national',
    '--minimum-zoom=2', '--maximum-zoom=10',
    '--drop-densest-as-needed',
    '--no-feature-limit', '--no-tile-size-limit',
    nationalMbt.endsWith('.mbtiles') ? natGeoJson : natGeoJson,
  ]);

  console.log('Converting → PMTiles…');
  for (const mbt of [citiesMbt, nationalMbt]) {
    const pmt = mbt.replace(/\.mbtiles$/, '.pmtiles');
    run('pmtiles', ['convert', mbt, pmt, '--force']);
    const stat = await fs.stat(pmt);
    console.log(`  ${basename(pmt)} ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  }
  console.log('\nDone. Upload these two files to R2:');
  console.log(`  ${join(OUT_DIR, 'just-air-cities.pmtiles')}`);
  console.log(`  ${join(OUT_DIR, 'just-air-national.pmtiles')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
