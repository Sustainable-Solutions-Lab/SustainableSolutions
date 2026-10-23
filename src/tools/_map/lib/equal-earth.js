// Equal Earth (Šavrič, Patterson & Jenny 2018) drawn through MapLibre's
// Web Mercator. Data are stored pre-projected: Equal Earth (x, y) is mapped
// linearly onto the Mercator world square, so the screen shows Equal Earth
// exactly while MapLibre believes it is drawing Mercator. Anything that
// hands MapLibre a real longitude/latitude (camera, graticule, clamps) goes
// through toMap(); anything that reads one back (clicks, the latitude
// profile) goes through fromMap().

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
const M = Math.sqrt(3) / 2
const XMAX = (2 * Math.sqrt(3) * Math.PI) / (3 * A1)
const D = Math.PI / 180

const yOf = (t) => { const t2 = t * t, t6 = t2 * t2 * t2; return t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) }
const dyOf = (t) => { const t2 = t * t, t6 = t2 * t2 * t2; return A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2) }

export function toMap(lng, lat) {
  const th = Math.asin(M * Math.sin(lat * D))
  const x = (2 * Math.sqrt(3) * lng * D * Math.cos(th)) / (3 * dyOf(th))
  return [(180 * x) / XMAX, Math.atan(Math.sinh((Math.PI * yOf(th)) / XMAX)) / D]
}

// Latitude only: Equal Earth parallels are straight and horizontal.
export const toMapLat = (lat) => toMap(0, lat)[1]

export function fromMap(fLng, fLat) {
  const y = (XMAX / Math.PI) * Math.asinh(Math.tan(fLat * D))
  let th = y / A1
  for (let i = 0; i < 12; i++) {
    const d = (yOf(th) - y) / dyOf(th)
    th -= d
    if (Math.abs(d) < 1e-12) break
  }
  const x = (fLng / 180) * XMAX
  const lng = ((3 * x * dyOf(th)) / (2 * Math.sqrt(3) * Math.cos(th))) / D
  return [lng, Math.asin(Math.sin(th) / M) / D]
}

export const fromMapLat = (fLat) => fromMap(0, fLat)[1]

// Project a GeoJSON FeatureCollection of LineStrings, densified so meridians curve.
export function projectLines(fc, step = 1) {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const c = f.geometry.coordinates
      const pts = []
      for (let i = 0; i < c.length - 1; i++) {
        const [a, b] = [c[i], c[i + 1]]
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step))
        for (let k = 0; k < n; k++) pts.push(toMap(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n))
      }
      pts.push(toMap(...c[c.length - 1]))
      return { ...f, geometry: { ...f.geometry, coordinates: pts } }
    }),
  }
}

// ── Page-wide switch ────────────────────────────────────────────────────────
// The map component turns this on for a project whose config.region.projection
// is 'equalEarth'. Code that crosses between real coordinates and the map
// (area tool, clicks, uploads) goes through these, which pass coordinates
// through untouched for Mercator projects.
let active = false
export const setEqualEarth = (on) => { active = !!on }
export const isEqualEarth = () => active
export const geoToMap = (p) => (active ? toMap(p[0], p[1]) : p)
export const mapToGeo = (p) => (active ? fromMap(p[0], p[1]) : p)
export const lngLatGeo = (ll) => { const [lng, lat] = mapToGeo([ll.lng, ll.lat]); return { lng, lat } }
export const projectGeo = (map, p) => map.project(geoToMap(p))
export const unprojectGeo = (map, pt) => lngLatGeo(map.unproject(pt))

// A Polygon/MultiPolygon in real coordinates → map coordinates, densified to
// 0.25° so long straight edges follow Equal Earth's curved meridians.
export function geometryToMap(g) {
  if (!active || !g) return g
  const ring = (r) => {
    const out = []
    for (let i = 0; i < r.length - 1; i++) {
      const [a, b] = [r[i], r[i + 1]]
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 0.25))
      for (let k = 0; k < n; k++) out.push(toMap(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n))
    }
    out.push(toMap(...r[r.length - 1]))
    return out
  }
  if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map(ring) }
  if (g.type === 'MultiPolygon') return { ...g, coordinates: g.coordinates.map((p) => p.map(ring)) }
  return g
}

// Screen-space bounding box of a geometry given in real coordinates, for
// queryRenderedFeatures. Projects every vertex: under Equal Earth the corners
// of a lng/lat box are not the extremes of its outline.
export function screenBbox(map, g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const visit = (r) => { for (const p of r) { const q = projectGeo(map, p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y) } }
  if (g.type === 'Polygon') g.coordinates.forEach(visit)
  else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach(visit))
  return [[x0, y0], [x1, y1]]
}
