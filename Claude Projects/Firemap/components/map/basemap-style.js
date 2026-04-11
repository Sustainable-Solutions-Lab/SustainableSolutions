/**
 * components/map/basemap-style.js
 *
 * Returns a MapLibre style URL for the basemap.
 * Stadia Maps free styles — no API key required for development.
 */

/**
 * @param {'dark'|'light'} scheme
 * @returns {string} MapLibre style URL
 */
export function basemapStyle(scheme) {
  if (scheme === 'light') {
    return 'https://tiles.stadiamaps.com/styles/alidade_smooth.json'
  }
  return 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'
}
