/**
 * map/antimeridian.js
 *
 * Natural Earth's 1:110m rings (as shipped in world-atlas) still contain
 * segments that jump across the antimeridian (Fiji, Chukotka, Antarctica).
 * Projected naively, each jump becomes a line across the whole map. These
 * helpers unwrap longitudes so a ring is continuous, clip it at ±180°, and
 * shift the far side back, so every output ring stays inside [-180, 180].
 * A ring that goes all the way round a pole (Antarctica) is closed along
 * the pole instead of along its cut latitude.
 */

function unwrap(coords) {
  const out = [[coords[0][0], coords[0][1]]]
  let offset = 0
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i][0] + offset
    const prev = out[out.length - 1][0]
    if (lon - prev > 180) { offset -= 360; lon -= 360 } else if (prev - lon > 180) { offset += 360; lon += 360 }
    out.push([lon, coords[i][1]])
  }
  return out
}

// Sutherland–Hodgman against the half-plane lon <= L (side = 1) or lon >= L (side = -1).
function clipHalf(ring, L, side) {
  const inside = (p) => (side > 0 ? p[0] <= L : p[0] >= L)
  const cross = (a, b) => { const t = (L - a[0]) / (b[0] - a[0]); return [L, a[1] + t * (b[1] - a[1])] }
  const out = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const ia = inside(a), ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) out.push(cross(a, b))
  }
  if (out.length >= 3) out.push(out[0])
  return out.length >= 4 ? out : null
}

function splitRing(ring) {
  const u = unwrap(ring.slice(0, -1).length ? ring.slice(0, ring.length - 1) : ring)
  const lons = u.map((p) => p[0])
  const lo = Math.min(...lons), hi = Math.max(...lons)
  // A ring around a pole: spans (almost) the full circle. Close it along the pole.
  if (hi - lo > 350) {
    const lats = u.map((p) => p[1])
    const pole = Math.abs(Math.min(...lats)) > Math.abs(Math.max(...lats)) ? -89.99 : 89.99
    // Rotate so the ring starts at its westernmost point, then run back along the pole.
    const k = lons.indexOf(lo)
    const rot = [...u.slice(k), ...u.slice(0, k)]
    const shifted = rot.map((p) => [p[0] - (lo < -180 ? -360 : 0), p[1]])
    const r = [...shifted, [shifted[shifted.length - 1][0], pole], [shifted[0][0], pole], shifted[0]]
    return [r.map((p) => [Math.max(-180, Math.min(180, p[0])), p[1]])]
  }
  if (lo >= -180 && hi <= 180) return [[...u, u[0]]]
  const parts = []
  if (hi > 180) {
    const a = clipHalf(u, 180, 1), b = clipHalf(u, 180, -1)
    if (a) parts.push(a)
    if (b) parts.push(b.map((p) => [p[0] - 360, p[1]]))
  } else {
    const a = clipHalf(u, -180, -1), b = clipHalf(u, -180, 1)
    if (a) parts.push(a)
    if (b) parts.push(b.map((p) => [p[0] + 360, p[1]]))
  }
  return parts
}

/** Polygon / MultiPolygon with every ring inside [-180, 180]. Holes are dropped if their shell was split. */
export function cutPolygon(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const out = []
  for (const poly of polys) {
    const shells = splitRing(poly[0])
    if (shells.length === 1 && poly.length > 1) out.push([shells[0], ...poly.slice(1)])
    else for (const s of shells) out.push([s])
  }
  return { type: 'MultiPolygon', coordinates: out }
}

/** MultiLineString split wherever it crosses ±180°. */
export function cutLines(geom) {
  const out = []
  for (const line of geom.coordinates) {
    const u = unwrap(line)
    let cur = []
    const push = (p) => cur.push([p[0] > 180 ? p[0] - 360 : p[0] < -180 ? p[0] + 360 : p[0], p[1]])
    for (let i = 0; i < u.length; i++) {
      const p = u[i]
      if (i > 0) {
        const q = u[i - 1]
        for (const L of [-180, 180, 540, -540]) {
          if ((q[0] - L) * (p[0] - L) < 0) {
            const t = (L - q[0]) / (p[0] - q[0])
            const c = [L, q[1] + t * (p[1] - q[1])]
            push(c)
            if (cur.length > 1) out.push(cur)
            cur = []
            push([L === 180 ? -180 : L === -180 ? 180 : L, c[1]])
          }
        }
      }
      push(p)
    }
    if (cur.length > 1) out.push(cur)
  }
  return { type: 'MultiLineString', coordinates: out }
}
