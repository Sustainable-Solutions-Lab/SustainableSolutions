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

// ── California cities (ranked by size for progressive zoom disclosure) ─────────
const CALIFORNIA_CITIES = {
  type: 'FeatureCollection',
  features: [
    // Rank 1 — visible from zoom 5 (full-state view, max ~4 labels)
    { type: 'Feature', properties: { name: 'San Francisco', rank: 1 }, geometry: { type: 'Point', coordinates: [-122.419, 37.775] } },
    { type: 'Feature', properties: { name: 'Los Angeles',   rank: 1 }, geometry: { type: 'Point', coordinates: [-118.243, 34.052] } },
    { type: 'Feature', properties: { name: 'Sacramento',    rank: 1 }, geometry: { type: 'Point', coordinates: [-121.469, 38.555] } },
    { type: 'Feature', properties: { name: 'San Diego',     rank: 1 }, geometry: { type: 'Point', coordinates: [-117.156, 32.715] } },
    // Rank 2 — visible from zoom 6.5
    { type: 'Feature', properties: { name: 'Fresno',        rank: 2 }, geometry: { type: 'Point', coordinates: [-119.787, 36.738] } },
    { type: 'Feature', properties: { name: 'San Jose',      rank: 2 }, geometry: { type: 'Point', coordinates: [-121.886, 37.338] } },
    { type: 'Feature', properties: { name: 'Bakersfield',   rank: 2 }, geometry: { type: 'Point', coordinates: [-119.019, 35.374] } },
    { type: 'Feature', properties: { name: 'Redding',       rank: 2 }, geometry: { type: 'Point', coordinates: [-122.391, 40.587] } },
    // Rank 3 — visible from zoom 8
    { type: 'Feature', properties: { name: 'Oakland',       rank: 3 }, geometry: { type: 'Point', coordinates: [-122.271, 37.804] } },
    { type: 'Feature', properties: { name: 'Riverside',     rank: 3 }, geometry: { type: 'Point', coordinates: [-117.396, 33.953] } },
    { type: 'Feature', properties: { name: 'Santa Barbara', rank: 3 }, geometry: { type: 'Point', coordinates: [-119.698, 34.420] } },
    { type: 'Feature', properties: { name: 'Stockton',      rank: 3 }, geometry: { type: 'Point', coordinates: [-121.290, 37.980] } },
    { type: 'Feature', properties: { name: 'Modesto',       rank: 3 }, geometry: { type: 'Point', coordinates: [-120.997, 37.639] } },
    { type: 'Feature', properties: { name: 'Santa Rosa',    rank: 3 }, geometry: { type: 'Point', coordinates: [-122.714, 38.441] } },
  ],
}

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
  const stateBorderColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)'
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

  // ── 1b. California state border ───────────────────────────────────────────
  // Uses the dedicated ca-boundary.geojson (just the CA polygon outline).

  if (!map.getSource('ca-boundary')) {
    map.addSource('ca-boundary', {
      type: 'geojson',
      data: '/ca-boundary.geojson',
    })
  }

  if (!map.getLayer('ca-border')) {
    map.addLayer({
      id: 'ca-border',
      type: 'line',
      source: 'ca-boundary',
      paint: {
        'line-color': stateBorderColor,
        'line-width': 1.1,
      },
    })
  } else {
    map.setPaintProperty('ca-border', 'line-color', stateBorderColor)
  }

  // ── 2. County borders ─────────────────────────────────────────────────────

  if (!map.getSource('counties')) {
    map.addSource('counties', {
      type: 'geojson',
      data: '/counties-ca.geojson',
    })
  }

  if (!map.getLayer('county-borders')) {
    // Insert below ca-mask-fill so data circles render above county lines
    const before = map.getLayer('ca-mask-fill') ? 'ca-mask-fill' : undefined
    map.addLayer({
      id: 'county-borders',
      type: 'line',
      source: 'counties',
      paint: {
        'line-color': borderColor,
        'line-width': 0.5,
      },
    }, before)
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

  // ── 4. City labels (shown alongside graticule) ────────────────────────────

  if (!map.getSource('cities')) {
    map.addSource('cities', { type: 'geojson', data: CALIFORNIA_CITIES })
  }

  const cityLabelPaint = {
    'text-color': labelColor,
    'text-halo-color': scheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
    'text-halo-width': 1.2,
  }

  const cityRanks = [
    { id: 'city-labels-r1', rank: 1, minzoom: 5,   size: 11 },
    { id: 'city-labels-r2', rank: 2, minzoom: 6.5, size: 10 },
    { id: 'city-labels-r3', rank: 3, minzoom: 8,   size: 10 },
  ]

  for (const { id, rank, minzoom, size } of cityRanks) {
    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type: 'symbol',
        source: 'cities',
        minzoom,
        filter: ['==', ['get', 'rank'], rank],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-size': size,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-anchor': 'left',
          'text-offset': [0.4, 0],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: cityLabelPaint,
      })
    } else {
      map.setPaintProperty(id, 'text-color', labelColor)
    }
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
  const layers = [
    'graticule',
    'graticule-labels',
    'city-labels-r1',
    'city-labels-r2',
    'city-labels-r3',
  ]
  for (const id of layers) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value)
  }
}
