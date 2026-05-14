/**
 * lib/use-just-air-layers.js
 *
 * Renders Just Air's single multi-scale PMTiles as a stack of circle layers
 * that progressively reveal finer resolution as the user zooms in — the
 * Firefuels feel, but with explicit per-scale zoom bands declared on the
 * project config rather than hardcoded.
 *
 * The tileset (built by scripts/build-just-air-tiles.mjs) has one feature
 * per cell, tagged with `_scale = cell side length in km`:
 *
 *   _scale = 36   4×4 supercell average     visible z 0–6
 *   _scale = 9    9 km national cell        visible z 5–11
 *   _scale = 1    native city pixel         visible z 8–14
 *
 * Each band gets one circle layer filtered to its scale value. The circle
 * radius follows the same exponential-zoom curve Firefuels uses, multiplied
 * by `_scale`, so a 36 km supercell at z3 reads the same physical size as
 * a 1 km city pixel at z8.
 */

import { useEffect, useRef } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

// Tiling-exact base radius for a 1 km cell — the natural Mercator-derived
// pixel size of a 1 km × 1 km cell, scaled by FILL_FACTOR so cells visibly
// overlap (no dark gaps between neighbors). MAX_RADIUS_PX caps a 9 km cell
// at high zoom so it doesn't swell to 120 px; MIN_RADIUS_PX keeps small
// cells visible as a dot.
// FILL_FACTOR 1.0 = tiling-exact (circles just-touch their neighbors,
// no overlap). Smaller cells appear as sub-pixel dots at zoom levels
// below their native, then expand to just-touching as the user zooms in,
// then finer scales emerge to fill the spaces — matching Firefuels' LOD
// disclosure. We don't enforce a MIN_RADIUS floor because clamping
// sub-pixel circles up to 1+ px reintroduces the overlap the user
// explicitly didn't want.
// FILL_FACTOR 4.0 brings Just Air's default-zoom (z3) supercells into
// rough visual parity with Firefuels' default-zoom (z5) supercells. With
// the tighter z3 framing, FILL_FACTOR 1.0 left a single 36 km supercell
// at ~2 px radius — visually a dotted overlay — while Firefuels at z5
// shows _scale=40 cells at ~9 px radius (a full-coverage surface). The
// 4× bump compensates for the two-zoom-level head-start Firefuels has.
const FILL_FACTOR = 4.0
const R4  = 0.057 * FILL_FACTOR
const R12 = 16.0  * FILL_FACTOR
// MAX_RADIUS_PX 12 caps overshooting at high zoom while leaving headroom
// for the natural growth between scale transitions. 9 km cells past z 8
// still need to look discrete (so the eye sees the next scale taking
// over), but 36 km supercells at default zoom should hit the 12 px cap
// for a strong opening visual.
const MAX_RADIUS_PX = 12

// MapLibre forbids `['zoom']` from appearing anywhere except as the direct
// input to a top-level step/interpolate expression. The earlier attempt to
// clamp the whole interpolate inside ['max', MIN, ['min', MAX, ...]] caused
// MapLibre to reject every just-air layer at register time, which is why
// the map looked empty. Push the min/max clamp INSIDE each stop instead —
// each stop value is just a scale × R constant (no zoom), so clamping it
// is fine.
// Cap-only (no MIN floor) so cells stay at their natural tiling size at
// all zoom levels, even when that means a sub-pixel circle. MapLibre
// anti-aliases sub-pixel circles to faint dots — better than over-
// sizing them up to 2 px and creating visible overlap.
const clampScale = (k) => [
  'min', MAX_RADIUS_PX, [
    '*', ['coalesce', ['to-number', ['get', '_scale']], 1], k,
  ],
]
const RADIUS = [
  'interpolate', ['exponential', 2], ['zoom'],
  4,  clampScale(R4),
  12, clampScale(R12),
  22, clampScale(R12),
]

const SOURCE_ID = 'just-air-data'

export function justAirLayerIds(config) {
  return (config.scales ?? []).map((s) => `just-air-cells-${s.value}`)
}

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 */
export function useJustAirLayers(map, config, state) {
  const scales = config.scales
  const tilesUrl = config.tilesUrl
  const sourceLayer = config.sourceLayer ?? config.id

  const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const variableRef = useRef(variable)
  variableRef.current = variable
  const isDarkRef = useRef(state.colorScheme === 'dark')
  isDarkRef.current = state.colorScheme === 'dark'

  // colorRangeRef caches the p99 of |value − zero| for the active variable
  // so the alpha-in-colormap math uses the actual data spread rather than
  // the configured domain max (which for mortality is 1e-3 even though
  // typical values cluster around 1e-5 — without this rescale every cell
  // ended up at near-zero alpha and the map looked blank).
  const colorRangeRef = useRef(null)
  const colorRangeLockedRef = useRef(false)

  // ── Source + layer lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    if (!scales || scales.length === 0) return
    if (!tilesUrl) return

    function computeColorRange() {
      if (colorRangeLockedRef.current) return
      const v = variableRef.current
      if (!v || v.type === 'categorical') return
      try {
        const features = map.querySourceFeatures(SOURCE_ID, { sourceLayer })
        if (features.length < 10) return
        const values = features
          .map((f) => f.properties?.[v.id])
          .filter((x) => x != null && !isNaN(x))
        if (values.length < 10) return
        const zero = v.domain?.zero ?? v.domain?.min ?? 0
        const absDev = values.map((x) => Math.abs(x - zero)).sort((a, b) => a - b)
        const idx = Math.floor(0.99 * (absDev.length - 1))
        const p99 = absDev[idx]
        if (p99 > 0) {
          colorRangeRef.current = { maxDev: p99 }
          // Lock only once we've had a chance to compute across a real sample
          // (not just a single tile's worth) — leave it unlocked if we got
          // few features so a subsequent sourcedata event with a fuller
          // sample can refine the p99 before we settle on a final scale.
          if (values.length >= 100) colorRangeLockedRef.current = true
          updatePaint()
        }
      } catch (_) { /* source not loaded yet */ }
    }

    function updatePaint() {
      if (!scales) return
      for (const s of scales) {
        const layerId = `just-air-cells-${s.value}`
        if (!map.getLayer(layerId)) continue
        try {
          map.setPaintProperty(layerId, 'circle-color',
            buildColorExpr(variableRef.current, isDarkRef.current, colorRangeRef.current))
        } catch (_) { /* ignore */ }
      }
    }

    function addLayers() {
      if (!map.isStyleLoaded()) return
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'vector',
          url: `pmtiles://${tilesUrl}`,
        })
      }

      // Insert data circles *below* the state-border / city-label lines so
      // they don't get hidden under the data. The box overlay (metro
      // rectangles + labels) and any CA-specific layers also stay on top.
      const beforeId = map.getLayer('us-state-borders') ? 'us-state-borders'
                     : map.getLayer('box-overlay-fill') ? 'box-overlay-fill'
                     : map.getLayer('city-labels-r1')   ? 'city-labels-r1'
                     : map.getLayer('ca-border')        ? 'ca-border'
                     : undefined

      for (const s of scales) {
        const layerId = `just-air-cells-${s.value}`
        if (map.getLayer(layerId)) continue
        try {
          const layerSpec = {
            id: layerId,
            type: 'circle',
            source: SOURCE_ID,
            'source-layer': sourceLayer,
            minzoom: s.minZoom ?? 0,
            filter: ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], s.value],
            paint: {
              'circle-radius':       RADIUS,
              'circle-color':        buildColorExpr(variableRef.current, isDarkRef.current, colorRangeRef.current),
              'circle-opacity':      buildOpacityExpr(variableRef.current, s),
              'circle-stroke-width': 0,
              'circle-blur':         0,
            },
          }
          if (s.maxZoom != null) layerSpec.maxzoom = s.maxZoom
          map.addLayer(layerSpec, beforeId)
        } catch (err) {
          console.error('[useJustAirLayers] addLayer', layerId, err)
        }
      }
    }

    // Fire computeColorRange on every sourcedata event for our source
    // (not just isSourceLoaded=true) — the pmtiles protocol fetches one
    // tile at a time via byte-range and MapLibre's isSourceLoaded flag for
    // vector sources didn't reliably flip true with this protocol, leaving
    // computeColorRange permanently unfired and the alpha math stuck on
    // the configured domain max. computeColorRange has its own
    // small-sample guard so harmless to call repeatedly.
    function onSourceData(e) {
      if (e.sourceId === SOURCE_ID) computeColorRange()
    }
    function onIdle() { computeColorRange() }

    map.on('styledata', addLayers)
    map.on('sourcedata', onSourceData)
    map.on('idle', onIdle)
    if (map.isStyleLoaded()) addLayers()
    else map.once('idle', addLayers)
    computeColorRange()

    return () => {
      map.off('styledata', addLayers)
      map.off('sourcedata', onSourceData)
      map.off('idle', onIdle)
      for (const s of scales) {
        const layerId = `just-air-cells-${s.value}`
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Paint repaint when active variable / scheme flips ──────────────────
  useEffect(() => {
    if (!map || !scales) return
    if (!map.isStyleLoaded()) return
    // New variable means new value distribution — drop the cached p99 so
    // the next sourcedata event recomputes for the new column.
    colorRangeRef.current = null
    colorRangeLockedRef.current = false
    let recomputed = null
    try {
      const v = variableRef.current
      if (v && v.type !== 'categorical') {
        const features = map.querySourceFeatures(SOURCE_ID, { sourceLayer })
        if (features.length >= 30) {
          const values = features
            .map((f) => f.properties?.[v.id])
            .filter((x) => x != null && !isNaN(x))
          if (values.length >= 30) {
            const zero = v.domain?.zero ?? v.domain?.min ?? 0
            const absDev = values.map((x) => Math.abs(x - zero)).sort((a, b) => a - b)
            const idx = Math.floor(0.99 * (absDev.length - 1))
            const p99 = absDev[idx]
            if (p99 > 0) {
              recomputed = { maxDev: p99 }
              colorRangeRef.current = recomputed
              colorRangeLockedRef.current = true
            }
          }
        }
      }
    } catch (_) { /* ignore */ }
    for (const s of scales) {
      const layerId = `just-air-cells-${s.value}`
      if (!map.getLayer(layerId)) continue
      try {
        map.setPaintProperty(layerId, 'circle-color',   buildColorExpr(variableRef.current, isDarkRef.current, recomputed))
        map.setPaintProperty(layerId, 'circle-opacity', buildOpacityExpr(variableRef.current, s))
      } catch (err) {
        console.error('[useJustAirLayers] setPaintProperty', layerId, err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.activeLayer, state.activeDimensions, state.colorScheme])
}

// ── Paint expression builders ──────────────────────────────────────────────
//
// "Fade to transparent at zero" is implemented by embedding alpha directly
// in the colormap stops: each rgba string's alpha component is a function
// of |value − zero| / extremum. value at zero ⇒ alpha 0 (fully transparent),
// value at the configured extremum ⇒ alpha 1 (fully opaque), with a t^1.5
// power curve so the falloff is sharp near zero (low-value cells truly
// disappear into the basemap) and gentler at the extremes.
//
// This is the same trick Firefuels' continuous-legend gradient uses to
// produce its distinctive faded-low-end visual — we just lift it from
// the legend SVG into the actual map paint expression so the map matches
// the legend instead of fighting it. circle-opacity is then a plain
// constant (no value-driven magnitude factor) which keeps the alpha math
// readable and avoids opacity-multiplied-twice bugs.

function withAlpha(rgbStr, alpha) {
  // Accepts d3 outputs (rgb(r,g,b)) and hex (#rrggbb); produces rgba.
  if (rgbStr.startsWith('rgba')) return rgbStr
  if (rgbStr.startsWith('rgb(')) {
    return rgbStr.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `,${alpha.toFixed(3)})`)
  }
  if (rgbStr.startsWith('#') && rgbStr.length === 7) {
    const r = parseInt(rgbStr.slice(1, 3), 16)
    const g = parseInt(rgbStr.slice(3, 5), 16)
    const b = parseInt(rgbStr.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
  }
  return rgbStr
}

function buildColorExpr(variable, isDark, colorRange) {
  if (!variable) return '#888888'
  if (variable.type === 'categorical') {
    const expr = ['match', ['get', variable.id]]
    for (const cat of variable.categories ?? []) expr.push(cat.id, cat.color)
    expr.push('#888888')
    return expr
  }

  const zero = variable.domain?.zero ?? variable.domain?.min ?? 0
  const max  = variable.domain?.max ?? 1
  const min  = variable.domain?.min ?? 0
  // Prefer the data-derived p99 |value − zero| when available — without it
  // a variable whose config domain max is far above the actual data (e.g.
  // mortality at 1e-3 vs typical values 1e-5) renders at near-zero alpha
  // across the whole map. Falls back to the configured domain for the
  // first paint while features are still streaming in.
  const dataDev = colorRange?.maxDev
  const maxPosDev = dataDev ?? Math.max(max  - zero, 0.001)
  const maxNegDev = dataDev ?? Math.max(zero - min,  0.001)

  // Hard transparency floor on the bottom of the data range, then a
  // pow-1.4 ramp the rest of the way. Anything below ALPHA_FLOOR of the
  // data spread renders at alpha 0 (rural cells drop out completely
  // instead of painting a faint wash across the whole map).
  // Hard truncate the histogram's low tail: anything whose magnitude is
  // below ALPHA_FLOOR × data-p99 paints fully transparent. From there up,
  // the alpha rises through a t^1.6 curve so mid-range values stay
  // translucent and only the top of the distribution lands at full
  // opacity — keeping the rural baseline invisible against the paper
  // basemap and leaving only the metro-scale hotspots visibly colored.
  // User feedback: 0.45 floor cut too much of the moderate-value tail.
  // Soften back to 0.25 — cells whose magnitude is below ~quarter of the
  // p99 |value − zero| still drop out (no faint wash over rural CONUS),
  // but the mid-range that drives the actual variation stays visible.
  const ALPHA_FLOOR = 0.25
  function alphaForValue(v) {
    const t = v >= zero ? (v - zero) / maxPosDev : (zero - v) / maxNegDev
    const tc = Math.max(0, t)
    if (tc < ALPHA_FLOOR) return 0
    const tr = (tc - ALPHA_FLOOR) / (1 - ALPHA_FLOOR)
    return Math.min(1, Math.pow(tr, 1.5))
  }

  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  const steps = 24

  if (variable.diverging) {
    // Binary blue/red anchor colors. The colormap name picks which side
    // is which: RdBu sends max → blue (Firefuels' "positive = good ="
    // blue convention); BuRd inverts so max → red (Just Air diff layers,
    // where positive diff = High CDR is dirtier = bad reads red).
    const bluePos = isDark ? [67, 147, 195] : [33, 102, 172]
    const redPos  = isDark ? [214, 96, 77]  : [178, 24, 43]
    const posIsBlue = variable.colormap !== 'BuRd'
    const posRgb = posIsBlue ? bluePos : redPos
    const negRgb = posIsBlue ? redPos  : bluePos
    for (let i = 0; i <= steps; i++) {
      const v = min + (i / steps) * (max - min)
      const rgb = v >= zero ? posRgb : negRgb
      const a = alphaForValue(v)
      expr.push(v, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`)
    }
    return expr
  }

  // Sequential: full colormap with alpha embedded in each stop.
  const scale = buildColorScale(variable)
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    const a = alphaForValue(v)
    expr.push(v, withAlpha(scale(v), a))
  }
  return expr
}

// circle-opacity is now just a constant peak multiplied by a zoom-fade so
// adjacent scale bands cross-fade at their boundaries instead of snapping
// (the user reported visible "disappear / reappear" pops at the band
// transitions). The value-magnitude fade is embedded in the color alpha
// (see buildColorExpr).
function buildOpacityExpr(_variable, scaleEntry) {
  return buildZoomFade(scaleEntry)
}

function buildZoomFade(s) {
  const fade = 0.25
  const minZ = s.minZoom ?? 0
  const maxZ = s.maxZoom
  if (maxZ == null) {
    return ['interpolate', ['linear'], ['zoom'],
      Math.max(0, minZ - fade), 0,
      minZ,                     1,
    ]
  }
  return ['interpolate', ['linear'], ['zoom'],
    Math.max(0, minZ - fade), 0,
    minZ,                     1,
    Math.max(minZ + 0.0001, maxZ - fade), 1,
    maxZ,                     0,
  ]
}
