/**
 * map/raster.js
 *
 * Paint the grid as one image in the Equal Earth plane.
 *
 * The lab's maps draw Equal Earth through MapLibre's Web Mercator by storing
 * every layer pre-projected (see equal-earth.js). A raster of the whole
 * world is the simplest case of that: the Equal Earth (x, y) plane maps
 * linearly onto MapLibre's world square, so a canvas spanning x in
 * [-XMAX, XMAX] and y in [-YMAX, YMAX] is placed with four corners in fake
 * longitude/latitude and never needs re-projecting. We precompute, once, the
 * grid cell under every pixel (Equal Earth inverse; parallels are straight,
 * so the Newton solve runs once per row), and repainting a new field is a
 * table lookup per pixel.
 */

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
const M = Math.sqrt(3) / 2
const XMAX = (2 * Math.sqrt(3) * Math.PI) / (3 * A1)
const yOf = (t) => { const t2 = t * t, t6 = t2 * t2 * t2; return t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) }
const dyOf = (t) => { const t2 = t * t, t6 = t2 * t2 * t2; return A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2) }
export const YMAX = yOf(Math.PI / 3)

/** The canvas corners in MapLibre's (fake) lng/lat: top-left, top-right, bottom-right, bottom-left. */
export function canvasCorners() {
  const latN = Math.atan(Math.sinh((Math.PI * YMAX) / XMAX)) * (180 / Math.PI)
  return [[-180, latN], [180, latN], [180, -latN], [-180, -latN]]
}

/** Int32Array of grid cell index per pixel (-1 outside the globe). */
export function buildLookup(grid, W, H) {
  const lut = new Int32Array(W * H).fill(-1)
  const { res, west, north } = grid
  for (let py = 0; py < H; py++) {
    const y = YMAX - ((py + 0.5) / H) * 2 * YMAX
    // Solve yOf(theta) = y by Newton from a good start.
    let th = y / A1
    for (let k = 0; k < 12; k++) { const d = (yOf(th) - y) / dyOf(th); th -= d; if (Math.abs(d) < 1e-12) break }
    const sinTh = Math.sin(th) / M
    if (Math.abs(sinTh) > 1) continue
    const lat = Math.asin(sinTh) * (180 / Math.PI)
    const row = Math.floor((north - lat) / res)
    if (row < 0 || row >= grid.H) continue
    const lonFactor = (3 * dyOf(th)) / (2 * Math.sqrt(3) * Math.cos(th)) * (180 / Math.PI)
    const base = py * W
    for (let px = 0; px < W; px++) {
      const x = -XMAX + ((px + 0.5) / W) * 2 * XMAX
      const lon = x * lonFactor
      if (lon < -180 || lon >= 180) continue
      const col = Math.floor((lon - west) / res)
      if (col < 0 || col >= grid.W) continue
      lut[base + px] = row * grid.W + col
    }
  }
  return lut
}

/**
 * Paint `field` (Float32Array per cell) through the lookup into an RGBA
 * image. `domain` = [min, max]; diverging domains are symmetric about zero.
 */
export function paint(imageData, lookup, field, domain, colorLut) {
  const data = imageData.data
  const [lo, hi] = domain
  const span = hi - lo || 1
  const n = lookup.length
  for (let p = 0; p < n; p++) {
    const i = lookup[p]
    const o = p * 4
    if (i < 0) { data[o + 3] = 0; continue }
    const v = field[i]
    if (v !== v) { data[o + 3] = 0; continue } // NaN
    let t = (v - lo) / span
    if (t < 0) t = 0; else if (t > 1) t = 1
    const k = (t * 255 + 0.5) | 0
    const c = k * 4
    data[o] = colorLut[c]; data[o + 1] = colorLut[c + 1]; data[o + 2] = colorLut[c + 2]; data[o + 3] = colorLut[c + 3]
  }
}

/** p02–p98 (or symmetric for diverging) of the finite values, by sampling. */
export function fieldDomain(field, { diverging = false, clampMax = Infinity, clampMin = -Infinity } = {}) {
  const vals = []
  const step = Math.max(1, Math.floor(field.length / 60000))
  for (let i = 0; i < field.length; i += step) { const v = field[i]; if (v === v) vals.push(v) }
  if (vals.length < 2) return [0, 1]
  vals.sort((a, b) => a - b)
  let lo = Math.max(clampMin, vals[Math.floor(vals.length * 0.02)])
  let hi = Math.min(clampMax, vals[Math.floor(vals.length * 0.98)])
  if (diverging) { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; return [-m, m] }
  if (hi <= lo) hi = lo + 1e-9
  return [lo, hi]
}
