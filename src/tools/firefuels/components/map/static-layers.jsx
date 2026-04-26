/**
 * components/map/static-layers.jsx
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
    // Rank 1 — visible from zoom 5 (full-state view)
    { type: 'Feature', properties: { name: 'San Francisco', rank: 1 }, geometry: { type: 'Point', coordinates: [-122.419, 37.775] } },
    { type: 'Feature', properties: { name: 'Los Angeles',   rank: 1 }, geometry: { type: 'Point', coordinates: [-118.243, 34.052] } },
    { type: 'Feature', properties: { name: 'Sacramento',    rank: 1 }, geometry: { type: 'Point', coordinates: [-121.469, 38.555] } },
    { type: 'Feature', properties: { name: 'San Diego',     rank: 1 }, geometry: { type: 'Point', coordinates: [-117.156, 32.715] } },
    // Rank 2 — visible from zoom 6.5
    { type: 'Feature', properties: { name: 'Fresno',        rank: 2 }, geometry: { type: 'Point', coordinates: [-119.787, 36.738] } },
    { type: 'Feature', properties: { name: 'San Jose',      rank: 2 }, geometry: { type: 'Point', coordinates: [-121.886, 37.338] } },
    { type: 'Feature', properties: { name: 'Bakersfield',   rank: 2 }, geometry: { type: 'Point', coordinates: [-119.019, 35.374] } },
    { type: 'Feature', properties: { name: 'Redding',       rank: 2 }, geometry: { type: 'Point', coordinates: [-122.391, 40.587] } },
    // Rank 3 — visible from zoom 7.5
    { type: 'Feature', properties: { name: 'Oakland',        rank: 3 }, geometry: { type: 'Point', coordinates: [-122.271, 37.804] } },
    { type: 'Feature', properties: { name: 'Riverside',      rank: 3 }, geometry: { type: 'Point', coordinates: [-117.396, 33.953] } },
    { type: 'Feature', properties: { name: 'Santa Barbara',  rank: 3 }, geometry: { type: 'Point', coordinates: [-119.698, 34.420] } },
    { type: 'Feature', properties: { name: 'Stockton',       rank: 3 }, geometry: { type: 'Point', coordinates: [-121.290, 37.980] } },
    { type: 'Feature', properties: { name: 'Modesto',        rank: 3 }, geometry: { type: 'Point', coordinates: [-120.997, 37.639] } },
    { type: 'Feature', properties: { name: 'Santa Rosa',     rank: 3 }, geometry: { type: 'Point', coordinates: [-122.714, 38.441] } },
    { type: 'Feature', properties: { name: 'San Bernardino', rank: 3 }, geometry: { type: 'Point', coordinates: [-117.290, 34.108] } },
    { type: 'Feature', properties: { name: 'Oxnard',         rank: 3 }, geometry: { type: 'Point', coordinates: [-119.177, 34.197] } },
    { type: 'Feature', properties: { name: 'Long Beach',     rank: 3 }, geometry: { type: 'Point', coordinates: [-118.194, 33.770] } },
    { type: 'Feature', properties: { name: 'Anaheim',        rank: 3 }, geometry: { type: 'Point', coordinates: [-117.911, 33.836] } },
    // Rank 4 — visible from zoom 8.5
    { type: 'Feature', properties: { name: 'Monterey',       rank: 4 }, geometry: { type: 'Point', coordinates: [-121.895, 36.600] } },
    { type: 'Feature', properties: { name: 'Santa Cruz',     rank: 4 }, geometry: { type: 'Point', coordinates: [-122.030, 36.974] } },
    { type: 'Feature', properties: { name: 'Chico',          rank: 4 }, geometry: { type: 'Point', coordinates: [-121.837, 39.729] } },
    { type: 'Feature', properties: { name: 'Visalia',        rank: 4 }, geometry: { type: 'Point', coordinates: [-119.292, 36.330] } },
    { type: 'Feature', properties: { name: 'Salinas',        rank: 4 }, geometry: { type: 'Point', coordinates: [-121.655, 36.677] } },
    { type: 'Feature', properties: { name: 'San Luis Obispo',rank: 4 }, geometry: { type: 'Point', coordinates: [-120.660, 35.282] } },
    { type: 'Feature', properties: { name: 'Palm Springs',   rank: 4 }, geometry: { type: 'Point', coordinates: [-116.546, 33.830] } },
    { type: 'Feature', properties: { name: 'Eureka',         rank: 4 }, geometry: { type: 'Point', coordinates: [-124.163, 40.802] } },
    { type: 'Feature', properties: { name: 'Napa',           rank: 4 }, geometry: { type: 'Point', coordinates: [-122.287, 38.297] } },
    { type: 'Feature', properties: { name: 'Ventura',        rank: 4 }, geometry: { type: 'Point', coordinates: [-119.295, 34.274] } },
    { type: 'Feature', properties: { name: 'Pasadena',       rank: 4 }, geometry: { type: 'Point', coordinates: [-118.143, 34.148] } },
    { type: 'Feature', properties: { name: 'Thousand Oaks',  rank: 4 }, geometry: { type: 'Point', coordinates: [-118.838, 34.170] } },
    { type: 'Feature', properties: { name: 'Escondido',      rank: 4 }, geometry: { type: 'Point', coordinates: [-117.086, 33.119] } },
    { type: 'Feature', properties: { name: 'Santa Maria',    rank: 4 }, geometry: { type: 'Point', coordinates: [-120.437, 34.953] } },
    { type: 'Feature', properties: { name: 'South Lake Tahoe',rank: 4 }, geometry: { type: 'Point', coordinates: [-119.984, 38.934] } },
    { type: 'Feature', properties: { name: 'Mammoth Lakes',  rank: 4 }, geometry: { type: 'Point', coordinates: [-118.972, 37.649] } },
    { type: 'Feature', properties: { name: 'Paradise',       rank: 4 }, geometry: { type: 'Point', coordinates: [-121.622, 39.759] } },
    { type: 'Feature', properties: { name: 'Oroville',       rank: 4 }, geometry: { type: 'Point', coordinates: [-121.556, 39.514] } },
    { type: 'Feature', properties: { name: 'Auburn',         rank: 4 }, geometry: { type: 'Point', coordinates: [-121.077, 38.897] } },
    { type: 'Feature', properties: { name: 'Grass Valley',   rank: 4 }, geometry: { type: 'Point', coordinates: [-121.061, 39.219] } },
    { type: 'Feature', properties: { name: 'Sonora',         rank: 4 }, geometry: { type: 'Point', coordinates: [-120.382, 37.984] } },
    { type: 'Feature', properties: { name: 'Merced',         rank: 4 }, geometry: { type: 'Point', coordinates: [-120.483, 37.303] } },
    { type: 'Feature', properties: { name: 'Paso Robles',    rank: 4 }, geometry: { type: 'Point', coordinates: [-120.691, 35.627] } },
    { type: 'Feature', properties: { name: 'Temecula',       rank: 4 }, geometry: { type: 'Point', coordinates: [-117.148, 33.494] } },
    { type: 'Feature', properties: { name: 'Santa Clarita',  rank: 4 }, geometry: { type: 'Point', coordinates: [-118.543, 34.392] } },
    { type: 'Feature', properties: { name: 'Lompoc',         rank: 4 }, geometry: { type: 'Point', coordinates: [-120.458, 34.639] } },
    { type: 'Feature', properties: { name: 'Weed',           rank: 4 }, geometry: { type: 'Point', coordinates: [-122.386, 41.423] } },
    // Rank 5 — visible from zoom 9
    { type: 'Feature', properties: { name: 'Irvine',         rank: 5 }, geometry: { type: 'Point', coordinates: [-117.826, 33.684] } },
    { type: 'Feature', properties: { name: 'Newport Beach',  rank: 5 }, geometry: { type: 'Point', coordinates: [-117.929, 33.617] } },
    { type: 'Feature', properties: { name: 'Santa Monica',   rank: 5 }, geometry: { type: 'Point', coordinates: [-118.491, 34.019] } },
    { type: 'Feature', properties: { name: 'Palo Alto',      rank: 5 }, geometry: { type: 'Point', coordinates: [-122.143, 37.441] } },
    { type: 'Feature', properties: { name: 'Berkeley',       rank: 5 }, geometry: { type: 'Point', coordinates: [-122.272, 37.871] } },
    { type: 'Feature', properties: { name: 'Malibu',         rank: 5 }, geometry: { type: 'Point', coordinates: [-118.780, 34.026] } },
    { type: 'Feature', properties: { name: 'Truckee',        rank: 5 }, geometry: { type: 'Point', coordinates: [-120.183, 39.328] } },
    { type: 'Feature', properties: { name: 'Bishop',         rank: 5 }, geometry: { type: 'Point', coordinates: [-118.395, 37.363] } },
    { type: 'Feature', properties: { name: 'Ukiah',          rank: 5 }, geometry: { type: 'Point', coordinates: [-123.207, 39.150] } },
    { type: 'Feature', properties: { name: 'Yosemite Valley',rank: 5 }, geometry: { type: 'Point', coordinates: [-119.538, 37.747] } },
    { type: 'Feature', properties: { name: 'Morro Bay',      rank: 5 }, geometry: { type: 'Point', coordinates: [-120.850, 35.366] } },
    { type: 'Feature', properties: { name: 'Lake Arrowhead', rank: 5 }, geometry: { type: 'Point', coordinates: [-117.190, 34.254] } },
    { type: 'Feature', properties: { name: 'Big Bear Lake',  rank: 5 }, geometry: { type: 'Point', coordinates: [-116.911, 34.244] } },
    { type: 'Feature', properties: { name: 'Healdsburg',     rank: 5 }, geometry: { type: 'Point', coordinates: [-122.869, 38.610] } },
    { type: 'Feature', properties: { name: 'Carmel',         rank: 5 }, geometry: { type: 'Point', coordinates: [-121.923, 36.556] } },
    { type: 'Feature', properties: { name: 'Laguna Beach',   rank: 5 }, geometry: { type: 'Point', coordinates: [-117.753, 33.542] } },
    { type: 'Feature', properties: { name: 'Ojai',           rank: 5 }, geometry: { type: 'Point', coordinates: [-119.243, 34.448] } },
    { type: 'Feature', properties: { name: 'Tehachapi',      rank: 5 }, geometry: { type: 'Point', coordinates: [-118.449, 35.132] } },
    { type: 'Feature', properties: { name: 'Lake Isabella',  rank: 5 }, geometry: { type: 'Point', coordinates: [-118.476, 35.644] } },
    { type: 'Feature', properties: { name: 'Idyllwild',      rank: 5 }, geometry: { type: 'Point', coordinates: [-116.719, 33.746] } },
    { type: 'Feature', properties: { name: 'Wrightwood',     rank: 5 }, geometry: { type: 'Point', coordinates: [-117.634, 34.363] } },
    { type: 'Feature', properties: { name: 'Mt Shasta',      rank: 5 }, geometry: { type: 'Point', coordinates: [-122.305, 41.310] } },
    { type: 'Feature', properties: { name: 'Yreka',          rank: 5 }, geometry: { type: 'Point', coordinates: [-122.635, 41.735] } },
    { type: 'Feature', properties: { name: 'Willits',        rank: 5 }, geometry: { type: 'Point', coordinates: [-123.354, 39.410] } },
    { type: 'Feature', properties: { name: 'Fort Bragg',     rank: 5 }, geometry: { type: 'Point', coordinates: [-123.805, 39.446] } },
    { type: 'Feature', properties: { name: 'Calistoga',      rank: 5 }, geometry: { type: 'Point', coordinates: [-122.580, 38.579] } },
    { type: 'Feature', properties: { name: 'Cambria',        rank: 5 }, geometry: { type: 'Point', coordinates: [-121.080, 35.564] } },
    { type: 'Feature', properties: { name: 'King City',      rank: 5 }, geometry: { type: 'Point', coordinates: [-121.126, 36.213] } },
    { type: 'Feature', properties: { name: 'Gilroy',         rank: 5 }, geometry: { type: 'Point', coordinates: [-121.568, 37.005] } },
    { type: 'Feature', properties: { name: 'Placerville',    rank: 5 }, geometry: { type: 'Point', coordinates: [-120.798, 38.730] } },
    { type: 'Feature', properties: { name: 'Three Rivers',   rank: 5 }, geometry: { type: 'Point', coordinates: [-118.903, 36.441] } },
    { type: 'Feature', properties: { name: 'Garberville',    rank: 5 }, geometry: { type: 'Point', coordinates: [-123.797, 40.100] } },
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
    scheme === 'dark' ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)'
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 7, 1.0, 9, 1.4],
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

  // City labels use higher contrast than graticule labels — they need to be legible
  // over the data circles regardless of color scheme.
  const cityTextColor = scheme === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(20,20,20,0.82)'
  const cityHaloColor = scheme === 'dark' ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.92)'

  const cityLabelPaint = {
    'text-color': cityTextColor,
    'text-halo-color': cityHaloColor,
    'text-halo-width': 1.8,
  }

  const cityRanks = [
    { id: 'city-labels-r1', rank: 1, minzoom: 5,   size: 11 },
    { id: 'city-labels-r2', rank: 2, minzoom: 5.5, size: 10 },
    { id: 'city-labels-r3', rank: 3, minzoom: 6.5, size: 10 },
    { id: 'city-labels-r4', rank: 4, minzoom: 7.5, size: 10 },
    { id: 'city-labels-r5', rank: 5, minzoom: 8.5, size: 10 },
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
          visibility: 'visible',
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
      map.setPaintProperty(id, 'text-color', cityTextColor)
      map.setPaintProperty(id, 'text-halo-color', cityHaloColor)
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
  // Only toggle graticule lines — city labels are always visible
  const layers = ['graticule', 'graticule-labels']
  for (const id of layers) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value)
  }
}
