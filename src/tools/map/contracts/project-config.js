/**
 * contracts/project-config.js
 *
 * LOCKED — do not modify after Phase 0.
 *
 * Defines the schema that every project config must satisfy.
 * All components loop over these structures; none hardcode project-specific values.
 *
 * See projects/fuel-treatment/config.js for the reference implementation.
 */

// ─── Variable ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ColorDomain
 * @property {number} min
 * @property {number} max
 * @property {number} [zero]  - for diverging scales, the neutral midpoint (default 0)
 */

/**
 * A continuous numeric variable mapped to a color scale.
 * @typedef {Object} ContinuousVariable
 * @property {'continuous'} [type]   - default when `type` is absent
 * @property {string}  id            - exact column name in the source CSV
 * @property {string}  label         - display name
 * @property {string}  unit          - display unit, e.g. '$/km²' or '' for ratios
 * @property {string}  colormap      - 'RdBu' | 'Oranges' | 'Greens' | 'YlOrRd' | 'PuOr' | 'Blues'
 * @property {boolean} diverging     - true: scale is centered on domain.zero
 * @property {ColorDomain} domain    - data range for color mapping
 * @property {string}  layer         - which Layer tab this variable belongs to
 * @property {Object}  [dimensionValues] - { [dimensionId]: optionId } — which dimension
 *                                        state activates this variable in its layer
 * @property {string}  [description] - shown as a tooltip in the sidebar
 */

/**
 * A categorical variable mapped to a discrete color palette.
 * @typedef {Object} CategoricalVariable
 * @property {'categorical'} type
 * @property {string}  id
 * @property {string}  label
 * @property {string}  unit          - usually ''
 * @property {string}  layer
 * @property {Object}  [dimensionValues]
 * @property {{ id: string, label: string, color: string }[]} categories
 * @property {string}  [description]
 */

/**
 * @typedef {ContinuousVariable | CategoricalVariable} Variable
 */

// ─── Dimension ───────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, label: string }} DimensionOption
 */

/**
 * A control dimension that the user adjusts in the sidebar.
 * @typedef {Object} Dimension
 * @property {string}            id           - key in AppState.activeDimensions
 * @property {string}            label
 * @property {'toggle'|'slider'|'dropdown'} type
 * @property {DimensionOption[]} options
 * @property {string}            defaultValue
 * @property {string}            [unit]       - shown next to slider value
 */

// ─── Layer ───────────────────────────────────────────────────────────────────

/**
 * A top-level display mode shown as a tab in the sidebar.
 * The active variable is derived by matching:
 *   variable.layer === activeLayer &&
 *   every key in variable.dimensionValues matches activeDimensions
 *
 * @typedef {Object} Layer
 * @property {string}   id
 * @property {string}   label
 * @property {string}   [description]
 * @property {string[]} dimensionIds   - which dimensions are shown in this layer's tab
 *                                       (references Dimension.id from config.dimensions)
 */

// ─── Percentile filter ───────────────────────────────────────────────────────

/**
 * Configures the percentile filter UI in the sidebar.
 * @typedef {Object} PercentileFilterConfig
 * @property {boolean} enabled
 * @property {number}  defaultLow    - 0–100, default lower bound (0 = no filter)
 * @property {number}  defaultHigh   - 0–100, default upper bound (100 = no filter)
 */

// ─── Area tool ───────────────────────────────────────────────────────────────

/**
 * Configures the circle drawing area-selection tool.
 * @typedef {Object} AreaToolConfig
 * @property {boolean} enabled
 * @property {number}  defaultRadiusKm
 * @property {number}  maxRadiusKm
 * @property {string[]} aggregateVariableIds   - which variables to show in the stats panel
 *                                              (subset of variable ids)
 */

// ─── Project ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MapRegion
 * @property {[number, number]}              center   - [lng, lat]
 * @property {number}                        zoom
 * @property {[number,number,number,number]} [bounds] - [west, south, east, north]
 * @property {number} [minZoom]   - clamp on how far the user can zoom out
 * @property {number} [maxZoom]   - clamp on how far the user can zoom in
 * @property {boolean} [useCaliforniaOverlay]  - default true. When false,
 *           the CA-specific static overlays (out-of-bounds mask, state border,
 *           county borders, CA-city labels) are suppressed. CONUS-wide and
 *           international projects should set false.
 */

/**
 * Optional box-overlay config. Draws outlined rectangles + small labels at
 * the bbox positions listed in `manifestUrl`. Used by Just Air to mark the
 * 15 metros where high-resolution pixel data lives on the otherwise-empty
 * national map. Fades out as the user zooms into the city data itself.
 *
 * @typedef {Object} BoxOverlayConfig
 * @property {string} manifestUrl       - JSON URL: array of { slug, label, bbox: [w,s,e,n] }
 * @property {number} [fadeOutMinZoom]  - boxes are fully visible at and below this zoom
 * @property {number} [fadeOutMaxZoom]  - boxes are fully invisible at and above this zoom
 * @property {number} [labelSize]       - label font size in px
 */

/**
 * The full project configuration object.
 * @typedef {Object} ProjectConfig
 * @property {string}               id
 * @property {string}               title
 * @property {string}               description
 * @property {MapRegion}            region
 * @property {Layer[]}              layers          - ordered; first is the default tab
 * @property {Variable[]}           variables       - all variables, flat list
 * @property {Dimension[]}          dimensions      - all dimensions, flat list
 * @property {PercentileFilterConfig} percentileFilter
 * @property {AreaToolConfig}       areaTool
 * @property {string}               tilesUrl        - PMTiles URL or local path (legacy/fallback)
 * @property {TileSource[]}         [tileSources]   - opt-in: multi-source polygon PMTiles
 *                                                   renderer. When set, the legacy LOD
 *                                                   circle renderer (use-map-layer.js)
 *                                                   bows out and use-multi-source-layers
 *                                                   handles the data layers instead.
 * @property {string}               [methodsPath]
 * @property {BoxOverlayConfig}     [boxOverlay]
 */

/**
 * One polygon-tiled PMTiles source. Used by projects whose data isn't the
 * Firefuels 0.01°/0.05°/0.1° LOD circle scheme — most things, in practice.
 *
 * @typedef {Object} TileSource
 * @property {string} id           - MapLibre source id (must be unique)
 * @property {string} url          - PMTiles URL (https://…/foo.pmtiles)
 * @property {string} sourceLayer  - tippecanoe layer name baked into the PMTiles
 * @property {number} [minZoom]    - clamp the fill layer's visibility (default: 0)
 * @property {number} [maxZoom]    - clamp the fill layer's visibility (default: 24)
 * @property {[number, number]} [fadeInRange]  - [z0, z1]: opacity ramps 0→1 across this range
 * @property {[number, number]} [fadeOutRange] - [z0, z1]: opacity ramps 1→0 across this range
 */

// This file exports nothing at runtime — it is documentation only.
// Reference types in JSDoc:
//   @param {import('../contracts/project-config').ProjectConfig} config
//   @param {import('../contracts/project-config').Variable} variable
