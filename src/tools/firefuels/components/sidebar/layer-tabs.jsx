/**
 * components/sidebar/layer-tabs.jsx
 *
 * Renders config.layers as a row of tab buttons.
 * Active tab: colored by layer type + underline. Inactive: muted.
 *
 * Color convention (matches map color scheme):
 *   costs        → red  (#d6604d)
 *   benefits     → blue (#4393c3)
 *   net_benefits → blue (#4393c3)
 *
 * Phase 2 pilot: Theme UI → Tailwind v4 + design system tokens.
 */

import { Actions } from '../../contracts/events.js'

const LAYER_COLORS = {
  costs:        '#d6604d',
  benefits:     '#4393c3',
  net_benefits: '#4393c3',
}

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

  return (
    <div className="flex flex-wrap mb-6">
      {config.layers.filter((layer) => !layer.hidden).map((layer) => {
        const isActive = layer.id === state.activeLayer
        const activeColor = LAYER_COLORS[layer.id]
        return (
          <button
            key={layer.id}
            type="button"
            onClick={() => handleLayerChange(layer.id)}
            className={[
              'cursor-pointer bg-transparent border-0 px-0 py-1 mr-3 mb-1',
              'font-sans text-[12px] uppercase tracking-[0.12em]',
              'transition-colors',
              'underline-offset-[3px]',
              isActive
                ? 'font-bold underline'
                : 'font-normal text-ink-3 hover:text-ink no-underline',
            ].join(' ')}
            style={
              isActive
                ? {
                    color: activeColor,
                    textDecorationColor: activeColor,
                  }
                : undefined
            }
          >
            {layer.label}
          </button>
        )
      })}
    </div>
  )
}
