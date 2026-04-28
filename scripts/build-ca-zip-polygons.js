// scripts/build-ca-zip-polygons.js
//
// Fetches the OpenDataDE California ZIP-code GeoJSON (per-state Census ZCTA
// boundaries, already CA-clipped including multi-state portions) and splits
// it into one GeoJSON file per ZIP under dist-zips/.
//
// Each emitted file has the shape:
//   { "type": "Feature", "properties": { "zip": "94305" }, "geometry": ... }
//
// Run:
//   node scripts/build-ca-zip-polygons.js
//
// Then upload dist-zips/* to R2 under the zips/ prefix:
//   wrangler r2 object put <bucket>/zips/<zip>.geojson --file dist-zips/<zip>.geojson
// (or use the Cloudflare R2 dashboard).
//
// The Firefuels tool fetches https://<r2>/zips/<zip>.geojson at runtime.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE_URL =
  'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ca_california_zip_codes_geo.min.json'
const CACHE = resolve('templates/ca-zip-codes-geo.min.json')
const OUT_DIR = resolve('dist-zips')

async function fetchOrCache() {
  if (existsSync(CACHE)) {
    console.log(`[build-ca-zips] using cached ${CACHE}`)
    return JSON.parse(await readFile(CACHE, 'utf8'))
  }
  console.log(`[build-ca-zips] fetching ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`source fetch failed: ${res.status} ${res.statusText}`)
  const text = await res.text()
  await writeFile(CACHE, text)
  console.log(`[build-ca-zips] cached at ${CACHE} (${(text.length / 1e6).toFixed(1)} MB)`)
  return JSON.parse(text)
}

function pickZip(props) {
  // OpenDataDE uses ZCTA5CE10 in older snapshots, ZCTA5CE20 in newer.
  return (
    props.ZCTA5CE10 ?? props.ZCTA5CE20 ?? props.zcta ?? props.ZIP ?? props.zip ?? null
  )
}

async function main() {
  const collection = await fetchOrCache()
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('source is not a FeatureCollection')
  }

  if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  let written = 0
  let skipped = 0
  for (const feat of collection.features) {
    const zip = pickZip(feat.properties || {})
    if (!zip || !/^\d{5}$/.test(zip)) { skipped++; continue }
    if (!feat.geometry) { skipped++; continue }

    const out = {
      type: 'Feature',
      properties: { zip },
      geometry: feat.geometry,
    }
    await writeFile(resolve(OUT_DIR, `${zip}.geojson`), JSON.stringify(out))
    written++
  }

  console.log('')
  console.log(`[build-ca-zips] wrote ${written} per-ZIP files to ${OUT_DIR}`)
  console.log(`  skipped (no zip / no geometry): ${skipped}`)
  console.log('')
  console.log('  Next: upload dist-zips/* to R2 under the zips/ prefix.')
  console.log('  Example with wrangler:')
  console.log('    cd dist-zips && for f in *.geojson; do')
  console.log('      wrangler r2 object put <BUCKET>/zips/$f --file $f --content-type application/geo+json')
  console.log('    done')
}

main().catch((err) => { console.error(err); process.exit(1) })
