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
 */

import { Flex, Box } from 'theme-ui'
import { Actions } from '../../contracts/events.js'

// Per-layer accent colors for the active tab label
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
    <Flex sx={{ flexWrap: 'wrap', gap: 0, mb: 3 }}>
      {config.layers.filter((layer) => !layer.hidden).map((layer) => {
        const isActive = layer.id === state.activeLayer
        const activeColor = LAYER_COLORS[layer.id] ?? 'text'
        return (
          <Box
            key={layer.id}
            as='button'
            onClick={() => handleLayerChange(layer.id)}
            sx={{
              bg: 'transparent',
              border: 'none',
              cursor: 'pointer',
              px: 0,
              py: 1,
              mr: 3,
              mb: 1,
              fontFamily: 'body',
              fontSize: '12px',
              fontWeight: isActive ? 'bold' : 'body',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              color: isActive ? activeColor : 'muted',
              textDecoration: isActive ? 'underline' : 'none',
              textUnderlineOffset: '3px',
              textDecorationColor: isActive ? activeColor : 'transparent',
              transition: 'color 0.1s',
              '&:hover': { color: isActive ? activeColor : 'text' },
            }}
          >
            {layer.label}
          </Box>
        )
      })}
    </Flex>
  )
}
