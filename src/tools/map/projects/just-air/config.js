/**
 * projects/just-air/config.js
 *
 * Configuration for: Just Air — air-quality and mortality consequences of
 * net-zero scenarios across 15 U.S. metros.
 *
 * Companion paper: Bergero et al., Nature Climate Change (in press).
 *
 * Per-pixel data lives in just-air-cities.pmtiles; each feature carries
 * pm25_{low,high,diff} and mort_{low,high,diff} so the active variable
 * is just a property lookup, no client-side math. Difference values are
 * pre-computed at build time (high CDR − low CDR).
 *
 * A 15-city bbox manifest (public/tools/just-air/just-air-cities.json) is
 * rendered as outlined rectangles on the low-zoom national view to mark
 * where the high-resolution data lives.
 *
 * @type {import('../../contracts/project-config').ProjectConfig}
 */
const config = {
  id: 'just-air',
  eyebrow: 'INTERACTIVE MAP',
  title: 'Just Air',
  summary: 'Air-quality and mortality consequences of two net-zero scenarios across 15 U.S. metros.',
  description:
    'Annual PM₂.₅ concentrations and PM₂.₅-related mortality projected to 2050 under two net-zero scenarios — Low CDR (limited carbon-dioxide removal) and High CDR — at high spatial resolution for the 15 most populous U.S. metros. Difference layers show where each scenario yields cleaner or more polluted air, and where the resulting health burden shifts. For details, see <a href="https://assets-eu.researchsquare.com/files/rs-7359464/v1/e95da285-43f3-4f1b-b892-d899d3335dda.pdf" target="_blank" rel="noopener noreferrer"><strong>Bergero et al., Nature Climate Change, in press.</strong></a>',

  // CONUS-wide framing with city-by-city zoom-in allowed. The default
  // zoom shows the full lower-48 footprint; minZoom is generous so the
  // user can still pinch out further for context.
  region: {
    center: [-96.5, 38.5],
    zoom: 3.8,
    minZoom: 2.5,
    maxZoom: 13,
    bounds: [-125, 24, -66, 50],
    // Suppress the California-only static overlays (out-of-bounds mask,
    // state border, county borders, CA-city labels) baked in for Firefuels.
    // Without this, the mask would hide everything outside California.
    useCaliforniaOverlay: false,
  },

  // ── Layers (sidebar tabs) ────────────────────────────────────────────────
  layers: [
    {
      id: 'pm25',
      label: 'PM₂.₅',
      description: 'Annual average PM₂.₅ concentration in 2050.',
      dimensionIds: ['scenario'],
    },
    {
      id: 'mortality',
      label: 'Mortality',
      description: 'PM₂.₅-related annual mortality per pixel in 2050.',
      dimensionIds: ['scenario'],
    },
    // Stubs — UI surfaces these but no data yet.
    {
      id: 'pop_density',
      label: 'Population',
      description: 'Population density (data forthcoming).',
      dimensionIds: [],
      hidden: true,
    },
    {
      id: 'minority',
      label: 'Minority share',
      description: 'Non-white minority share (data forthcoming).',
      dimensionIds: [],
      hidden: true,
    },
    {
      id: 'income',
      label: 'Income',
      description: 'Household income (data forthcoming).',
      dimensionIds: [],
      hidden: true,
    },
  ],

  // ── Dimensions ───────────────────────────────────────────────────────────
  dimensions: [
    {
      id: 'scenario',
      label: 'Scenario',
      type: 'toggle',
      defaultValue: 'low',
      options: [
        { id: 'low',  label: 'Low CDR' },
        { id: 'high', label: 'High CDR' },
        { id: 'diff', label: 'Δ (High − Low)' },
      ],
    },
  ],

  // ── Variables ────────────────────────────────────────────────────────────
  // Variable id MUST match the property name baked into the PMTiles by
  // scripts/build-just-air-tiles.mjs (pm25_low, pm25_high, pm25_diff,
  // mort_low, mort_high, mort_diff).
  variables: [
    // PM2.5 — sequential warm scale for raw concentrations.
    {
      id: 'pm25_low',
      label: 'PM₂.₅ — Low CDR',
      unit: 'µg/m³',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 15 },
      layer: 'pm25',
      dimensionValues: { scenario: 'low' },
      description: 'Annual mean PM₂.₅ concentration under the Low-CDR scenario.',
    },
    {
      id: 'pm25_high',
      label: 'PM₂.₅ — High CDR',
      unit: 'µg/m³',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 15 },
      layer: 'pm25',
      dimensionValues: { scenario: 'high' },
      description: 'Annual mean PM₂.₅ concentration under the High-CDR scenario.',
    },
    {
      id: 'pm25_diff',
      label: 'Δ PM₂.₅ (High − Low)',
      unit: 'µg/m³',
      colormap: 'BuRd',
      diverging: true,
      domain: { min: -5, max: 5, zero: 0 },
      layer: 'pm25',
      dimensionValues: { scenario: 'diff' },
      description: 'High CDR minus Low CDR. Blue: High CDR is cleaner; red: High CDR is dirtier.',
    },

    // Mortality — sequential warm scale; magnitudes are small (deaths per pixel).
    {
      id: 'mort_low',
      label: 'Mortality — Low CDR',
      unit: 'deaths/pixel',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 0.001 },
      layer: 'mortality',
      dimensionValues: { scenario: 'low' },
      description: 'Annual PM₂.₅-attributable deaths per pixel under Low-CDR scenario.',
    },
    {
      id: 'mort_high',
      label: 'Mortality — High CDR',
      unit: 'deaths/pixel',
      colormap: 'YlOrRd',
      diverging: false,
      domain: { min: 0, max: 0.001 },
      layer: 'mortality',
      dimensionValues: { scenario: 'high' },
      description: 'Annual PM₂.₅-attributable deaths per pixel under High-CDR scenario.',
    },
    {
      id: 'mort_diff',
      label: 'Δ Mortality (High − Low)',
      unit: 'deaths/pixel',
      colormap: 'BuRd',
      diverging: true,
      domain: { min: -0.0005, max: 0.0005, zero: 0 },
      layer: 'mortality',
      dimensionValues: { scenario: 'diff' },
      description: 'High CDR minus Low CDR. Blue: High CDR saves lives here; red: High CDR adds deaths.',
    },
  ],

  // ── Percentile filter ────────────────────────────────────────────────────
  // Disabled for v1: the slider works against the Firefuels LOD source
  // (firemap-data), which Just Air doesn't use. The distribution chart that
  // hosts the slider also draws from a Firefuels-only GeoJSON prefetch, so
  // it would render as an empty bar regardless. Re-enable once the filter
  // is generalized for multi-source projects.
  percentileFilter: {
    enabled: false,
    defaultLow: 0,
    defaultHigh: 100,
  },

  // ── Area tool ────────────────────────────────────────────────────────────
  areaTool: {
    enabled: true,
    defaultRadiusKm: 25,
    maxRadiusKm: 200,
    aggregateVariableIds: ['pm25_low', 'pm25_high', 'pm25_diff', 'mort_low', 'mort_high', 'mort_diff'],
  },

  // ── Box overlay ──────────────────────────────────────────────────────────
  // Optional. Draws outlined rectangles + small labels at the bbox positions
  // listed in the manifest, fading out at high zoom once the city pixel data
  // is visible. The map renderer honors this when present.
  boxOverlay: {
    manifestUrl: '/tools/just-air/just-air-cities.json',
    fadeOutMinZoom: 7,
    fadeOutMaxZoom: 9,
    labelSize: 10,
  },

  // Two PMTiles sources stack at every zoom: the synthetic 9 km national
  // surface is always visible, and the 15-metro pixel data fades in starting
  // at zoom 7.5 (where individual city pixels become large enough to read).
  // The cities tileset visually covers the national surface inside city
  // boxes, so no explicit masking is needed.
  tileSources: [
    {
      id: 'just-air-national',
      url: 'https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/just-air-national.pmtiles',
      sourceLayer: 'national',
    },
    {
      id: 'just-air-cities',
      url: 'https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/just-air-cities.pmtiles',
      sourceLayer: 'cities',
      fadeInRange: [7.5, 8.5],
    },
  ],
  // Legacy field — kept so back-compat code paths don't NPE. The actual
  // data sources are declared above in tileSources.
  tilesUrl: 'https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/just-air-cities.pmtiles',
  methodsPath: 'just-air/methods.mdx',
};

export default config;
