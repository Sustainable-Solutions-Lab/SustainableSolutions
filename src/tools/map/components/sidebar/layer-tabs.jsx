/**
 * components/sidebar/layer-tabs.jsx
 *
 * Renders config.layers as a <select> dropdown that matches the lab's
 * publications-page filter style. (Previously a row of underlined text
 * tabs with per-layer color accents — converted to dropdown for visual
 * consistency with the rest of the site.)
 */

import { Actions } from '../../contracts/events.js'

export function LayerTabs({ config, state, dispatch }) {
  function handleLayerChange(layerId) {
    const dimensionResets = {}
    for (const dim of config.dimensions) {
      const current = state.activeDimensions[dim.id] ?? dim.defaultValue
      const opt = dim.options?.find((o) => o.id === current)
      if (opt?.visibleForLayers && !opt.visibleForLayers.includes(layerId)) {
        const hasMIn = dim.options?.some((o) => o.id === 'min')
        dimensionResets[dim.id] = hasMIn ? 'min' : dim.defaultValue
      }
    }
    dispatch({
      type: Actions.SET_LAYER,
      layerId,
      ...(Object.keys(dimensionResets).length ? { dimensionResets } : {}),
    })
  }

  const visibleLayers = config.layers.filter((l) => !l.hidden)

  return (
    <div className="mb-6">
      <select
        value={state.activeLayer}
        onChange={(e) => handleLayerChange(e.target.value)}
        className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink"
        style={{ borderRadius: 'var(--radius-sm)' }}
      >
        {visibleLayers.map((layer) => (
          <option key={layer.id} value={layer.id}>{layer.label}</option>
        ))}
      </select>
    </div>
  )
}
