/**
 * components/map/static-layers.js
 *
 * Adds permanent overlay layers on top of the basemap:
 *   1. California county borders (always visible, dashed line)
 *   2. Lat/lon graticule (toggled via a button in the map UI)
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

  // Horizontal lines (latitude)
  for (let lat = 32; lat <= 43; lat += latStep) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[-125, lat], [-113, lat]],
      },
      properties: { label: `${lat}°N`, type: 'lat' },
    })
  }

  // Vertical lines (longitude)
  for (let lon = -124; lon <= -113; lon += lonStep) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[lon, 32], [lon, 43]],
      },
      properties: { label: `${Math.abs(lon)}°W`, type: 'lon' },
    })
  }

  return { type: 'FeatureCollection', features }
}

/**
 * Add the county borders and graticule sources/layers to the map.
 * Safe to call multiple times — checks for existing sources/layers.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {'dark'|'light'} scheme
 */
export function addStaticLayers(map, scheme) {
  const borderColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'
  const graticuleColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'
  const labelColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'

  // ── 1. County borders ──────────────────────────────────────────────────────

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
        'line-width': 0.8,
        'line-dasharray': [3, 2],
      },
    })
  } else {
    // Update color if scheme changed
    map.setPaintProperty('county-borders', 'line-color', borderColor)
  }

  // ── 2. Graticule ───────────────────────────────────────────────────────────

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
      layout: {
        visibility: 'none',
      },
      paint: {
        'line-color': graticuleColor,
        'line-width': 0.6,
        'line-dasharray': [4, 3],
      },
    })
  } else {
    map.setPaintProperty('graticule', 'line-color', graticuleColor)
  }

  // Graticule degree labels
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
        'text-ignore-placement': false,
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
