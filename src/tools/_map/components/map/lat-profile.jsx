/**
 * components/map/lat-profile.jsx
 *
 * Vertical marginal chart along the map's right edge: the latitudinal
 * distribution of the active variable (global band sums baked at build time,
 * config.latProfileUrl), Gaussian-smoothed so it reads as a kernel-density
 * trend rather than pinpoint spikes (config.latProfile.sigmaDeg, default 2°).
 *
 * Two modes, toggled by the small button at the strip's foot:
 *  - "globe" (default): a fixed global latitude axis spanning the data
 *    envelope, independent of the camera — the whole tropics-to-boreal story
 *    stays visible even when the map is zoomed in (or on a phone that can't
 *    zoom out far enough). Faint 30° graticule ticks for orientation.
 *  - "view": each pixel row aligns with the map latitude beside it,
 *    re-projected on every camera move.
 *
 * Computed difference variables (diffOf) subtract the two banked profiles —
 * profiles are additive, so the marginal stays exact.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

const WIDTH = 54
const FADE = 64
const profileCache = new Map()

function gaussianSmooth(values, sigmaBands) {
  if (!sigmaBands || sigmaBands <= 0) return values
  const half = Math.ceil(sigmaBands * 3)
  const kernel = []
  let ksum = 0
  for (let k = -half; k <= half; k++) {
    const w = Math.exp(-(k * k) / (2 * sigmaBands * sigmaBands))
    kernel.push(w)
    ksum += w
  }
  return values.map((_, i) => {
    let acc = 0
    for (let k = -half; k <= half; k++) {
      const j = i + k
      if (j >= 0 && j < values.length) acc += values[j] * kernel[k + half]
    }
    return acc / ksum
  })
}

export function LatProfile({ map, config, variable, isDark }) {
  const [data, setData] = useState(() => profileCache.get(config.latProfileUrl) ?? null)
  const mode = 'globe'
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

  const smoothed = useMemo(() => {
    if (!data || !variable) return null
    const raw = variable.diffOf
      ? (data.profiles[variable.diffOf[0]] ?? []).map(
          (v, i) => Math.abs(v - (data.profiles[variable.diffOf[1]]?.[i] ?? 0))
        )
      : data.profiles[variable.id]
    if (!raw || !raw.length) return null
    const sigmaDeg = config.latProfile?.sigmaDeg ?? 2
    const values = gaussianSmooth(raw, sigmaDeg / data.dlat)
    // Data envelope (first/last meaningful band) for the fixed global axis.
    const vmax = Math.max(...values) || 1
    let first = values.findIndex((v) => v > vmax * 0.002)
    let last = values.length - 1 - [...values].reverse().findIndex((v) => v > vmax * 0.002)
    if (first < 0) { first = 0; last = values.length - 1 }
    const pad = Math.round(2 / data.dlat)
    first = Math.max(0, first - pad)
    last = Math.min(values.length - 1, last + pad)
    return { values, vmax, latTop: data.lat0 - first * data.dlat, latBot: data.lat0 - (last + 1) * data.dlat }
  }, [data, variable?.id, variable?.diffOf?.[0], variable?.diffOf?.[1], config.latProfile?.sigmaDeg])

  useEffect(() => {
    if (!map || !data || !smoothed) { setPath(null); return undefined }
    const { values, vmax, latTop, latBot } = smoothed

    function latAtY(y, h) {
      if (mode === 'globe') return latTop + (y / h) * (latBot - latTop)
      return map.unproject([0, y]).lat
    }

    function rebuild() {
      const h = map.getContainer().clientHeight
      const steps = Math.max(60, Math.floor(h / 3))
      const pts = []
      for (let i = 0; i <= steps; i++) {
        const y = (i / steps) * h
        const lat = latAtY(y, h)
        const band = Math.floor((data.lat0 - lat) / data.dlat)
        const v = band >= 0 && band < values.length ? values[band] : 0
        pts.push([y, (v / vmax) * (WIDTH - 6)])
      }
      let d = `M ${WIDTH} ${pts[0][0]}`
      for (const [y, w] of pts) d += ` L ${(WIDTH - w).toFixed(1)} ${y.toFixed(1)}`
      d += ` L ${WIDTH} ${pts[pts.length - 1][0]} Z`
      // 30-degree ticks for the fixed axis
      const ticks = []
      if (mode === 'globe') {
        for (let latT = 60; latT >= -60; latT -= 30) {
          if (latT > latTop || latT < latBot) continue
          const y = ((latT - latTop) / (latBot - latTop)) * h
          ticks.push({ y, label: latT === 0 ? '0°' : `${Math.abs(latT)}°${latT > 0 ? 'N' : 'S'}` })
        }
      }
      setPath({ d, h, ticks })
    }

    function onMove() {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(rebuild)
    }
    rebuild()
    if (mode === 'view') {
      map.on('move', onMove)
    }
    map.on('resize', onMove)
    return () => {
      map.off('move', onMove)
      map.off('resize', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [map, data, smoothed, mode])

  if (!path) return null
  const fill = isDark ? 'rgba(248,248,232,0.28)' : 'rgba(24,24,56,0.22)'
  const edge = isDark ? 'rgba(248,248,232,0.55)' : 'rgba(24,24,56,0.50)'
  const paper = isDark ? '12,12,28' : '248,248,232'
  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{ top: 0, right: 0, bottom: 0, width: WIDTH + FADE, zIndex: 5 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, rgba(${paper},0) 0%, rgba(${paper},0.55) ${FADE}px, rgba(${paper},0.92) 100%)`,
        }}
      />
      <svg
        width={WIDTH + 26}
        height={path.h}
        style={{ display: 'block', position: 'absolute', top: 0, right: 0 }}
      >
        <g transform="translate(26, 0)">
          {path.ticks.map((t) => (
            <g key={t.label}>
              <line x1={0} x2={WIDTH} y1={t.y} y2={t.y} stroke={edge} strokeWidth={0.5} opacity={0.35} />
              <text
                x={-4}
                y={t.y + 3}
                textAnchor="end"
                style={{ font: '8px "JetBrains Mono", ui-monospace, monospace', fill: edge }}
              >
                {t.label}
              </text>
            </g>
          ))}
          <path d={path.d} fill={fill} stroke={edge} strokeWidth={1} />
        </g>
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
