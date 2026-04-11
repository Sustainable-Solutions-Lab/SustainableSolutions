/**
 * lib/use-map-layer.js
 *
 * React hook: reactively adds/updates a PMTiles or GeoJSON circle layer.
 *
 * Layer ordering:  data circles  →  ca-mask-fill  →  county-borders  →  graticule
 * Circles must sit below ca-mask-fill so the inverted CA polygon clips any
 * feature that falls outside the state boundary.
 *
 * Opacity encoding (diverging variables):
 *   Pre-computed stops map each data value to an opacity so that cells near
 *   zero net benefit are nearly transparent and extreme values are opaque.
 *   All computation is done in JavaScript — no runtime MapLibre abs/divide
 *   expressions, which avoids potential expression-evaluation failures.
 */

import { useEffect, useRef } from 'react'
import { buildColorScale } from './colormap.js'
import { getActiveVariable } from './get-active-variable.js'

export const SOURCE_ID = 'firemap-data'
export const LAYER_ID = 'firemap-cells'

/**
 * @param {import('maplibre-gl').Map|null} map
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {import('../contracts/events').AppState} state
 */
export function useMapLayer(map, config, state) {
  const isPlaceholder = config.tilesUrl === 'REPLACE_WITH_R2_URL'

  const variableRef = useRef(null)
  variableRef.current = getActiveVariable(config, state.activeLayer, state.activeDimensions)

  // ── Source / layer lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    const sourceConfig = isPlaceholder
      ? { type: 'geojson', data: '/fuel-treatment.geojson' }
      : { type: 'vector', url: `pmtiles://${config.tilesUrl}` }

    function addLayers() {
      if (!map.isStyleLoaded()) return
      if (map.getSource(SOURCE_ID)) {
        updatePaint()
        return
      }

      try {
        map.addSource(SOURCE_ID, sourceConfig)

        const variable = variableRef.current
        const layerSpec = {
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            // Radius grows to tile the ~5.5 km grid seamlessly at high zoom.
            // Exponential base 1.5 matches tile-doubling behavior for smooth transitions.
            'circle-radius': [
              'interpolate', ['exponential', 1.5], ['zoom'],
              4,  1.5,
              6,  2.5,
              8,  7,
              9,  14,
              10, 24,
              11, 44,
              12, 68,
              22, 68,
            ],
            'circle-color':   buildColorExpression(variable),
            'circle-opacity': buildOpacityExpression(variable),
            'circle-stroke-width': 0,
            'circle-blur': [
              'interpolate', ['linear'], ['zoom'],
              5, 0.35,
              9, 0.1,
              12, 0,
            ],
          },
        }

        if (!isPlaceholder) layerSpec['source-layer'] = config.id

        // Insert BELOW ca-mask-fill so the inverted CA polygon clips outside circles
        const before = map.getLayer('ca-mask-fill') ? 'ca-mask-fill' : undefined
        map.addLayer(layerSpec, before)
      } catch (err) {
        console.error('[useMapLayer] addLayers failed:', err)
      }
    }

    function updatePaint() {
      if (!map.getLayer(LAYER_ID)) return
      const variable = variableRef.current
      if (!variable) return
      // For categorical: domain is irrelevant (match expression used); skip querySourceFeatures
      const sourceLayer = isPlaceholder ? undefined : config.id
      const domain = variable.type === 'categorical'
        ? null
        : computeActualDomain(map, variable, sourceLayer)
      try {
        map.setPaintProperty(LAYER_ID, 'circle-color', buildColorExpression(variable, domain))
        map.setPaintProperty(LAYER_ID, 'circle-opacity', buildOpacityExpression(variable, domain))
      } catch (err) {
        console.error('[useMapLayer] updatePaint failed:', err)
      }
    }

    // Re-run updatePaint when source tiles finish loading so the dynamic domain
    // is computed from real data (querySourceFeatures returns nothing until tiles load)
    function onSourceData(e) {
      if (e.sourceId === SOURCE_ID && e.isSourceLoaded) updatePaint()
    }

    // Register styledata listener first (covers setStyle reloads)
    map.on('styledata', addLayers)
    map.on('sourcedata', onSourceData)
    // Try immediately if loaded; otherwise wait for idle (handles edge case where
    // isStyleLoaded() returns false even after the load event has fired)
    if (map.isStyleLoaded()) {
      addLayers()
    } else {
      map.once('idle', addLayers)
    }

    return () => {
      map.off('styledata', addLayers)
      map.off('sourcedata', onSourceData)
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, config])

  // ── Update paint when active variable changes ─────────────────────────────
  useEffect(() => {
    if (!map || !map.isStyleLoaded() || !map.getLayer(LAYER_ID)) return
    const variable = variableRef.current
    if (!variable) return
    const sourceLayer = isPlaceholder ? undefined : config.id
    const domain = variable.type === 'categorical'
      ? null
      : computeActualDomain(map, variable, sourceLayer)
    try {
      map.setPaintProperty(LAYER_ID, 'circle-color', buildColorExpression(variable, domain))
      map.setPaintProperty(LAYER_ID, 'circle-opacity', buildOpacityExpression(variable, domain))
    } catch (err) {
      console.error('[useMapLayer] paint update failed:', err)
    }
  }, [map, config, state.activeLayer, state.activeDimensions])
}

// ── Dynamic domain from rendered features ─────────────────────────────────

/**
 * Query the currently rendered source features and compute an actual domain
 * so that the colormap spans only the real data range, not a hard-coded guess.
 *
 * For diverging variables: symmetric around zero (maxAbs on both sides).
 * For sequential variables: [min, max] of visible values.
 *
 * Returns null if there are not enough features to be meaningful.
 */
function computeActualDomain(map, variable, sourceLayerId) {
  if (!variable || variable.type === 'categorical') return null
  const queryOpts = sourceLayerId ? { sourceLayer: sourceLayerId } : undefined
  const features = map.querySourceFeatures(SOURCE_ID, queryOpts)
  const values = features
    .map(f => f.properties?.[variable.id])
    .filter(v => v != null && !isNaN(v))
  if (values.length < 5) return null   // not enough data yet — fall back to config domain

  if (variable.diverging) {
    const maxAbs = Math.max(...values.map(v => Math.abs(v)))
    if (maxAbs === 0) return null
    return { min: -maxAbs, max: maxAbs, zero: variable.domain?.zero ?? 0 }
  } else {
    const dMin = Math.min(...values)
    const dMax = Math.max(...values)
    if (dMin >= dMax) return null
    return { min: dMin, max: dMax }
  }
}

// ── Paint expression builders ─────────────────────────────────────────────

/**
 * MapLibre interpolate expression: data value → CSS color string.
 * For categorical variables, builds a match expression from variable.categories.
 * domainOverride replaces variable.domain for continuous variables.
 */
function buildColorExpression(variable, domainOverride = null) {
  if (!variable) return '#888888'
  if (variable.type === 'categorical') {
    // ['match', ['get', id], val1, color1, val2, color2, ..., fallback]
    const expr = ['match', ['get', variable.id]]
    for (const cat of variable.categories ?? []) {
      expr.push(cat.id, cat.color)
    }
    expr.push('#888888')
    return expr
  }
  const effectiveVar = domainOverride ? { ...variable, domain: domainOverride } : variable
  const scale = buildColorScale(effectiveVar)
  const { min, max } = effectiveVar.domain
  const steps = 24
  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    expr.push(v, scale(v))
  }
  return expr
}

/**
 * MapLibre interpolate expression: data value → opacity.
 *
 * For diverging variables (net benefits, BCR):
 *   All stops are pre-computed in JavaScript so no runtime MapLibre math
 *   expressions are needed. Cells near zero are nearly transparent; extreme
 *   values (strongly positive or negative) are opaque.
 *
 * For sequential / non-diverging variables: returns a fixed 0.85.
 */
function buildOpacityExpression(variable, domainOverride = null) {
  if (!variable || variable.type === 'categorical') return 0.85
  if (!variable.diverging) {
    return 0.85
  }
  const domain = domainOverride ?? variable.domain
  const { min, max, zero = 0 } = domain
  const maxAbsDev = Math.max(Math.abs(min - zero), Math.abs(max - zero))
  if (maxAbsDev === 0) return 0.85
  const steps = 20
  const expr = ['interpolate', ['linear'], ['get', variable.id]]
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    const t = Math.abs(v - zero) / maxAbsDev
    expr.push(v, opacityCurve(t))
  }
  return expr
}

/**
 * Maps normalized absolute deviation (0–1) to opacity.
 * At t=0 (value == zero): ~0.05 (nearly invisible — no net benefit)
 * At t=1 (max deviation): 1.0  (fully opaque — strong signal)
 */
function opacityCurve(t) {
  if (t < 0.03) return 0.05
  if (t < 0.18) return 0.05 + ((t - 0.03) / 0.15) * 0.55   // 0.05 → 0.60
  return 0.60 + ((t - 0.18) / 0.82) * 0.40                  // 0.60 → 1.00
}
