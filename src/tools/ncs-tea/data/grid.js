/**
 * data/grid.js
 *
 * Load the grid pack written by pipeline/build_grid.py: a manifest and one
 * little-endian Float32 raster per layer, row-major from the north-west
 * corner. User layers (CSV uploads) are added to the same object so the
 * engine sees one flat `layers` map.
 */

export async function loadGrid(base = '/data/grid') {
  const manifest = await (await fetch(`${base}/manifest.json`)).json()
  const countries = await (await fetch(`${base}/countries.json`)).json()
  const layers = {}
  const meta = {}
  await Promise.all(manifest.layers.map(async (l) => {
    const buf = await (await fetch(`${base}/${l.file}`)).arrayBuffer()
    layers[l.id] = new Float32Array(buf)
    meta[l.id] = { ...l, builtin: true }
  }))
  return makeGrid({ manifest, countries, layers, meta })
}

export function makeGrid({ manifest, countries, layers, meta }) {
  const { width: W, height: H, res } = manifest
  const [west, south, east, north] = manifest.bbox
  const grid = {
    W, H, res, west, south, east, north, size: W * H, layers, meta, countries,
    countryName(i) {
      const c = Math.round(layers.country_id?.[i] ?? 0)
      return countries.find((k) => k.id === c)?.name ?? null
    },
    /** Cell index for a real longitude/latitude, or -1 outside the grid. */
    cellAt(lon, lat) {
      const col = Math.floor((lon - west) / res)
      const row = Math.floor((north - lat) / res)
      if (col < 0 || col >= W || row < 0 || row >= H) return -1
      return row * W + col
    },
    /** Centre of cell i. */
    lonLatOf(i) {
      const row = Math.floor(i / W), col = i % W
      return [west + (col + 0.5) * res, north - (row + 0.5) * res]
    },
    layerIds() { return Object.keys(layers) },
    /** Register a new layer (user data). Returns the id. */
    addLayer(id, array, info = {}) {
      layers[id] = array
      let min = Infinity, max = -Infinity, n = 0
      const vals = []
      for (let k = 0; k < array.length; k++) { const v = array[k]; if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; n++; if (vals.length < 50000 && (k % 7 === 0)) vals.push(v) } }
      vals.sort((a, b) => a - b)
      meta[id] = { id, label: id, unit: '', source: 'user upload', builtin: false, ...info, min, max, p02: vals[Math.floor(vals.length * 0.02)] ?? min, p98: vals[Math.floor(vals.length * 0.98)] ?? max, valid: n }
      return id
    },
    removeLayer(id) { if (!meta[id]?.builtin) { delete layers[id]; delete meta[id] } },
  }
  return grid
}

/**
 * Parse a CSV of points (columns lon, lat, value in any order, by header
 * name) or of country codes (iso3, value) into a Float32Array layer. Cells
 * hit by several points take their mean. Returns { array, kind, n }.
 */
export function csvToLayer(text, grid) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length)
  if (lines.length < 2) throw new Error('The file has no data rows')
  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase())
  const find = (...names) => header.findIndex((h) => names.includes(h))
  const iLon = find('lon', 'lng', 'longitude', 'x'), iLat = find('lat', 'latitude', 'y')
  const iVal = find('value', 'val', 'v') >= 0 ? find('value', 'val', 'v') : header.length - 1
  const iIso = find('iso3', 'iso', 'country', 'adm0_a3')
  const out = new Float32Array(grid.size).fill(NaN)
  let n = 0
  if (iLon >= 0 && iLat >= 0) {
    const sum = new Float64Array(grid.size), cnt = new Uint32Array(grid.size)
    for (let k = 1; k < lines.length; k++) {
      const p = lines[k].split(/[,;\t]/)
      const lon = +p[iLon], lat = +p[iLat], v = +p[iVal]
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(v)) continue
      const i = grid.cellAt(lon, lat)
      if (i < 0) continue
      sum[i] += v; cnt[i]++; n++
    }
    for (let i = 0; i < grid.size; i++) if (cnt[i]) out[i] = sum[i] / cnt[i]
    return { array: out, kind: 'points', n }
  }
  if (iIso >= 0) {
    const byIso = new Map(grid.countries.map((c) => [c.iso3.toUpperCase(), c.id]))
    const table = new Map()
    for (let k = 1; k < lines.length; k++) {
      const p = lines[k].split(/[,;\t]/)
      const id = byIso.get((p[iIso] ?? '').trim().toUpperCase())
      const v = +p[iVal]
      if (id && Number.isFinite(v)) { table.set(id, v); n++ }
    }
    const C = grid.layers.country_id
    for (let i = 0; i < grid.size; i++) { const v = table.get(Math.round(C[i])); if (v != null) out[i] = v }
    return { array: out, kind: 'countries', n }
  }
  throw new Error('Need columns lon, lat, value (points) or iso3, value (countries)')
}
