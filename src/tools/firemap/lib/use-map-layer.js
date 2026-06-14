/**
 * lib/use-map-layer.js
 *
 * React hook: manages three circle layers for multi-resolution display.
 *
 *   firemap-cells-coarse (LAYER_ID_COARSE) — 0.4° fallback cells  (_scale ≥ 20), zoom < 7
 *   firemap-cells-agg    (LAYER_ID_AGG)   — 0.05° main data layer (_scale 2–19),  all zooms
 *   firemap-cells        (LAYER_ID)       — original 0.01° cells  (_scale ≤ 1),   zoom 10+
 *
 * RADIUS DESIGN — NON-OVERLAPPING TILING
 * ───────────────────────────────────────
 * BASE_RADIUS is tiling-exact for one original cell (0.01°, ~1 km).
 * It doubles with each zoom step (exponential base 2) so cells just-touch
 * at every zoom level without overlapping.
 *
 *   zoom  4 →  0.057 px  (tiling-exact, sub-pixel for scale-1 cells)
 *   zoom  8 →  0.91  px
 *   zoom 10 →  3.65  px
 *   zoom 12 → 14.56  px  (≈ 15 px by the zoom-12 anchor)
 *
 * Each layer's radius = _scale × BASE_RADIUS.  The composite expression form
 * (zoom interpolate at the outermost level, data expression inside each stop)
 * is the only valid MapLibre form when combining camera + data expressions.
 *
 *   _scale 40 at zoom 5.5 → 40 × 0.164 = 6.6 px  ✓  state-view circles
 *   _scale 10 at zoom 9   → 10 × 1.82  = 18.2 px ✓  regional circles
 *   _scale  1 at zoom 12  →  1 × 15.0  = 15.0 px ✓  original cells
 *
 * LOD TRANSITIONS
 * ─────────────────────────────────
 * The 0.05° (scale-5) circles are visible at all zoom levels.  At zoom 7 they
 * are ~2.3 px radius — dense, growing to 18.75 px at max zoom 10 (just-touching).
 * The scale-40 fallback layer covers zoom < 7 where scale-5 circles drop below
 * ~2 px.  The map is capped at maxZoom 10 (~14k scale-5 cells on screen).
 *
 * COLOR / OPACITY DOMAIN
 * ──────────────────────
 * The color scale and opacity use the config domain directly — no dynamic
 * resampling from the current viewport. This keeps the color scale fixed
 * as the user pans and zooms, matching the statewide distribution in the sidebar.
 */

import { useEffect, useRef } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

export const SOURCE_ID       = 'firemap-data'
export const LAYER_ID_COARSE = 'firemap-cells-coarse' // 0.1° state view   (_scale ≥ 10, zoom < 7)
export const LAYER_ID_MED    = 'firemap-cells-med'    // 0.03° finest dev  (_scale 3–9,  zoom 7+)
export const LAYER_ID_AGG    = 'firemap-cells-agg'    // 0.01° full res    (_scale < 3, PMTiles zoom 9+)
export const LAYER_ID        = 'firemap-cells'        // future PMTiles    (unused in GeoJSON mode)
export const LAYER_IDS       = [LAYER_ID_COARSE, LAYER_ID_MED, LAYER_ID_AGG, LAYER_ID]

// ── Radius ────────────────────────────────────────────────────────────────────
//
// BASE_RADIUS: tiling-exact for a 1× original cell (0.01°).
// Derivation: r = 0.01° × (256 × 2^z / 360°) / 2 = 0.003556 × 2^z
//   zoom  4 → 0.003556 × 16   = 0.057 px
//   zoom 12 → 0.003556 × 4096 = 14.56 px  (we use 15.0 as the anchor, ~3% generous)
//
// FILL_FACTOR > 1 makes circles larger than just-touching, creating a filled
// appearance like CarbonPlan. At 1.5, circles overlap 50% at their native zoom.
// Adjust this constant to tune how dense/spacious the map looks.
const FILL_FACTOR = 2.0

const R4  = 0.057  * FILL_FACTOR
const R12 = 15.0   * FILL_FACTOR

// All scaled layers: composite expression — zoom interpolation at the outer level,
// _scale multiplied into each stop.  MapLibre forbids ['zoom'] inside a ['*', ...].
const RADIUS_SCALED = [
  'interpolate', ['exponential', 2], ['zoom'],
  4,  ['*', ['coalesce', ['to-number', ['get', '_scale']], 1], R4],
  12, ['*', ['coalesce', ['to-number', ['get', '_scale']], 1], R12],
  22, ['*', ['coalesce', ['to-number', ['get', '_scale']], 1], R12],
]


// Original layer uses the pure camera expression (no _scale data dependency)
const RADIUS_ORIGINAL = [
  'interpolate', ['exponential', 2], ['zoom'],
  4,  R4,
  12, R12,
  22, R12,
]


/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 * @param {number|null} opacityP95
 */
/**
 * From a sorted numeric array, compute:
 *   - min/max color range (p1–p99 of all values)
 *   - posP99dev: 99th percentile of (value − zero) for positive values
 *   - negP99dev: 99th percentile of (zero − value) for negative values
 *
 * Storing per-side p99 means the most extreme 1% on each side doesn't
 * compress the rest of the opacity scale — both sides reach full opacity
 * at their own 99th percentile.
 */
function buildColorRange(sortedValues, zero) {
  if (sortedValues.length < 5) return null
  const p01 = sortedValues[Math.floor(sortedValues.length * 0.01)] ?? sortedValues[0]
  const p99 = sortedValues[Math.floor(sortedValues.length * 0.99)] ?? sortedValues[sortedValues.length - 1]
  if (p99 <= p01) return null

  const posDevs = sortedValues.filter(v => v > zero).map(v => v - zero).sort((a, b) => a - b)
  const negDevs = sortedValues.filter(v => v < zero).map(v => zero - v).sort((a, b) => a - b)

  const posP99dev = posDevs.length > 0
    ? Math.max(posDevs[Math.floor(posDevs.length * 0.99)] ?? posDevs[posDevs.length - 1], 0.001)
    : Math.max(p99 - zero, 0.001)
  const negP99dev = negDevs.length > 0
    ? Math.max(negDevs[Math.floor(negDevs.length * 0.99)] ?? negDevs[negDevs.length - 1], 0.001)
    : Math.max(zero - p01, 0.001)

  return { min: p01, max: p99, posP99dev, negP99dev }
}

export function useMapLayer(map, config, state, opacityP95) {
  const isPlaceholder = config.tilesUrl === 'REPLACE_WITH_R2_URL'

  const variableRef = useRef(null)
  variableRef.current = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  const opacityP95Ref = useRef(null)
  opacityP95Ref.current = opacityP95

  const isDarkRef = useRef(state.colorScheme === 'dark')
  isDarkRef.current = state.colorScheme === 'dark'

  // Actual p1–p99 data range computed from loaded source features.
  // Computed ONCE per variable (locked after first successful query) so the
  // color scale is stable across zoom levels and tile loads.
  const colorRangeRef = useRef(null)
  const colorRangeLockedRef = useRef(false)

  // Shared re-entrancy guard across both effects.
  // addLayer/setPaintProperty fire styledata synchronously; without this guard
  // the styledata handler recurses until the call stack overflows.
  const paintingRef = useRef(false)

  // ── Source / layer lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!map) return
    // Bow out for projects rendered by an alternate hook — without this we
    // would double-add data layers and the second set (added later, with no
    // beforeId) would float to the top of the style and cover state borders
    // and city labels. The two alternate paths are:
    //   - tileSources  → useMultiSourceLayers (polygon fill)
    //   - scales       → useJustAirLayers     (multi-scale circles)
    if (config.tileSources) return
    if (config.scales) return

    const sourceConfig = isPlaceholder
      ? { type: 'geojson', data: '/fuel-treatment.geojson' }
      : { type: 'vector', url: `pmtiles://${config.tilesUrl}` }

    function addLayers() {
      if (paintingRef.current) return
      if (!map.isStyleLoaded()) return
      paintingRef.current = true
      try {
        if (map.getSource(SOURCE_ID)) {
          updatePaint()
          return
        }

        console.log('[useMapLayer] adding source', sourceConfig.type, sourceConfig.url ?? sourceConfig.data)
        map.addSource(SOURCE_ID, sourceConfig)

        const variable = variableRef.current
        // COARSE circles sit BELOW ca-mask-fill so the mask clips any border-straddling
        // 0.1° cells that extend outside California.
        // MED/AGG sit ABOVE the mask (below city labels) — their cells are fine-grained
        // enough that border artifacts are negligible.
        const beforeCoarse = map.getLayer('ca-mask-fill') ? 'ca-mask-fill'
                           : map.getLayer('city-labels-r1') ? 'city-labels-r1'
                           : undefined
        const before = map.getLayer('city-labels-r1') ? 'city-labels-r1'
                     : map.getLayer('ca-border')      ? 'ca-border'
                     : undefined
        const sourceLayerProp = isPlaceholder ? {} : { 'source-layer': config.id }
        const color   = buildColorExpression(variable, colorRangeRef.current, isDarkRef.current)
        const opacity = buildOpacityExpression(variable, opacityP95Ref.current, colorRangeRef.current)

        // ── State-view: scale ≥ 10 (0.1° grid, 3,878 cells), zoom < 7 ──
        // COARSE stays visible through zoom 7 so the bounds-derived default zoom
        // (~6–7 on a typical screen) shows only big circles, not a mix.
        map.addLayer({
          id: LAYER_ID_COARSE,
          type: 'circle',
          source: SOURCE_ID,
          minzoom: 0,
          maxzoom: 5.8,
          filter: ['>=', ['coalesce', ['to-number', ['get', '_scale']], 0], 10],
          ...sourceLayerProp,
          paint: {
            'circle-radius':       RADIUS_SCALED,
            'circle-color':        color,
            'circle-opacity':      opacity,
            'circle-stroke-width': 0,
            'circle-blur':         0,
          },
        }, beforeCoarse)

        // ── Finest dev LOD: scale 3–9 (0.03° grid, 36,670 cells), zoom 7+ ──
        // Replaces COARSE at zoom 7 so there is no overlap at the default view.
        // At zoom 7: scale=3 circles ~3px. At zoom 10: ~17px (just-touching).
        // NOTE: full 0.01° resolution (292k cells) requires PMTiles.
        map.addLayer({
          id: LAYER_ID_MED,
          type: 'circle',
          source: SOURCE_ID,
          minzoom: 5.8,
          maxzoom: 7,
          filter: ['all',
            ['>=', ['coalesce', ['to-number', ['get', '_scale']], 0], 3],
            ['<',  ['coalesce', ['to-number', ['get', '_scale']], 0], 10],
          ],
          ...sourceLayerProp,
          paint: {
            'circle-radius':       RADIUS_SCALED,
            'circle-color':        color,
            'circle-opacity':      opacity,
            'circle-stroke-width': 0,
            'circle-blur':         0,
          },
        }, before)

        // ── Full-res layer: scale < 3 (0.01° grid), PMTiles zoom 9–14 ───
        // In GeoJSON dev mode the filter matches nothing (no scale=1 data loaded).
        // With PMTiles wired up, 292k cells stream in per-viewport with no stack limit.
        map.addLayer({
          id: LAYER_ID_AGG,
          type: 'circle',
          source: SOURCE_ID,
          minzoom: 7,
          filter: ['<', ['coalesce', ['to-number', ['get', '_scale']], 5], 3],
          ...sourceLayerProp,
          paint: {
            'circle-radius':       RADIUS_SCALED,
            'circle-color':        color,
            'circle-opacity':      opacity,
            'circle-stroke-width': 0,
            'circle-blur':         0,
          },
        }, before)

        // ── Future PMTiles full-resolution layer (not used in GeoJSON mode) ──
        // Filter matches nothing in current data so it adds no visual overhead.
        // When PMTiles are wired up, update filter to actual scale condition.
        map.addLayer({
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          minzoom: 10,
          filter: ['<', ['coalesce', ['to-number', ['get', '_scale']], 2], 0],
          ...sourceLayerProp,
          paint: {
            'circle-radius':       RADIUS_ORIGINAL,
            'circle-color':        color,
            'circle-opacity':      opacity,
            'circle-stroke-width': 0,
            'circle-blur':         0,
          },
        }, before)

        console.log('[useMapLayer] layers added: COARSE, MED, AGG')
      } catch (err) {
        console.error('[useMapLayer] addLayers failed:', err)
      } finally {
        paintingRef.current = false
      }
    }

    // Compute actual p1–p99 range from the loaded source so the color scale
    // spans real data, not the (often much wider) config domain.
    // Only runs once per variable — once locked, zoom/pan don't change colors.
    function computeColorRange() {
      if (colorRangeLockedRef.current) return  // already set for this variable
      const variable = variableRef.current
      if (!variable || variable.type === 'categorical') { colorRangeRef.current = null; return }
      try {
        const sourceOptions = isPlaceholder ? {} : { sourceLayer: config.id }
        const features = map.querySourceFeatures(SOURCE_ID, sourceOptions)
        if (features.length < 5) return
        const values = features
          .map(f => f.properties?.[variable.id])
          .filter(v => v != null && !isNaN(v))
          .sort((a, b) => a - b)
        if (values.length < 5) return
        const zero = variable.domain?.zero ?? 0
        const range = buildColorRange(values, zero)
        if (range) {
          colorRangeRef.current = range
          colorRangeLockedRef.current = true  // lock — don't recompute on future tile loads
        }
      } catch (_) { /* ignore */ }
    }

    function updatePaint() {
      if (paintingRef.current) return
      const variable = variableRef.current
      if (!variable) return
      paintingRef.current = true
      try {
        for (const layerId of LAYER_IDS) {
          if (!map.getLayer(layerId)) continue
          try {
            map.setPaintProperty(layerId, 'circle-color',   buildColorExpression(variable, colorRangeRef.current, isDarkRef.current))
            map.setPaintProperty(layerId, 'circle-opacity', buildOpacityExpression(variable, opacityP95Ref.current, colorRangeRef.current))
          } catch (err) {
            console.error(`[useMapLayer] updatePaint failed on ${layerId}:`, err)
          }
        }
      } finally {
        paintingRef.current = false
      }
    }

    function onSourceData(e) {
      if (e.sourceId === SOURCE_ID && e.isSourceLoaded) {
        computeColorRange()
        updatePaint()
      }
    }

    map.on('styledata', addLayers)
    map.on('sourcedata', onSourceData)
    if (map.isStyleLoaded()) {
      addLayers()
    } else {
      map.once('idle', addLayers)
    }

    return () => {
      map.off('styledata', addLayers)
      map.off('sourcedata', onSourceData)
      for (const layerId of LAYER_IDS) {
        if (map.getLayer(layerId))  map.removeLayer(layerId)
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Update paint when active variable or opacity threshold changes ──────────
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return
    const hasAnyLayer = LAYER_IDS.some(id => map.getLayer(id))
    if (!hasAnyLayer) return
    const variable = variableRef.current
    if (!variable) return

    // Recompute color range for the new variable (different column, different range)
    colorRangeRef.current = null
    colorRangeLockedRef.current = false
    if (variable.type !== 'categorical') {
      try {
        const sourceOptions = isPlaceholder ? {} : { sourceLayer: config.id }
        const features = map.querySourceFeatures(SOURCE_ID, sourceOptions)
        if (features.length >= 5) {
          const values = features
            .map(f => f.properties?.[variable.id])
            .filter(v => v != null && !isNaN(v))
            .sort((a, b) => a - b)
          if (values.length >= 5) {
            const zero = variable.domain?.zero ?? 0
            const range = buildColorRange(values, zero)
            if (range) {
              colorRangeRef.current = range
              colorRangeLockedRef.current = true
            }
          }
        }
      } catch (_) { /* source not yet loaded; onSourceData will fire updatePaint later */ }
    }

    if (paintingRef.current) return
    paintingRef.current = true
    try {
      for (const layerId of LAYER_IDS) {
        if (!map.getLayer(layerId)) continue
        try {
          map.setPaintProperty(layerId, 'circle-color',   buildColorExpression(variable, colorRangeRef.current, isDarkRef.current))
          map.setPaintProperty(layerId, 'circle-opacity', buildOpacityExpression(variable, opacityP95Ref.current, colorRangeRef.current))
        } catch (err) {
          console.error(`[useMapLayer] paint update failed on ${layerId}:`, err)
        }
      }
    } finally {
      paintingRef.current = false
    }
  }, [map, config, state.activeLayer, state.activeDimensions, opacityP95])
}


// ── Paint expression builders ─────────────────────────────────────────────────

// colorRange: { min, max } from actual source data (p1–p99), or null to use config domain.
function buildColorExpression(variable, colorRange = null, isDark = true) {
  if (!variable) return '#888888'
  if (variable.type === 'categorical') {
    const expr = ['match', ['get', variable.id]]
    for (const cat of variable.categories ?? []) {
      const color = isDark ? (cat.colorDark ?? cat.color) : (cat.colorLight ?? cat.color)
      expr.push(cat.id, color)
    }
    expr.push('#888888')
    return expr
  }

  // Diverging variables: solid anchor color by sign; opacity (below) carries magnitude.
  // Light mode uses dark, saturated ColorBrewer RdBu extremes for contrast on white.
  // Dark mode uses mid-range hues that read well on dark backgrounds.
  if (variable.diverging) {
    const zero = variable.domain?.zero ?? 0
    const blue = isDark ? '#4393c3' : '#2166ac'
    const red  = isDark ? '#d6604d' : '#b2182b'
    return ['case',
      ['>=', ['get', variable.id], zero], blue,
      red,
    ]
  }

  // Sequential variables: continuous colormap over actual data range
  const effectiveDomain = colorRange
    ? { ...variable.domain, min: colorRange.min, max: colorRange.max }
    : variable.domain
  // Pick scheme-aware colormap so the high-value color matches the diverging anchors
  let colormapName = variable.colormap
  if (colormapName === 'RdBuBlue') colormapName = isDark ? 'RdBuBlueDark' : 'RdBuBlueLight'
  if (colormapName === 'RdBuRed')  colormapName = isDark ? 'RdBuRedDark'  : 'RdBuRedLight'
  const scale = buildColorScale({ ...variable, domain: effectiveDomain, colormap: colormapName })
  const { min, max } = effectiveDomain
  const steps = 24
  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    expr.push(v, scale(v))
  }
  return expr
}

/**
 * Asymmetric opacity for diverging variables:
 *   - $0 (zero) → fully transparent
 *   - observed max positive value → fully opaque (1.0)
 *   - observed min negative value → fully opaque (1.0)
 *   - positive side: opacity = (value − zero) / maxPosDev
 *   - negative side: opacity = (zero − value) / maxNegDev
 *
 * Each side is normalised to its own observed extreme, so both the most
 * positive and most negative cells reach full opacity regardless of whether
 * the distribution is skewed.
 *
 * Falls back to symmetric opacityP95 when colorRange is unavailable.
 */
// Piecewise linear approximation of t^0.4 for use in MapLibre expressions.
// Gives a logarithmic feel: low values are much less transparent than with a
// linear scale, while the full range [0, 1] is still preserved.
//   t=0.05 → 0.30   t=0.1 → 0.40   t=0.25 → 0.57   t=0.5 → 0.76   t=1 → 1
function curveOpacity(t_expr) {
  return ['interpolate', ['linear'], t_expr,
    0,    0,
    0.02, 0.21,
    0.05, 0.30,
    0.1,  0.40,
    0.25, 0.57,
    0.5,  0.76,
    0.75, 0.88,
    1.0,  1.0,
  ]
}

function buildOpacityExpression(variable, opacityP95, colorRange = null) {
  if (!variable || variable.type === 'categorical') return 0.88

  // Sequential variables: color carries magnitude — flat high opacity
  if (!variable.diverging) return 0.9

  // Need at least one denominator
  if (!opacityP95 && !colorRange) return 0.88

  const zero = variable.domain?.zero ?? variable.domain?.min ?? 0

  // Asymmetric denominators: positive and negative sides each normalised to their own p99 dev
  const maxPosDev = colorRange?.posP99dev ?? (colorRange ? Math.max(colorRange.max - zero, 0.001) : opacityP95)
  const maxNegDev = colorRange?.negP99dev ?? (colorRange ? Math.max(zero - colorRange.min, 0.001) : opacityP95)

  // Linear t in [0, 1] for each side, then apply non-linear curve
  const tPos = ['min', 1, ['max', 0,
    ['/', ['-', ['get', variable.id], zero], maxPosDev]
  ]]
  const tNeg = ['min', 1, ['max', 0,
    ['/', ['-', zero, ['get', variable.id]], maxNegDev]
  ]]

  return ['case',
    ['>=', ['get', variable.id], zero], curveOpacity(tPos),
    curveOpacity(tNeg),
  ]
}
