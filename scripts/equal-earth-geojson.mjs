#!/usr/bin/env node
//
// Reproject GeoJSON into the map tools' Equal Earth coordinates.
//
// MapLibre only draws Web Mercator, so Equal Earth layers are stored
// pre-projected (src/tools/_map/lib/equal-earth.js): every coordinate is
// replaced by the fake longitude/latitude that puts it where Equal Earth
// would. Tile the output with tippecanoe exactly as before.
//
//   node scripts/equal-earth-geojson.mjs IN.geojsonl OUT.geojsonl   # one Feature per line (streamed)
//   node scripts/equal-earth-geojson.mjs IN.geojson  OUT.geojson [--drop-south -60] [--step 0.25]
//
// Lines and rings are densified to `step` degrees first, so edges that run
// along a meridian bend the way meridians do in Equal Earth. Points are not.
// --drop-south removes polygons lying wholly south of a latitude (used to
// leave Antarctica out of the land layer; the map never shows that far south).

import { createReadStream, createWriteStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { toMap } from '../src/tools/_map/lib/equal-earth.js'

const [, , src, dst, ...rest] = process.argv
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? Number(rest[i + 1]) : d }
const STEP = opt('--step', 0.25)
const DROP_S = opt('--drop-south', null)
const r6 = (v) => Math.round(v * 1e6) / 1e6
const pt = ([x, y]) => { const [a, b] = toMap(x, y); return [r6(a), r6(b)] }
const south = (poly) => DROP_S != null && poly[0].every(([, y]) => y < DROP_S)

function line(c) {
  const out = []
  for (let i = 0; i < c.length - 1; i++) {
    const [a, b] = [c[i], c[i + 1]]
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / STEP))
    for (let k = 0; k < n; k++) out.push(pt([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]))
  }
  out.push(pt(c[c.length - 1]))
  return out
}

function coords(c) {
  if (typeof c[0] === 'number') return pt(c)
  if (typeof c[0][0] === 'number') return line(c)
  return c.map(coords)
}

function geom(g) {
  if (!g) return g
  if (g.type === 'Polygon' && south(g.coordinates)) return null
  if (g.type === 'MultiPolygon') {
    const kept = g.coordinates.filter((p) => !south(p))
    if (!kept.length) return null
    g = { ...g, coordinates: kept }
  }
  if (g.type === 'GeometryCollection') return { ...g, geometries: g.geometries.map(geom) }
  return { ...g, coordinates: coords(g.coordinates) }
}

if (src.endsWith('.geojsonl')) {
  const out = createWriteStream(dst)
  let n = 0
  for await (const l of createInterface({ input: createReadStream(src), crlfDelay: Infinity })) {
    if (!l.trim()) continue
    const f = JSON.parse(l)
    f.geometry = geom(f.geometry)
    if (!out.write(JSON.stringify(f) + '\n')) await new Promise((r) => out.once('drain', r))
    n++
  }
  await new Promise((r) => out.end(r))
  console.log(`${n} features → ${dst}`)
} else {
  const d = JSON.parse(readFileSync(src, 'utf8'))
  const feats = d.type === 'FeatureCollection' ? d.features : [d]
  for (const f of feats) f.geometry = geom(f.geometry)
  writeFileSync(dst, JSON.stringify(d))
  console.log(`${feats.length} features → ${dst}`)
}
