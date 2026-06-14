/**
 * components/map/basemap-style.jsx
 *
 * Returns a minimal MapLibre style object — just a flat background color.
 * No external tile server, no land/water colors, no labels.
 * Geographic context comes from our own county borders and CA mask layers.
 *
 * Using an inline style object (not a URL) means:
 * - No Stadia tiles, no green land fill, no city names
 * - The map loads instantly (no tile requests)
 * - Dark/light background perfectly matches the app theme colors
 *
 * Glyphs are still loaded from Stadia's free endpoint — used only for the
 * optional lat/lon graticule labels.
 *
 * @param {'dark'|'light'} scheme
 * @returns {object} MapLibre GL style spec object
 */
export function basemapStyle(scheme) {
  // Aligned with src/styles/colors_and_type.css — paper (light) / paper dark mode.
  const bg = scheme === 'dark' ? '#0C0C1C' : '#F8F8E8'

  return {
    version: 8,
    // Glyph server for graticule degree labels (free, no key required)
    glyphs: 'https://tiles.stadiamaps.com/fonts/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': bg },
      },
    ],
  }
}
