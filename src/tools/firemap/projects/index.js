import fuelTreatment from './fuel-treatment/config.js'
import justAir from './just-air/config.js'

/**
 * Registry of all available projects.
 * To add a new project: import its config and add an entry here.
 *
 * @type {Object.<string, import('../contracts/project-config').ProjectConfig>}
 */
export const projects = {
  'fuel-treatment': fuelTreatment,
  'just-air': justAir,
}

export const defaultProjectId = 'fuel-treatment'
