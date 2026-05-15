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
  // zoom shows the full lower-48 footprint with margin; minZoom is
  // generous so the user can still pinch out further for context.
  region: {
    center: [-96.5, 38.5],
    zoom: 3.0,
    minZoom: 3.0,
    // Past z 6.5 the radius curve clamps at its last stop (the
    // interpolate doesn't extrapolate); cells stay at z 6.5's size
    // through z 7. Lets the user zoom one more step before bumping
    // into the cap.
    maxZoom: 7,
    bounds: [-125, 24, -66, 50],
    // Suppress the California-only static overlays (out-of-bounds mask,
    // state border, county borders, CA-city labels) baked in for Firefuels.
    // Without this, the mask would hide everything outside California.
    useCaliforniaOverlay: false,
    // Render 48-state borders from /us-states.geojson (single thin line
    // layer; outermost segments collectively form the CONUS coastline).
    useUsOverlay: true,
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
    // Static (no scenario) layers — population is national; income and the
    // race/ethnicity layer come from the per-city demographic CSVs and so
    // only render within the 15 metro bboxes (at z≥7 once the city tiers
    // take over from the national 9 km grid).
    {
      id: 'pop_density',
      label: 'Population',
      description: 'Estimated population per pixel.',
      dimensionIds: [],
    },
    {
      id: 'minority',
      label: 'Race & ethnicity',
      description: 'Percent of population identifying as non-Hispanic white. Available within the 15 metros only.',
      dimensionIds: [],
    },
    {
      id: 'income',
      label: 'Income',
      description: 'Median household income (USD). Available within the 15 metros only.',
      dimensionIds: [],
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
        { id: 'ref',  label: 'Reference 2050' },
        { id: 'low',  label: 'Low CDR 2050' },
        { id: 'high', label: 'High CDR 2050' },
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
    // histogramMin clips the long low-value tail out of the sidebar histogram
    // so the chart focuses on the elevated-PM portion that matters.
    // PM₂.₅ low/high: diverging at the WHO 5 µg/m³ safe-air threshold.
    // Dark blue below 5 (safer), neutral at 5, dark red above 5 (riskier).
    // alphaPower=0 keeps every cell fully opaque (continuous gradient like
    // the paper figure) — otherwise alpha-by-magnitude would fade cells
    // near the threshold to transparent.
    // PM₂.₅ scenarios: BuRd diverging at the WHO 5 µg/m³ safe-air threshold.
    {
      id: 'pm25_ref',
      label: 'PM₂.₅ — Reference 2050',
      unit: 'µg/m³',
      colormap: 'BuRd',
      diverging: true,
      domain: { min: 0, max: 10, zero: 5 },
      alphaFloor: 0,
      alphaPower: 0,
      layer: 'pm25',
      dimensionValues: { scenario: 'ref' },
      description: 'Annual mean PM₂.₅ concentration under the 2050 Reference (no-CDR) scenario.',
    },
    {
      id: 'pm25_low',
      label: 'PM₂.₅ — Low CDR 2050',
      unit: 'µg/m³',
      colormap: 'BuRd',
      diverging: true,
      domain: { min: 0, max: 10, zero: 5 },
      alphaFloor: 0,
      alphaPower: 0,
      layer: 'pm25',
      dimensionValues: { scenario: 'low' },
      description: 'Annual mean PM₂.₅ concentration under the Low-CDR 2050 scenario, diverging at the WHO 5 µg/m³ safe-air threshold.',
    },
    {
      id: 'pm25_high',
      label: 'PM₂.₅ — High CDR 2050',
      unit: 'µg/m³',
      colormap: 'BuRd',
      diverging: true,
      domain: { min: 0, max: 10, zero: 5 },
      alphaFloor: 0,
      alphaPower: 0,
      layer: 'pm25',
      dimensionValues: { scenario: 'high' },
      description: 'Annual mean PM₂.₅ concentration under the High-CDR 2050 scenario, diverging at the WHO 5 µg/m³ safe-air threshold.',
    },
    // PM₂.₅ difference: sequential red gradient (BuRd upper half) since the
    // high − low difference is generally positive (more PM under high-CDR).
    // Continuous color, fully opaque to match the scenario maps.
    {
      id: 'pm25_diff',
      label: 'Δ PM₂.₅ (High − Low)',
      unit: 'µg/m³',
      colormap: 'BuRd',
      colormapStart: 0.5,
      diverging: false,
      domain: { min: 0, max: 3 },
      alphaFloor: 0,
      alphaPower: 0,
      layer: 'pm25',
      dimensionValues: { scenario: 'diff' },
      description: 'High CDR minus Low CDR. Darker red = more PM₂.₅ under high-CDR.',
    },

    // Mortality — distinct colormap from PM₂.₅ so the user has a quick
    // visual cue which variable they're looking at. Purples reads
    // semantically as "deaths" without competing with PM₂.₅'s warm scale.
    // Mortality: sequential MagmaR (cream → orange → wine-pink → dark wine
    // → black). colormapStart=0.15 skips the very palest top so the
    // rendered range starts at yellow-orange and walks through wine to
    // black. Alpha fades the lowest values to transparent.
    {
      id: 'mort_ref',
      label: 'Mortality — Reference 2050',
      unit: 'deaths/pixel',
      colormap: 'MagmaR',
      colormapStart: 0.15,
      diverging: false,
      domain: { min: 0, max: 0.001 },
      histogramMin: 0.0001,
      alphaFloor: 0,
      alphaPower: 0.8,
      layer: 'mortality',
      dimensionValues: { scenario: 'ref' },
      description: 'Annual PM₂.₅-attributable deaths per pixel under the 2050 Reference (no-CDR) scenario.',
    },
    {
      id: 'mort_low',
      label: 'Mortality — Low CDR 2050',
      unit: 'deaths/pixel',
      colormap: 'MagmaR',
      colormapStart: 0.15,
      diverging: false,
      domain: { min: 0, max: 0.001 },
      histogramMin: 0.0001,
      alphaFloor: 0,
      alphaPower: 0.8,
      layer: 'mortality',
      dimensionValues: { scenario: 'low' },
      description: 'Annual PM₂.₅-attributable deaths per pixel under Low-CDR 2050.',
    },
    {
      id: 'mort_high',
      label: 'Mortality — High CDR 2050',
      unit: 'deaths/pixel',
      colormap: 'MagmaR',
      colormapStart: 0.15,
      diverging: false,
      domain: { min: 0, max: 0.001 },
      histogramMin: 0.0001,
      alphaFloor: 0,
      alphaPower: 0.8,
      layer: 'mortality',
      dimensionValues: { scenario: 'high' },
      description: 'Annual PM₂.₅-attributable deaths per pixel under High-CDR 2050.',
    },
    // Mortality difference: sequential MagmaR to match the scenario maps.
    // The high − low difference is generally positive, so a sequential
    // (rather than diverging) ramp reads more clearly than blue/red anchors.
    {
      id: 'mort_diff',
      label: 'Δ Mortality (High − Low)',
      unit: 'deaths/pixel',
      colormap: 'MagmaR',
      colormapStart: 0.15,
      diverging: false,
      domain: { min: 0, max: 0.0005 },
      alphaFloor: 0,
      alphaPower: 0.8,
      layer: 'mortality',
      dimensionValues: { scenario: 'diff' },
      description: 'High CDR minus Low CDR. Darker = more deaths under high-CDR.',
    },

    // ── Population (national + city) ─────────────────────────────────────
    // domain capped at 5000 people/pixel — a handful of dense urban pixels
    // run higher, but clipping there keeps the mid-range visible rather
    // than letting the histogram pile up at zero.
    {
      id: 'population',
      label: 'Population',
      unit: 'people/pixel',
      colormap: 'Greens',
      colormapStart: 0.25,
      diverging: false,
      domain: { min: 0, max: 5000 },
      histogramMin: 50,
      alphaFloor: 0,
      alphaPower: 0.8,
      layer: 'pop_density',
      dimensionValues: {},
      description: 'Estimated population per pixel.',
    },

    // ── Median household income (city pixels + 3 km city bins only) ──────
    {
      id: 'income',
      label: 'Median household income',
      unit: 'USD',
      colormap: 'BuPu',
      colormapStart: 0.25,
      diverging: false,
      domain: { min: 20000, max: 150000 },
      histogramMin: 25000,
      layer: 'income',
      dimensionValues: {},
      description: 'Median household income within the metro pixel grid.',
    },

    // ── Race & ethnicity (city pixels + 3 km city bins only) ─────────────
    // Diverging at 50 so the color reads as "departure from a 50/50 mix":
    // blue side = white majority, red side = non-white majority. This is
    // visually intuitive as a "minority share" map without needing a
    // derived 100 − percent_white field in the tiles.
    {
      id: 'percent_white',
      label: '% non-Hispanic white',
      unit: '%',
      colormap: 'RdBu',
      diverging: true,
      domain: { min: 0, max: 100, zero: 50 },
      layer: 'minority',
      dimensionValues: {},
      description: 'Percent of population identifying as non-Hispanic white. Diverging at 50%: blue = white majority; red = non-white majority.',
    },
  ],

  // ── Percentile filter ────────────────────────────────────────────────────
  percentileFilter: {
    enabled: true,
    defaultLow: 0,
    defaultHigh: 100,
  },

  // ── Area tool ────────────────────────────────────────────────────────────
  areaTool: {
    enabled: true,
    defaultRadiusKm: 25,
    maxRadiusKm: 200,
    aggregateVariableIds: ['pm25_low', 'pm25_high', 'pm25_diff', 'mort_low', 'mort_high', 'mort_diff', 'population', 'income', 'percent_white'],
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

  // Single multi-scale PMTiles. Each feature is a Point at its cell
  // centroid and carries `_scale` (cell side in km). The renderer
  // (use-just-air-layers.js) adds one circle layer per scales[] entry,
  // filtered to that scale value, with the listed zoom band controlling
  // visibility. Bands overlap by 1 zoom step so transitions cross-fade.
  tilesUrl: 'https://pub-9500e4b2ab2d433e9764e9ffc95b119c.r2.dev/just-air.pmtiles',
  sourceLayer: 'just-air',
  // Disjoint zoom bands enforce "one circle size per area at any zoom".
  // The 9 km layer has no maxZoom because outside the 15 metro bboxes
  // the build script keeps 9 km cells emitted at every zoom (those areas
  // never get 3 km / 1 km coverage), while inside the metro bboxes the
  // build script truncates 9 km cells at z6 so 3 km / 1 km take over.
  scales: [
    // Earlier transition out of the supercells than the previous config so
    // the user sees the much denser 9 km grid by z 4 — the previous bands
    // left z 4 still on supercells, which read as "too sparse" at that
    // zoom step.
    // Disjoint zoom bands. The build script's tippecanoe min/max hints on
    // each feature mirror these so tiles only carry what gets shown.
    //
    // Hand-off inside metros snaps cleanly at z 6 — that's also the tile-
    // boundary where the inside-metro 9 km cells fall out (tippecanoe
    // maxzoom=5) and the 3 km city bins begin rendering. Outside metros,
    // 9 km runs through z 6.5.
    { value: 36, minZoom: 2, maxZoom: 4 },     // z 2–3: CONUS overview supercells
    { value: 18, minZoom: 4, maxZoom: 5 },     // z 4:   mid tier
    { value: 9,  minZoom: 5 },                  // z 5+:  9 km grid (city-covered cells drop at z=6)
    { value: 3,  minZoom: 6, maxZoom: 7 },     // z 6:   3 km city bins (clean handoff to 1 km at z=7)
    { value: 1,  minZoom: 7 },                  // z 7+:  native 1 km city pixels
  ],
  methodsPath: 'just-air/methods.mdx',
};

export default config;
