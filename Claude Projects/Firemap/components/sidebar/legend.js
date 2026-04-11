/**
 * components/sidebar/legend.js
 *
 * Renders a color legend for the active variable:
 *   - Categorical: colored swatches with labels
 *   - Continuous:  gradient bar with min/zero/max labels
 */

import { Box, Flex, Text } from 'theme-ui'
import { buildLegendStops } from '../../lib/colormap.js'
import { formatValue } from '../../lib/format.js'

export function Legend({ variable }) {
  if (!variable) return null

  if (variable.type === 'categorical') {
    return <CategoricalLegend variable={variable} />
  }

  return <ContinuousLegend variable={variable} />
}

function CategoricalLegend({ variable }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Text
        sx={{
          fontFamily: 'body',
          fontSize: 0,
          fontWeight: 'bold',
          letterSpacing: 'caps',
          textTransform: 'uppercase',
          color: 'muted',
          mb: 2,
          display: 'block',
        }}
      >
        {variable.label}
      </Text>
      <Flex sx={{ flexDirection: 'column', gap: 1 }}>
        {variable.categories.map((cat) => (
          <Flex key={cat.id} sx={{ alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 'sm',
                flexShrink: 0,
                bg: cat.color,
              }}
            />
            <Text sx={{ fontFamily: 'body', fontSize: 0, color: 'text' }}>
              {cat.label}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  )
}

function ContinuousLegend({ variable }) {
  const stops = buildLegendStops(variable, 30)
  const { min, max, zero } = variable.domain
  const unit = variable.unit || ''

  // Build CSS gradient from stops
  const gradientParts = stops.map((stop, i) => {
    const pct = (i / (stops.length - 1)) * 100
    return `${stop.color} ${pct.toFixed(1)}%`
  })
  const gradient = `linear-gradient(to right, ${gradientParts.join(', ')})`

  return (
    <Box sx={{ mb: 3 }}>
      <Flex sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Text
          sx={{
            fontFamily: 'body',
            fontSize: 0,
            fontWeight: 'bold',
            letterSpacing: 'caps',
            textTransform: 'uppercase',
            color: 'muted',
          }}
        >
          {variable.label}
        </Text>
        {unit && (
          <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
            {unit}
          </Text>
        )}
      </Flex>

      {/* Gradient bar */}
      <Box
        sx={{
          height: 10,
          borderRadius: 'sm',
          background: gradient,
          mb: 1,
        }}
      />

      {/* Labels */}
      <Flex sx={{ justifyContent: 'space-between' }}>
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          {formatValue(min, unit)}
        </Text>

        {variable.diverging && zero !== undefined && (
          <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
            {formatValue(zero, unit)}
          </Text>
        )}

        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          {formatValue(max, unit)}
        </Text>
      </Flex>
    </Box>
  )
}
