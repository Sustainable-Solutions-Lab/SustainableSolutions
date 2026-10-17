// scripts/build-mining-water.mjs
//
// Data pipeline for /tools/mining-water, the companion explorer to Busch et
// al., "Reducing water stress from mining battery materials" (preprint).
//
// Everything is rebuilt from public sources, so no Dropbox folder or licence
// is needed:
//
//   1. The paper's replication repo (github.com/pmbusch/sustainable-mining),
//      Figures/Data_Figures/: deposit locations and resources (Fig. 1), the
//      basin water-stress index (Fig. 1), the cost/water Pareto frontiers by
//      demand scenario (Fig. 2a) and their split by mineral (Fig. 2c-f).
//   2. AWARE 2.0 basin polygons and characterization factors (Seitfudem,
//      Berger & Boulay; Zenodo 10.5281/zenodo.15133241, CC BY 4.0), the same
//      geometry the paper's Figure 1 draws.
//
// Deposit names, grades and costs come from S&P Global under a licence that
// does not allow redistribution, so the repo (and this tool) carry only an
// ID, mineral, coordinates and contained resources per deposit.
//
// Output, written to public/tools/mining-water/ (small enough to commit, as
// food-emissions and materials do):
//   basins.json     GeoJSON, simplified AWARE basins with stress + CF
//   deposits.json   GeoJSON points, one per deposit, joined to its basin
//   frontier.json   Pareto frontiers and per-mineral splits by scenario
//
// Usage:  node scripts/build-mining-water.mjs
// Env:    MINING_WATER_REPO_REF  git ref of the replication repo (default main)

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const REF = process.env.MINING_WATER_REPO_REF ?? 'main';
const RAW = `https://raw.githubusercontent.com/pmbusch/sustainable-mining/${REF}/Figures/Data_Figures`;
const AWARE_KMZ =
  'https://zenodo.org/api/records/15133241/files/AWARE20_Native_CFs_geospatial.kmz/content';
const OUT = resolve('public/tools/mining-water');

// Simplification tolerance in degrees. 0.04° keeps basin outlines legible at
// the zooms the tool allows while holding basins.json near 2 MB.
const SIMPLIFY_DEG = 0.04;

// Zenodo refuses requests without a browser-like User-Agent (403).
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (sustainablesolutions.stanford.edu build)' };

async function fetchText(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

// Minimal CSV parser: the figure CSVs are quoted R write.csv output with no
// embedded newlines.
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  const split = (line) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}
const num = (v) => (v === '' || v === 'NA' || v == null ? null : Number(v));

// Douglas-Peucker, iterative.
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let best = 0, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (L2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r2 = (x) => Math.round(x * 100) / 100;

async function main() {
  await mkdir(OUT, { recursive: true });

  // ── Paper figure data ──────────────────────────────────────────────────
  const [depCsv, stressCsv, f2aCsv, f2cfCsv] = await Promise.all([
    fetchText(`${RAW}/Fig1_Deposits.csv`),
    fetchText(`${RAW}/Fig1_BasinWaterStress.csv`),
    fetchText(`${RAW}/Fig2a.csv`),
    fetchText(`${RAW}/Fig2cf_MineralByDemandScenario.csv`),
  ]);
  const stress = new Map();
  for (const r of parseCsv(stressCsv)) {
    const s = num(r.stress);
    if (s != null) stress.set(Number(r.Basin_ID), s);
  }

  // ── AWARE 2.0 basins ───────────────────────────────────────────────────
  console.log('Fetching AWARE 2.0 basins from Zenodo…');
  const kr = await fetch(AWARE_KMZ, { headers: HEADERS });
  if (!kr.ok) throw new Error(`${AWARE_KMZ} -> ${kr.status}`);
  const kmz = new Uint8Array(await kr.arrayBuffer());
  const files = unzipSync(kmz);
  const kmlName = Object.keys(files).find((f) => f.endsWith('.kml'));
  const kml = strFromU8(files[kmlName]);

  const features = [];
  const pmRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  const coordRe = /<outerBoundaryIs>\s*<LinearRing[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g;
  let m, nIn = 0, nOut = 0;
  while ((m = pmRe.exec(kml))) {
    const body = m[1];
    const id = body.match(/<name>\s*CFs for Basin_ID\s*(\d+)\s*<\/name>/);
    if (!id) continue;
    const bid = Number(id[1]);
    const cfM = body.match(/CF_annual_unspecified<\/td><td>([-\d.eE]+)/);
    const polys = [];
    let c;
    coordRe.lastIndex = 0;
    while ((c = coordRe.exec(body))) {
      const pts = c[1].trim().split(/\s+/).map((t) => t.split(',').slice(0, 2).map(Number));
      if (pts.length < 4) continue;
      nIn += pts.length;
      let sp = simplify(pts, SIMPLIFY_DEG);
      if (sp.length < 4) sp = pts;
      const ring = sp.map(([x, y]) => [r2(x), r2(y)]);
      const [fx, fy] = ring[0], [lx, ly] = ring[ring.length - 1];
      if (fx !== lx || fy !== ly) ring.push([fx, fy]);
      nOut += ring.length;
      polys.push([ring]);
    }
    if (!polys.length) continue;
    const s = stress.get(bid);
    features.push({
      type: 'Feature',
      id: bid,
      properties: {
        id: bid,
        // Stress index as the paper maps it; null = basin outside the model.
        s: s == null ? null : Math.round(s * 1e4) / 1e4,
        cf: cfM ? Number(cfM[1]) : null,
      },
      geometry: { type: 'MultiPolygon', coordinates: polys },
    });
  }
  console.log(`basins ${features.length}, vertices ${nIn} -> ${nOut}`);

  // ── Deposits, joined to the basin they sit in ──────────────────────────
  const bboxes = features.map((f) => {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const poly of f.geometry.coordinates) for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  });
  const deposits = [];
  let joined = 0, nearest = 0;
  for (const r of parseCsv(depCsv)) {
    const x = Number(r.LONGITUDE), y = Number(r.LATITUDE);
    const pt = [x, y];
    let hit = null;
    for (let i = 0; i < features.length && !hit; i++) {
      const [x0, y0, x1, y1] = bboxes[i];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (booleanPointInPolygon(pt, features[i])) hit = features[i];
    }
    // Coastal deposits can fall just outside a simplified outline; take the
    // nearest basin by bbox centre within one degree.
    if (!hit) {
      let best = Infinity;
      features.forEach((f, i) => {
        const [x0, y0, x1, y1] = bboxes[i];
        const d = Math.hypot((x0 + x1) / 2 - x, (y0 + y1) / 2 - y);
        if (d < 1 && d < best) { best = d; hit = f; }
      });
      if (hit) nearest++;
    }
    if (hit) joined++;
    deposits.push({
      type: 'Feature',
      properties: {
        id: Number(r.ID),
        mineral: r.Mineral,
        // Contained resources, million tonnes of metal.
        res: Math.round(Number(r.resources) * 1000) / 1000,
        basin: hit ? hit.properties.id : null,
        s: hit ? hit.properties.s : null,
        cf: hit ? hit.properties.cf : null,
      },
      geometry: { type: 'Point', coordinates: [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] },
    });
  }
  // Largest first, so small deposits draw on top and stay clickable.
  deposits.sort((a, b) => b.properties.res - a.properties.res);
  console.log(`deposits ${deposits.length}, joined ${joined} (${nearest} by nearest basin)`);

  // ── Figure 2: frontiers and per-mineral splits ─────────────────────────
  // Scenario names as the paper labels them (Fig2a scen_name).
  const scenName = {};
  const frontier = {};
  for (const r of parseCsv(f2aCsv)) {
    const name = r.scen_name || r.Scenario;
    scenName[r.Scenario] = name;
    (frontier[name] ??= []).push({
      step: r.metric, // allowed cost increase over the optimum, e.g. "5%"
      cost: num(r.Cost), // billion USD 2025–2050, discounted
      water: num(r.Water_Impact), // billion m³ world-eq, stress-weighted
      consumed: num(r.Water_cons), // billion m³ consumed
      mines: num(r['Additional Mine Openings']),
      reduction: num(r.water_red_pct) ?? 0, // % change in stress-weighted water vs optimum
    });
  }
  const order = (s) => Number(String(s).replace('%', ''));
  for (const k of Object.keys(frontier)) frontier[k].sort((a, b) => order(a.step) - order(b.step));
  const byMineral = {};
  for (const r of parseCsv(f2cfCsv)) {
    const name = scenName[r.Scenario] ?? r.Scenario;
    // Per tonne of demand: cost in USD/t, water in m³-eq/t (the figure plots
    // both per kg).
    (byMineral[name] ??= []).push({ step: r.metric, mineral: r.Mineral, cost: num(r.Cost), water: num(r.Water) });
  }

  const write = (name, obj) => writeFile(resolve(OUT, name), JSON.stringify(obj));
  await write('basins.json', { type: 'FeatureCollection', features });
  await write('deposits.json', { type: 'FeatureCollection', features: deposits });
  await write('frontier.json', { scenarios: Object.keys(frontier), frontier, byMineral });
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
