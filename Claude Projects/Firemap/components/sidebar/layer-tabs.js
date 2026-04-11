/**
 * components/sidebar/layer-tabs.js
 *
 * Renders config.layers as a row of tab buttons.
 * Active tab is indicated by text color only — no underlines or borders.
 */

import { Flex, Box } from 'theme-ui'
import { Actions } from '../../contracts/events.js'

export function LayerTabs({ config, state, dispatch }) {
  return (
    <Flex sx={{ flexWrap: 'wrap', gap: 0, mb: 3 }}>
      {config.layers.filter((layer) => !layer.hidden).map((layer) => {
        const isActive = layer.id === state.activeLayer
        return (
          <Box
            key={layer.id}
            as='button'
            onClick={() => dispatch({ type: Actions.SET_LAYER, layerId: layer.id })}
            sx={{
              bg: 'transparent',
              border: 'none',
              cursor: 'pointer',
              px: 2,
              py: 1,
              mr: 1,
              mb: 1,
              fontFamily: 'body',
              fontSize: 0,
              fontWeight: isActive ? 'bold' : 'body',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              color: isActive ? 'text' : 'muted',
              transition: 'color 0.1s',
              '&:hover': { color: 'text' },
            }}
          >
            {layer.label}
          </Box>
        )
      })}
    </Flex>
  )
}
