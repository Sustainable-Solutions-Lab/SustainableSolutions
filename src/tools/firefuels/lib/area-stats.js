/**
 * lib/area-stats.js
 *
 * Compute aggregate statistics for all features within a drawn circle.
 * Called by the area tool (components/area-tool/) after the user finishes drawing.
 */

const EARTH_RADIUS_KM = 6371

/**
 * Haversine distance between two lat/lng points in km.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/**
 * Filter MapLibre rendered features to those within a circle.
 * Returns the GeoJSON features whose point geometry is within radiusKm of center.
 *
 * @param {Array}  features    - array of GeoJSON Feature objects (from queryRenderedFeatures)
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {number} radiusKm
 * @returns {Array}
 */
export function featuresWithinCircle(features, centerLat, centerLng, radiusKm) {
  return features.filter((f) => {
    const [lng, lat] = f.geometry.coordinates
    return haversineKm(centerLat, centerLng, lat, lng) <= radiusKm
  })
}

/**
 * Compute mean, median, min, max for a numeric array.
 * Returns null if the array is empty or all values are null/undefined.
 *
 * @param {number[]} values
 * @returns {{ mean: number, median: number, min: number, max: number } | null}
 */
function summarize(values) {
  const clean = values.filter((v) => v != null && !isNaN(v))
  if (clean.length === 0) return null

  const sorted = [...clean].sort((a, b) => a - b)
  const n = sorted.length
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]

  return {
    mean: clean.reduce((s, v) => s + v, 0) / n,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    count: n,
  }
}

/**
 * Compute aggregate statistics for a set of features over a list of variable ids.
 * Returns an AggregateStats object matching contracts/events.js.
 *
 * @param {Array}    features      - GeoJSON features with properties
 * @param {string[]} variableIds   - which property keys to aggregate
 * @returns {import('../contracts/events.js').AggregateStats}
 */
export function computeAggregateStats(features, variableIds) {
  const stats = {}

  for (const varId of variableIds) {
    const values = features.map((f) => f.properties?.[varId]).filter((v) => v != null)
    stats[varId] = summarize(values)
  }

  return {
    count: features.length,
    stats,
  }
}

/**
 * Compute percentile thresholds for a variable across all features.
 * Used by the percentile filter to determine which features to show.
 *
 * @param {Array}   features
 * @param {string}  variableId
 * @param {number}  lowPct    - 0–100
 * @param {number}  highPct   - 0–100
 * @returns {{ low: number, high: number }}  - the actual data values at those percentiles
 */
export function percentileThresholds(features, variableId, lowPct, highPct) {
  const values = features
    .map((f) => f.properties?.[variableId])
    .filter((v) => v != null && !isNaN(v))
    .sort((a, b) => a - b)

  if (values.length === 0) return { low: -Infinity, high: Infinity }

  const idx = (pct) => Math.round((pct / 100) * (values.length - 1))
  return {
    low: values[idx(lowPct)],
    high: values[idx(highPct)],
  }
}
