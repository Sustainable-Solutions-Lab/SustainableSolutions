/**
 * lib/format.js
 * Number and coordinate formatting for data display.
 */

/**
 * Format a raw variable value for display.
 * e.g. formatValue(220000, '$/km²') → '$220k/km²'
 * @param {number} value
 * @param {string} unit
 * @returns {string}
 */
export function formatValue(value, unit) {
  if (value === null || value === undefined || isNaN(value)) return '—'

  let formatted
  const abs = Math.abs(value)

  if (unit.startsWith('$')) {
    if (abs >= 1e6) formatted = `$${(value / 1e6).toFixed(1)}M`
    else if (abs >= 1e3) formatted = `$${(value / 1e3).toFixed(0)}k`
    else formatted = `$${value.toFixed(0)}`
    // Append the rest of the unit after the $ prefix
    const rest = unit.slice(1)
    return rest ? `${formatted}${rest}` : formatted
  }

  if (abs >= 1e6) formatted = `${(value / 1e6).toFixed(1)}M`
  else if (abs >= 1e3) formatted = `${(value / 1e3).toFixed(0)}k`
  else if (abs < 10) formatted = value.toFixed(2)
  else formatted = value.toFixed(0)

  return unit ? `${formatted} ${unit}` : formatted
}

/**
 * Format lat/lng for display.
 * e.g. formatCoord(37.5, -119.4) → '37.50°N, 119.40°W'
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
export function formatCoord(lat, lng) {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`
  const lngStr = `${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`
  return `${latStr}, ${lngStr}`
}
