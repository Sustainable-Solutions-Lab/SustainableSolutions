/**
 * components/sidebar/layer-tabs.js
 *
 * Renders config.layers as a row of tab buttons.
 * Active tab has a colored bottom border (primary color).
 */

import { Flex, Box, Text } from 'theme-ui'
import { Actions } from '../../contracts/events.js'

export function LayerTabs({ config, state, dispatch }) {
  return (
    <Flex
      sx={{
        flexDirection: 'row',
        borderBottom: '1px solid',
        borderColor: 'border',
        mb: 3,
        gap: 0,
      }}
    >
      {config.layers.map((layer) => {
        const isActive = layer.id === state.activeLayer
        return (
          <Box
            key={layer.id}
            as='button'
            onClick={() => dispatch({ type: Actions.SET_LAYER, layerId: layer.id })}
            sx={{
              flex: 1,
              py: 2,
              px: 1,
              bg: 'transparent',
              border: 'none',
              borderBottom: '2px solid',
              borderBottomColor: isActive ? 'primary' : 'transparent',
              cursor: 'pointer',
              color: isActive ? 'text' : 'muted',
              fontFamily: 'body',
              fontSize: 0,
              fontWeight: isActive ? 'bold' : 'body',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              transition: 'all 0.15s ease',
              textAlign: 'center',
              '&:hover': {
                color: 'text',
              },
            }}
          >
            {layer.label}
          </Box>
        )
      })}
    </Flex>
  )
}
