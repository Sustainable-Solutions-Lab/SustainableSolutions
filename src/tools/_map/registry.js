/**
 * _map/registry.js
 *
 * Registry of the map tools that render through the shared _map engine.
 * Each tool lives in its own sibling folder under src/tools/ (firemap,
 * just-air, food-emissions, ...) holding a config that satisfies
 * contracts/project-config.js. To add a new map tool: create
 * src/tools/<slug>/config.js and register it here.
 */
import fuelTreatment from '../firemap/config.js'
import justAir from '../just-air/config.js'
import foodEmissions from '../food-emissions/config.js'

/**
 * @type {Object.<string, import('./contracts/project-config').ProjectConfig>}
 */
export const projects = {
  'fuel-treatment': fuelTreatment,
  'just-air': justAir,
  'food-emissions': foodEmissions,
}

export const defaultProjectId = 'fuel-treatment'
