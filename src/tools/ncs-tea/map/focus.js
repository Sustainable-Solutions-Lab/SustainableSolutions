/**
 * map/focus.js
 *
 * Region focus geometry: a circle or polygon in real coordinates, the mask
 * of grid cells inside it, and the dimming "world with a hole" drawn
 * around it (after the lab site's area tool).
 */
import { geometryToMap } from './equal-earth.js'

const R_EARTH = 6371
const D = Math.PI / 180

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * D, dLon = (lon2 - lon1) * D
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D) * Math.cos(lat2 * D) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** A geodesic-ish circle as a Polygon in real coordinates. */
export function circlePolygon(lat, lon, radiusKm, n = 72) {
  const ring = []
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * 2 * Math.PI
    const dLat = (radiusKm / R_EARTH) / D * Math.cos(a)
    const dLon = ((radiusKm / R_EARTH) / D * Math.sin(a)) / Math.max(0.05, Math.cos(lat * D))
    ring.push([Math.max(-180, Math.min(180, lon + dLon)), Math.max(-89.9, Math.min(89.9, lat + dLat))])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function pointInGeometry(lon, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  for (const poly of polys) {
    if (!inRing(lon, lat, poly[0])) continue
    let hole = false
    for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])) { hole = true; break }
    if (!hole) return true
  }
  return false
}

export function bboxOf(geom) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const visit = (r) => { for (const [x, y] of r) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y } }
  if (geom.type === 'Polygon') geom.coordinates.forEach(visit)
  else geom.coordinates.forEach((p) => p.forEach(visit))
  return [w, s, e, n]
}

/** Uint8Array mask of grid cells whose centre lies inside the focus. */
export function focusMask(grid, focus) {
  if (!focus) return null
  const mask = new Uint8Array(grid.size)
  if (focus.type === 'circle') {
    const { lat, lon, radiusKm } = focus
    const dLat = radiusKm / 111.2
    for (let i = 0; i < grid.size; i++) {
      const [x, y] = grid.lonLatOf(i)
      if (Math.abs(y - lat) > dLat + grid.res) continue
      if (haversineKm(lat, lon, y, x) <= radiusKm) mask[i] = 1
    }
    return mask
  }
  const g = focus.geometry
  const [w, s, e, n] = bboxOf(g)
  for (let i = 0; i < grid.size; i++) {
    const [x, y] = grid.lonLatOf(i)
    if (x < w || x > e || y < s || y > n) continue
    if (pointInGeometry(x, y, g)) mask[i] = 1
  }
  return mask
}

/** Real geometry of a focus (circle or polygon). */
export function focusGeometry(focus) {
  if (!focus) return null
  return focus.type === 'circle' ? circlePolygon(focus.lat, focus.lon, focus.radiusKm) : focus.geometry
}

/** The focus outline and a dimming mask around it, in map coordinates. */
export function focusLayersGeoJSON(focus) {
  const real = focusGeometry(focus)
  if (!real) return { type: 'FeatureCollection', features: [] }
  const geom = geometryToMap(real)
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
  const inner = geom.type === 'Polygon' ? geom.coordinates.map((r) => [...r].reverse()) : geom.coordinates.flatMap((p) => p.map((r) => [...r].reverse()))
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'outline' }, geometry: geom },
      { type: 'Feature', properties: { kind: 'mask' }, geometry: { type: 'Polygon', coordinates: [world, ...inner] } },
    ],
  }
}

/** Polygons from a GeoJSON or KML file, merged into one geometry. */
export function parsePolygonFile(name, text) {
  const polys = []
  if (/\.kml$/i.test(name)) {
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    const ring = (el) => (el?.getElementsByTagName('coordinates')[0]?.textContent ?? '').trim().split(/\s+/)
      .map((t) => t.split(',').map(Number).slice(0, 2)).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
    for (const poly of doc.getElementsByTagName('Polygon')) {
      const outer = ring(poly.getElementsByTagName('outerBoundaryIs')[0])
      if (outer.length < 4) continue
      const rings = [outer]
      for (const inner of poly.getElementsByTagName('innerBoundaryIs')) { const h = ring(inner); if (h.length >= 4) rings.push(h) }
      polys.push(rings)
    }
  } else {
    const obj = JSON.parse(text)
    const take = (g) => {
      if (!g) return
      if (g.type === 'Polygon') polys.push(g.coordinates)
      else if (g.type === 'MultiPolygon') polys.push(...g.coordinates)
      else if (g.type === 'GeometryCollection') (g.geometries ?? []).forEach(take)
    }
    if (obj.type === 'FeatureCollection') (obj.features ?? []).forEach((f) => take(f.geometry))
    else if (obj.type === 'Feature') take(obj.geometry)
    else take(obj)
  }
  if (!polys.length) throw new Error('No polygon found in the file')
  if (polys.flat(2).length > 500000) throw new Error('Polygon too detailed; simplify it first')
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }
}
