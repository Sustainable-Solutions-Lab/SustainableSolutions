#!/usr/bin/env node
//
// Build PMTiles for the Food Emissions map tool.
//
// Input (produced by the analysis repo — heavy data stays in its Dropbox tree):
//   {SRC}/food_emissions_cells.geojsonl   0.25° cell centroids, one Feature/line
//   {SRC}/meta.json
// See "Gridded LM/pipeline/export_explorer_cells.py" for the feature model
// (per-source kt CO₂e, per-variant totals + intensities, ha, m49, _scale=28).
//
// Output:
//   build/tiles/food-emissions/food-emissions.pmtiles   (upload to R2 for prod)
//   public/tools/food-emissions/food-emissions.pmtiles  (gitignored local copy
//                                                        so `npm run dev` works)
//
// Run from repo root:  node scripts/build-food-emissions-tiles.mjs
// Requires: tippecanoe, pmtiles on PATH.

import { promises as fs, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC = '/Users/stevedavis/Library/CloudStorage/Dropbox/Papers/Active Prep/' +
  'Mapped drivers of food ems (w Julianne)/Gridded LM/data/processed/explorer';
const OUT_DIR = resolve(REPO_ROOT, 'build/tiles/food-emissions');
const PUBLIC_DIR = resolve(REPO_ROOT, 'public/tools/food-emissions');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${cmd} failed (${r.status})`);
    process.exit(r.status ?? 1);
  }
}

async function main() {
  const src = resolve(SRC, 'food_emissions_cells.geojsonl');
  if (!existsSync(src)) {
    console.error(`Missing input: ${src}\nRun the analysis repo's export first:` +
      `\n  .venv/bin/python pipeline/export_explorer_cells.py`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });

  const meta = JSON.parse(await fs.readFile(resolve(SRC, 'meta.json'), 'utf8'));
  console.log(`Input: ${meta.cells} cells, ${meta.resolution_deg}°, ` +
    `reference ${meta.reference_year}`);

  const mbt = resolve(OUT_DIR, 'food-emissions.mbtiles');
  console.log('Tiling…');
  run('tippecanoe', [
    '-o', mbt, '--force',
    '-l', 'food-emissions',
    '-Z', '0', '-z', '8',
    '-r1', '--no-feature-limit', '--no-tile-size-limit',
    src,
  ]);

  console.log('Converting → PMTiles…');
  const pmt = mbt.replace(/\.mbtiles$/, '.pmtiles');
  run('pmtiles', ['convert', mbt, pmt, '--force']);
  const stat = await fs.stat(pmt);
  console.log(`  ${basename(pmt)} ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

  copyFileSync(pmt, resolve(PUBLIC_DIR, 'food-emissions.pmtiles'));

  // Distributions: a value sample per numeric variable, consumed by the
  // sidebar distribution chart / colorbar (config.distributionsUrl).
  console.log('Sampling distributions…');
  const raw = (await fs.readFile(src, 'utf8')).split('\n').filter(Boolean);
  const keys = new Set();
  const sample = {};
  const step = Math.max(1, Math.floor(raw.length / 6000));
  for (let i = 0; i < raw.length; i += step) {
    const props = JSON.parse(raw[i]).properties;
    if (props._scale !== 28) continue; // stats ride the 0.25° tier only
    for (const [k, v] of Object.entries(props)) {
      if (k === '_scale' || k === 'm49' || k === 'ha') continue;
      if (typeof v !== 'number' || !isFinite(v) || v === 0) continue;
      keys.add(k);
      (sample[k] ??= []).push(v);
    }
  }
  await fs.writeFile(
    resolve(PUBLIC_DIR, 'distributions.json'),
    JSON.stringify(sample),
  );
  console.log(`  distributions.json: ${keys.size} variables`);

  // Latitudinal profiles: per-variable sums in 0.25-degree latitude bands,
  // for the map's right-edge marginal chart. Full pass (not sampled).
  console.log('Building latitude profiles…');
  const LAT0 = 90, DLAT = 0.25, NBANDS = Math.round(180 / DLAT);
  const profiles = {};
  for (const line of raw) {
    const f = JSON.parse(line);
    if (f.properties._scale !== 28) continue; // profiles ride the 0.25° tier only
    const lat = f.geometry.coordinates[1];
    const band = Math.min(NBANDS - 1, Math.max(0, Math.floor((LAT0 - lat) / DLAT)));
    for (const [k, v] of Object.entries(f.properties)) {
      if (k === '_scale' || k === 'm49' || k === 'ha' || k === 'intn') continue;
      if (typeof v !== 'number' || !isFinite(v)) continue;
      (profiles[k] ??= new Array(NBANDS).fill(0))[band] += v;
    }
  }
  for (const k of Object.keys(profiles)) {
    profiles[k] = profiles[k].map((v) => Math.round(v * 10) / 10);
  }
  await fs.writeFile(
    resolve(PUBLIC_DIR, 'lat-profiles.json'),
    JSON.stringify({ lat0: LAT0, dlat: DLAT, profiles }),
  );
  console.log(`  lat-profiles.json: ${Object.keys(profiles).length} variables`);
  console.log(`\nLocal dev copy → public/tools/food-emissions/ (gitignored).`);
  console.log('For production: upload build/tiles/food-emissions/food-emissions.pmtiles ' +
    'to R2 and swap tilesUrl in the project config.');
}

main();
