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
  const sign = value < 0 ? '-' : ''

  // Handle $k unit label — values are raw dollars, displayed with k/M suffix.
  // e.g. unit='$k/km²', value=200000 → '$200k/km²'
  //      unit='$k/km²', value=1500000 → '$1.5M/km²'
  if (unit.startsWith('$k')) {
    const suffix = unit.slice(2)  // e.g. '/km²'
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M${suffix}`
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k${suffix}`
    return `${sign}$${abs.toFixed(0)}${suffix}`
  }

  if (unit.startsWith('$')) {
    if (abs >= 1e6) formatted = `${sign}$${(abs / 1e6).toFixed(1)}M`
    else if (abs >= 1e3) formatted = `${sign}$${(abs / 1e3).toFixed(0)}k`
    else formatted = `${sign}$${abs.toFixed(0)}`
    // Append the rest of the unit after the $ prefix
    const rest = unit.slice(1)
    return rest ? `${formatted}${rest}` : formatted
  }

  if (abs >= 1e6) formatted = `${(value / 1e6).toFixed(1)}M`
  else if (abs >= 1e3) formatted = `${(value / 1e3).toFixed(0)}k`
  else if (abs >= 100) formatted = Math.round(value).toString()
  // For sub-100 numbers, keep one decimal so PM₂.₅ values like 6.5 µg/m³
  // don't get rendered as "7" (or worse, look like "65" once neighbors
  // round to whole numbers).
  else if (abs >= 1) formatted = value.toFixed(1)
  // Below 1, keep two decimals so 0.05 deaths/km² doesn't display as 0.
  else if (abs >= 0.01) formatted = value.toFixed(2)
  // For very small values (mortality, etc.), drop into scientific notation
  // rather than printing strings of zeros.
  else if (abs > 0) formatted = value.toExponential(1)
  else formatted = '0'

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
