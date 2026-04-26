/**
 * components/sidebar/dimension-control.jsx
 *
 * Renders the appropriate control for a given Dimension:
 *   - 'toggle'   → row of pill buttons
 *   - 'slider'   → range input with numeric labels
 *   - 'dropdown' → native <select>
 */

import { Box, Flex, Text } from 'theme-ui'
import { Actions } from '../../contracts/events.js'

export function DimensionControl({ dimension, value, dispatch }) {
  function handleChange(newValue) {
    dispatch({ type: Actions.SET_DIMENSION, dimensionId: dimension.id, value: newValue })
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Text
        sx={{
          fontFamily: 'body',
          fontSize: 1,
          fontWeight: 'bold',
          letterSpacing: 'caps',
          textTransform: 'uppercase',
          color: 'text',
          mb: 2,
          display: 'block',
        }}
      >
        {dimension.label}
      </Text>

      {dimension.type === 'toggle' && (
        <ToggleControl
          dimension={dimension}
          value={value}
          onChange={handleChange}
        />
      )}

      {dimension.type === 'slider' && (
        <SliderControl
          dimension={dimension}
          value={value}
          onChange={handleChange}
        />
      )}

      {dimension.type === 'dropdown' && (
        <DropdownControl
          dimension={dimension}
          value={value}
          onChange={handleChange}
        />
      )}
    </Box>
  )
}

function ToggleControl({ dimension, value, onChange }) {
  return (
    <Flex sx={{ flexWrap: 'wrap', gap: 0 }}>
      {dimension.options.map((option) => {
        const isActive = option.id === value
        return (
          <Box
            key={option.id}
            as='button'
            onClick={() => onChange(option.id)}
            sx={{
              fontFamily: 'body',
              fontSize: '12px',
              fontWeight: isActive ? 'bold' : 'body',
              letterSpacing: 'caps',
              textTransform: 'uppercase',
              lineHeight: 'body',
              cursor: 'pointer',
              px: '6px',
              py: 1,
              mr: '2px',
              mb: 1,
              border: 'none',
              bg: 'transparent',
              color: isActive ? 'text' : 'muted',
              textDecoration: isActive ? 'underline' : 'none',
              textUnderlineOffset: '3px',
              transition: 'color 0.1s',
              whiteSpace: 'nowrap',
              '&:hover': { color: 'text' },
            }}
          >
            {option.label}
          </Box>
        )
      })}
    </Flex>
  )
}

function SliderControl({ dimension, value, onChange }) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value)
  const options = dimension.options
  // Use options array as discrete stops, or treat as min/max if exactly 2
  const min = options.length >= 2 ? parseFloat(options[0].id) : 0
  const max = options.length >= 2 ? parseFloat(options[options.length - 1].id) : 100

  return (
    <Box>
      <Flex sx={{ justifyContent: 'space-between', mb: 1 }}>
        <Text sx={{ fontFamily: 'mono', fontSize: 1, color: 'muted' }}>
          {min}{dimension.unit ? ` ${dimension.unit}` : ''}
        </Text>
        <Text sx={{ fontFamily: 'mono', fontSize: 1, color: 'text' }}>
          {numericValue}{dimension.unit ? ` ${dimension.unit}` : ''}
        </Text>
        <Text sx={{ fontFamily: 'mono', fontSize: 1, color: 'muted' }}>
          {max}{dimension.unit ? ` ${dimension.unit}` : ''}
        </Text>
      </Flex>
      <input
        type='range'
        min={min}
        max={max}
        value={numericValue}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--theme-ui-colors-primary)' }}
      />
    </Box>
  )
}

function DropdownControl({ dimension, value, onChange }) {
  return (
    <Box
      as='select'
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{
        width: '100%',
        bg: 'surface',
        color: 'text',
        border: '1px solid',
        borderColor: 'border',
        borderRadius: 'sm',
        px: 2,
        py: 1,
        fontFamily: 'body',
        fontSize: 1,
        cursor: 'pointer',
        '&:focus': {
          outline: 'none',
          borderColor: 'primary',
        },
      }}
    >
      {dimension.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </Box>
  )
}
