/**
 * components/map/lat-profile.jsx
 *
 * Vertical marginal chart along the map's right edge: the latitudinal
 * distribution of the active variable (global band sums baked at build time,
 * config.latProfileUrl), drawn in screen space so each pixel row lines up
 * with the map latitude beside it. Re-projects on every camera move.
 *
 * Computed difference variables (diffOf) subtract the two banked profiles —
 * profiles are additive, so the marginal stays exact.
 */

import { useEffect, useRef, useState } from 'react'

const WIDTH = 54
const profileCache = new Map()

export function LatProfile({ map, config, variable, isDark }) {
  const [data, setData] = useState(() => profileCache.get(config.latProfileUrl) ?? null)
  const [path, setPath] = useState(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const url = config.latProfileUrl
    if (!url || profileCache.has(url)) return undefined
    let alive = true
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) profileCache.set(url, json)
        if (alive) setData(json)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [config.latProfileUrl])

  useEffect(() => {
    if (!map || !data || !variable) { setPath(null); return undefined }

    const values = variable.diffOf
      ? (data.profiles[variable.diffOf[0]] ?? []).map(
          (v, i) => Math.abs(v - (data.profiles[variable.diffOf[1]]?.[i] ?? 0))
        )
      : data.profiles[variable.id]
    if (!values || !values.length) { setPath(null); return undefined }
    const vmax = Math.max(...values) || 1

    function rebuild() {
      const h = map.getContainer().clientHeight
      const steps = Math.max(40, Math.floor(h / 4))
      const pts = []
      for (let i = 0; i <= steps; i++) {
        const y = (i / steps) * h
        const lat = map.unproject([0, y]).lat
        const band = Math.floor((data.lat0 - lat) / data.dlat)
        const v = band >= 0 && band < values.length ? values[band] : 0
        pts.push([y, (v / vmax) * (WIDTH - 6)])
      }
      let d = `M ${WIDTH} ${pts[0][0]}`
      for (const [y, w] of pts) d += ` L ${(WIDTH - w).toFixed(1)} ${y.toFixed(1)}`
      d += ` L ${WIDTH} ${pts[pts.length - 1][0]} Z`
      setPath({ d, h })
    }

    function onMove() {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(rebuild)
    }
    rebuild()
    map.on('move', onMove)
    map.on('resize', onMove)
    return () => {
      map.off('move', onMove)
      map.off('resize', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [map, data, variable?.id, variable?.diffOf?.[0], variable?.diffOf?.[1]])

  if (!path) return null
  const fill = isDark ? 'rgba(248,248,232,0.28)' : 'rgba(24,24,56,0.22)'
  const edge = isDark ? 'rgba(248,248,232,0.55)' : 'rgba(24,24,56,0.50)'
  // Wash the map out beneath the strip (gradient to the paper color) so the
  // profile reads against a calm ground; pan the map to see what's under it.
  const paper = isDark ? '12,12,28' : '248,248,232'
  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{ top: 0, right: 0, bottom: 0, width: WIDTH + 64, zIndex: 5 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, rgba(${paper},0) 0%, rgba(${paper},0.55) ${64}px, rgba(${paper},0.92) 100%)`,
        }}
      />
      <svg
        width={WIDTH}
        height={path.h}
        style={{ display: 'block', position: 'absolute', top: 0, right: 0 }}
      >
        <path d={path.d} fill={fill} stroke={edge} strokeWidth={1} />
      </svg>
      <span
        className="font-mono absolute"
        style={{
          top: 8,
          right: 6,
          fontSize: 9,
          letterSpacing: '0.08em',
          color: edge,
          writingMode: 'vertical-rl',
        }}
      >
        EMISSIONS BY LATITUDE
      </span>
    </div>
  )
}
