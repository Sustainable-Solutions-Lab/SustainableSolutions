/**
 * lib/get-active-variable.js
 *
 * Resolves which variable to display given the current layer and dimensions.
 * Used by the map, sidebar legend, and detail panel to stay in sync.
 *
 * Logic: find the variable where:
 *   variable.layer === activeLayer
 *   AND every key in variable.dimensionValues matches activeDimensions
 */

/**
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {string} activeLayer
 * @param {Object} activeDimensions   - { [dimensionId]: string|number }
 * @returns {import('../contracts/project-config').Variable | null}
 */
export function getActiveVariable(config, activeLayer, activeDimensions) {
  return (
    config.variables.find((v) => {
      if (v.layer !== activeLayer) return false
      if (!v.dimensionValues) return true

      return Object.entries(v.dimensionValues).every(
        ([dimId, expected]) => activeDimensions[dimId] === expected
      )
    }) ?? null
  )
}

/**
 * Returns the default activeDimensions for a given layer.
 * Pulls defaultValue from each relevant dimension.
 *
 * @param {import('../contracts/project-config').ProjectConfig} config
 * @param {string} layerId
 * @returns {Object}
 */
export function getDefaultDimensionsForLayer(config, layerId) {
  const layer = config.layers.find((l) => l.id === layerId)
  if (!layer) return {}

  const result = {}
  for (const dimId of layer.dimensionIds) {
    const dim = config.dimensions.find((d) => d.id === dimId)
    if (dim) result[dimId] = dim.defaultValue
  }
  return result
}
