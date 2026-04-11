/**
 * components/map/static-layers.js
 *
 * Adds permanent overlay layers on top of the basemap:
 *   1. California out-of-bounds mask (hides everything outside CA)
 *   2. California county borders (solid, pale, thin — always visible)
 *   3. Lat/lon graticule (toggled via a button in the map UI)
 *
 * Also hides city/POI label layers from the basemap style.
 *
 * Call addStaticLayers(map, scheme) after map load and after every setStyle().
 */

/**
 * Build a GeoJSON FeatureCollection of graticule lines covering California.
 * @param {number} [latStep=2]
 * @param {number} [lonStep=2]
 * @returns {object} GeoJSON FeatureCollection
 */
export function buildGraticule(latStep = 2, lonStep = 2) {
  const features = []
  for (let lat = 32; lat <= 43; lat += latStep) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-125, lat], [-113, lat]] },
      properties: { label: `${lat}°N`, type: 'lat' },
    })
  }
  for (let lon = -124; lon <= -113; lon += lonStep) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[lon, 32], [lon, 43]] },
      properties: { label: `${Math.abs(lon)}°W`, type: 'lon' },
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Add the CA mask, county borders, and graticule to the map.
 * Safe to call multiple times — checks for existing sources/layers.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {'dark'|'light'} scheme
 */
export function addStaticLayers(map, scheme) {
  const borderColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'
  const maskColor =
    scheme === 'dark' ? '#1a1a1a' : '#FAFAF7'
  const graticuleColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
  const labelColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'

  // ── 1. California out-of-bounds mask ──────────────────────────────────────
  // World rectangle with California punched out — hides everything outside CA.

  if (!map.getSource('ca-mask')) {
    map.addSource('ca-mask', {
      type: 'geojson',
      data: '/ca-mask.geojson',
    })
  }

  if (!map.getLayer('ca-mask-fill')) {
    map.addLayer({
      id: 'ca-mask-fill',
      type: 'fill',
      source: 'ca-mask',
      paint: {
        'fill-color': maskColor,
        'fill-opacity': 1,
      },
    })
  } else {
    map.setPaintProperty('ca-mask-fill', 'fill-color', maskColor)
  }

  // ── 2. County borders ─────────────────────────────────────────────────────

  if (!map.getSource('counties')) {
    map.addSource('counties', {
      type: 'geojson',
      data: '/counties-ca.geojson',
    })
  }

  if (!map.getLayer('county-borders')) {
    map.addLayer({
      id: 'county-borders',
      type: 'line',
      source: 'counties',
      paint: {
        'line-color': borderColor,
        'line-width': 0.7,
        // No dasharray — solid thin lines
      },
    })
  } else {
    map.setPaintProperty('county-borders', 'line-color', borderColor)
  }

  // ── 3. Graticule ──────────────────────────────────────────────────────────

  if (!map.getSource('graticule')) {
    map.addSource('graticule', {
      type: 'geojson',
      data: buildGraticule(),
    })
  }

  if (!map.getLayer('graticule')) {
    map.addLayer({
      id: 'graticule',
      type: 'line',
      source: 'graticule',
      layout: { visibility: 'none' },
      paint: {
        'line-color': graticuleColor,
        'line-width': 0.5,
        'line-dasharray': [4, 3],
      },
    })
  } else {
    map.setPaintProperty('graticule', 'line-color', graticuleColor)
  }

  if (!map.getLayer('graticule-labels')) {
    map.addLayer({
      id: 'graticule-labels',
      type: 'symbol',
      source: 'graticule',
      layout: {
        visibility: 'none',
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'symbol-placement': 'line',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': labelColor,
        'text-halo-color':
          scheme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)',
        'text-halo-width': 1,
      },
    })
  } else {
    map.setPaintProperty('graticule-labels', 'text-color', labelColor)
  }

  // ── 4. Hide city / POI labels from the basemap ────────────────────────────
  hideBasemapLabels(map)
}

/**
 * Hide city, town, village, and POI label layers from the loaded basemap style.
 * Targets layers whose IDs contain common place/POI naming patterns.
 *
 * @param {import('maplibre-gl').Map} map
 */
function hideBasemapLabels(map) {
  const HIDE_PATTERNS = [
    'place_label',
    'place-label',
    'poi_label',
    'poi-label',
    'settlement_label',
    'settlement-label',
    'transit_stop',
    'transit-stop',
    'airport_label',
    'airport-label',
  ]

  // Keep country and state/region labels — only hide city-level and below
  const KEEP_PATTERNS = [
    'country',
    'state',
    'region',
    'admin',
  ]

  try {
    const layers = map.getStyle()?.layers ?? []
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue
      const id = layer.id.toLowerCase()
      if (KEEP_PATTERNS.some((p) => id.includes(p))) continue
      if (HIDE_PATTERNS.some((p) => id.includes(p))) {
        map.setLayoutProperty(layer.id, 'visibility', 'none')
      }
    }
  } catch (_) {
    // Style may not be fully loaded — will retry on next styledata event
  }
}

/**
 * Toggle graticule and label layer visibility.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} visible
 */
export function setGraticuleVisible(map, visible) {
  const value = visible ? 'visible' : 'none'
  if (map.getLayer('graticule')) {
    map.setLayoutProperty('graticule', 'visibility', value)
  }
  if (map.getLayer('graticule-labels')) {
    map.setLayoutProperty('graticule-labels', 'visibility', value)
  }
}
