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
import { buildColorScale, INTERPOLATORS } from './colormap.js'
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
// Per-zoom (radius coefficient, max-radius cap) pairs baked from iterative
// dev-panel tuning. The user dragged the radius and max sliders at each
// zoom of interest, read the zoom off the live readout, and reported the
// values — these are those values. The final on-screen radius is:
//
//   radius = min(cap, _scale × coef × radiusScale)
//
// where _scale comes from the feature (36 / 18 / 9 / 3 / 1 km) and
// radiusScale is a global dev-panel override (default 1.0). MapLibre
// interpolates linearly between stops in (zoom-2)-base, so values between
// the baked zooms ramp smoothly.
const RADIUS_STOPS = [
  // zoom, coef,  cap
  [3.0,   0.056, 4.5],
  [3.8,   0.470, 4.5],
  [4.0,   0.132, 5.0],
  [4.3,   0.159, 5.0],
  [4.5,   0.186, 5.0],
  [5.0,   0.225, 5.0],
  [5.2,   0.285, 5.0],
  [5.5,   0.330, 5.0],
  [5.8,   0.412, 5.0],
  [6.0,   0.465, 5.0],
  [6.2,   0.558, 5.0],
  [6.3,   0.676, 5.1],
  [6.5,   0.793, 6.1],
]

export const DEFAULT_TUNING = {
  alphaFloor: 0.10,
  alphaPower: 1.0,
  // Global multiplier on the baked per-zoom radius curve. Default 1.0
  // means "use the curve as iterated." Drag the dev-panel slider away
  // from 1.0 to scale every cell up/down uniformly without re-tuning
  // every zoom step.
  radiusScale: 1.0,
  // 0 (or null) means "use the per-zoom default cap from RADIUS_STOPS."
  // Set to a positive number via the dev panel to globally override.
  maxRadiusPx: 0,
}

function buildRadiusExpr(tuning) {
  const s = tuning.radiusScale ?? 1.0
  const overrideCap = tuning.maxRadiusPx
  const SCALE = ['coalesce', ['to-number', ['get', '_scale']], 1]
  // MapLibre validation requires `['zoom']` to sit at the top level of an
  // interpolate or step. So the per-tier branching has to live *inside*
  // each interpolate stop, not wrapping it. Each stop is itself a case
  // expression on `_scale`: 1 km pixels → 2.5 px, 3 km bins → 1.25 px,
  // 36 / 18 / 9 km cells → the per-zoom national curve coefficient.
  function stop(coef, defaultCap) {
    const cap = overrideCap != null && overrideCap > 0 ? overrideCap : defaultCap
    return [
      'case',
      ['==', SCALE, 1], 2.5 * s,
      ['==', SCALE, 3], 1.25 * s,
      ['min', cap, ['*', SCALE, coef * s]],
    ]
  }
  const out = ['interpolate', ['exponential', 2], ['zoom']]
  for (const [z, coef, cap] of RADIUS_STOPS) out.push(z, stop(coef, cap))
  return out
}

const SOURCE_ID = 'just-air-data'

export function justAirLayerIds(config) {
  return (config.scales ?? []).map((s) => `just-air-cells-${s.value}`)
}

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 * @param {object}                                                  [tuning]
 *   Optional paint-tuning overrides (alphaFloor, alphaPower, r3, r4, r12,
 *   maxRadiusPx). Defaults to DEFAULT_TUNING. Used by the dev controls
 *   panel to let the user iterate on values without editing source.
 */
export function useJustAirLayers(map, config, state, tuning) {
  const t = { ...DEFAULT_TUNING, ...(tuning ?? {}) }
  const scales = config.scales
  const tilesUrl = config.tilesUrl
  const sourceLayer = config.sourceLayer ?? config.id

  const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const variableRef = useRef(variable)
  variableRef.current = variable
  const isDarkRef = useRef(state.colorScheme === 'dark')
  isDarkRef.current = state.colorScheme === 'dark'
  const tuningRef = useRef(t)
  tuningRef.current = t

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
            buildColorExpr(variableRef.current, isDarkRef.current, colorRangeRef.current, tuningRef.current))
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
        // Always replace any existing layer with the same id so a stale
        // minzoom/maxzoom from a prior HMR run (where React kept the
        // useEffect cleanup from firing) doesn't shadow the current config.
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        try {
          const layerSpec = {
            id: layerId,
            type: 'circle',
            source: SOURCE_ID,
            'source-layer': sourceLayer,
            minzoom: s.minZoom ?? 0,
            filter: ['==', ['coalesce', ['to-number', ['get', '_scale']], 0], s.value],
            paint: {
              'circle-radius':       buildRadiusExpr(tuningRef.current),
              'circle-color':        buildColorExpr(variableRef.current, isDarkRef.current, colorRangeRef.current, tuningRef.current),
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
        map.setPaintProperty(layerId, 'circle-color',   buildColorExpr(variableRef.current, isDarkRef.current, recomputed, tuningRef.current))
        map.setPaintProperty(layerId, 'circle-opacity', buildOpacityExpr(variableRef.current, s))
        map.setPaintProperty(layerId, 'circle-radius',  buildRadiusExpr(tuningRef.current))
      } catch (err) {
        console.error('[useJustAirLayers] setPaintProperty', layerId, err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.activeLayer, state.activeDimensions, state.colorScheme,
      t.alphaFloor, t.alphaPower, t.r3, t.r4, t.r6, t.r9, t.r12, t.radiusScale, t.maxRadiusPx])
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

function buildColorExpr(variable, isDark, colorRange, tuning) {
  const t_ = { ...DEFAULT_TUNING, ...(tuning ?? {}) }
  if (!variable) return '#888888'
  if (variable.type === 'categorical') {
    const expr = ['match', ['get', variable.id]]
    for (const cat of variable.categories ?? []) expr.push(cat.id, cat.color)
    expr.push('#888888')
    return expr
  }

  const zero = variable.domain?.zero ?? variable.domain?.min ?? 0
  const cfgMax = variable.domain?.max ?? 1
  const cfgMin = variable.domain?.min ?? 0
  // Prefer the data-derived p99 |value − zero| when available — without it
  // a variable whose config domain max is far above the actual data (e.g.
  // mortality at 1e-3 vs typical values 1e-5) renders at near-zero alpha
  // and near-zero color saturation across the whole map. Falls back to the
  // configured domain for the first paint while features are still
  // streaming in.
  const dataDev = colorRange?.maxDev
  const maxPosDev = dataDev ?? Math.max(cfgMax - zero, 0.001)
  const maxNegDev = dataDev ?? Math.max(zero - cfgMin, 0.001)
  // The COLOR stops are spread across this range. When dataDev is known,
  // we use it on both sides so colors saturate at the same p99 magnitude
  // that already controls alpha — matching the auto-rescale behavior the
  // user has been seeing for alpha (and removing the "everything is one
  // faint shade" effect on variables with a wide configured domain like
  // population: 0–5000 with typical values < 1000).
  const min = variable.diverging ? (zero - maxNegDev) : zero
  const max = zero + maxPosDev

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
  // Solid-color cells alpha-blend more aggressively than colormap cells
  // (every cell paints the same hue at full saturation, so overlap turns
  // mid-range cells into a wash). Push the floor up to 0.40 so anything
  // below ~40 % of p99 magnitude drops to alpha 0; the remaining mid-to-
  // high tail rises through a t^1.8 ramp so only the hot spots saturate.
  // Per-variable alpha overrides win when set. Lets the user tune mortality
  // and population fades independently from the global PM-flavored defaults.
  const ALPHA_FLOOR = variable.alphaFloor ?? t_.alphaFloor
  const ALPHA_POWER = variable.alphaPower ?? t_.alphaPower
  // `histogramMin` doubles as a hard cutoff on the map for sequential
  // variables — any cell whose value falls below this paints fully
  // transparent. Keeps the same threshold synchronized with what the
  // sidebar chart clips out, so the user sees the same "above-floor"
  // population on both.
  const HARD_MIN = (!variable.diverging && variable.histogramMin != null) ? variable.histogramMin : null
  function alphaForValue(v) {
    if (HARD_MIN != null && v < HARD_MIN) return 0
    const ti = v >= zero ? (v - zero) / maxPosDev : (zero - v) / maxNegDev
    const tc = Math.max(0, ti)
    if (tc < ALPHA_FLOOR) return 0
    const tr = (tc - ALPHA_FLOOR) / (1 - ALPHA_FLOOR)
    return Math.min(1, Math.pow(tr, ALPHA_POWER))
  }

  // Cells that don't carry the active variable (e.g. 9 km national cells
  // when the user picks income or % non-Hispanic white) get this wrapped
  // around the color expression below so they render fully transparent
  // instead of falling back to MapLibre's default black.
  function gated(expr) {
    return ['case', ['has', variable.id], expr, 'rgba(0,0,0,0)']
  }

  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  const steps = 24

  if (variable.diverging) {
    // Two modes for diverging:
    //   (a) Binary anchors — when the variable pins `solidColor` or
    //       `solidColorNegative`, the two halves render as those two
    //       colors only (no continuous gradient). Existing diff layers
    //       use this for the "blue = saves lives, red = adds deaths"
    //       look.
    //   (b) Continuous colormap — when neither anchor is set, the
    //       configured `colormap` is interpolated end-to-end with
    //       neutral at the midpoint. Used for PM₂.₅ low/high with
    //       zero=5 µg/m³ (WHO threshold) so the map reads as a smooth
    //       dark-blue → white → dark-red ramp.
    const hasAnchors = variable.solidColor != null || variable.solidColorNegative != null
    if (hasAnchors) {
      const bluePos = isDark ? [67, 147, 195] : [33, 102, 172]
      const redPos  = isDark ? [214, 96, 77]  : [178, 24, 43]
      const posIsBlue = variable.colormap !== 'BuRd'
      const fallbackPos = posIsBlue ? bluePos : redPos
      const fallbackNeg = posIsBlue ? redPos  : bluePos
      const posRgb = variable.solidColor ? hexToRgb(variable.solidColor) : fallbackPos
      const negRgb = variable.solidColorNegative ? hexToRgb(variable.solidColorNegative) : fallbackNeg
      for (let i = 0; i <= steps; i++) {
        const v = min + (i / steps) * (max - min)
        const rgb = v >= zero ? posRgb : negRgb
        const a = alphaForValue(v)
        expr.push(v, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`)
      }
      return gated(expr)
    }
    // Continuous diverging via the configured colormap. The (i / steps)
    // index drives the colormap from one extreme to the other; the
    // rescaled min/max are symmetric around zero so step 0.5 is exactly
    // the zero crossing (neutral color in BuRd / RdBu / PuOr).
    const baseInterp = INTERPOLATORS[variable.colormap] ?? INTERPOLATORS.RdBu
    const cmStart = variable.colormapStart ?? 0
    const interp = cmStart > 0 ? (t) => baseInterp(cmStart + (1 - cmStart) * t) : baseInterp
    for (let i = 0; i <= steps; i++) {
      const v = min + (i / steps) * (max - min)
      const ti = i / steps
      const a = alphaForValue(v)
      expr.push(v, withAlpha(interp(ti), a))
    }
    return gated(expr)
  }

  // Sequential: if the variable pins a `solidColor`, paint every stop in
  // that single hue with alpha varying by value (intensity reads as a
  // single-hue heatmap). Otherwise fall back to the full colormap
  // interpolated across the data range.
  if (variable.solidColor) {
    const rgb = hexToRgb(variable.solidColor)
    for (let i = 0; i <= steps; i++) {
      const v = min + (i / steps) * (max - min)
      const a = alphaForValue(v)
      expr.push(v, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`)
    }
    return gated(expr)
  }
  const scale = buildColorScale(variable)
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    const a = alphaForValue(v)
    expr.push(v, withAlpha(scale(v), a))
  }
  return gated(expr)
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [r, g, b]
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
