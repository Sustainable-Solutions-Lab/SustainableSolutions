/**
 * contracts/events.js
 *
 * LOCKED — do not modify after Phase 0.
 *
 * Defines the AppState shape and action types used by useReducer in pages/index.js.
 * All components receive slices of this state as props — they never manage state themselves.
 */

/**
 * @typedef {Object} CellData
 * @property {number}  lat
 * @property {number}  lng
 * @property {Object}  values   - { [variableId]: number | string }
 */

/**
 * @typedef {Object} DrawnCircle
 * @property {number} lat       - center latitude
 * @property {number} lng       - center longitude
 * @property {number} radiusKm  - radius in km
 */

/**
 * @typedef {Object} AggregateStats
 * @property {number}  count
 * @property {{ [variableId]: { mean: number, median: number, min: number, max: number } }} stats
 */

/**
 * @typedef {Object} PercentileRange
 * @property {number} low   - 0–100
 * @property {number} high  - 0–100
 */

/**
 * @typedef {Object} AppState
 * @property {string}           projectId
 * @property {string}           activeLayer         - active tab id, e.g. 'net_benefits'
 * @property {Object}           activeDimensions    - { [dimensionId]: string|number }
 * @property {CellData|null}    selectedCell
 * @property {DrawnCircle|null} drawnCircle         - null when no circle is drawn
 * @property {AggregateStats|null} aggregateStats   - computed stats for the drawn circle
 * @property {PercentileRange}  percentileRange     - { low: 0, high: 100 } = no filter
 * @property {'dark'|'light'}   colorScheme
 * @property {boolean}          methodsOpen
 * @property {boolean}          areaToolActive      - true when circle-drawing mode is on
 */

export const Actions = {
  SET_PROJECT:         'SET_PROJECT',
  SET_LAYER:           'SET_LAYER',          // replaces SET_VARIABLE — sets activeLayer
  SET_DIMENSION:       'SET_DIMENSION',
  SELECT_CELL:         'SELECT_CELL',
  DESELECT_CELL:       'DESELECT_CELL',
  SET_DRAWN_CIRCLE:    'SET_DRAWN_CIRCLE',   // { circle: DrawnCircle | null }
  SET_AGGREGATE_STATS: 'SET_AGGREGATE_STATS',// { stats: AggregateStats | null }
  SET_PERCENTILE:      'SET_PERCENTILE',     // { low, high }
  TOGGLE_AREA_TOOL:    'TOGGLE_AREA_TOOL',
  TOGGLE_SCHEME:       'TOGGLE_SCHEME',
  TOGGLE_METHODS:      'TOGGLE_METHODS',
}

/**
 * Initial state. pages/index.js passes this to useReducer.
 * activeLayer and activeDimensions should match the first layer + its defaultValues.
 * @type {AppState}
 */
export const initialState = {
  projectId: 'fuel-treatment',
  activeLayer: 'net_benefits',
  activeDimensions: {
    treatment: 'min',       // default: lowest-cost treatment
    climate: 'current',
    benefit_component: 'total',
    input_var: 'fire_prob',
  },
  selectedCell: null,
  drawnCircle: null,
  aggregateStats: null,
  percentileRange: { low: 0, high: 100 },
  colorScheme: 'dark',
  methodsOpen: false,
  areaToolActive: false,
}
