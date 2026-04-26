/**
 * components/sidebar/legend.jsx
 *
 * Renders a color legend for the active variable:
 *   - Categorical: colored swatches with labels
 *   - Continuous:  gradient bar with min/zero/max labels
 */

import { Box, Flex, Text } from 'theme-ui'
import { buildLegendStops } from '../../lib/colormap.js'
import { formatValue } from '../../lib/format.js'

export function Legend({ variable, allValues = [], isDark = true }) {
  if (!variable) return null
  if (variable.type !== 'categorical') return null
  return <CategoricalLegend variable={variable} isDark={isDark} />
}

/**
 * Compact color bar for the mobile map overlay.
 * Renders a gradient bar + labels for continuous variables,
 * or colored swatches for categorical variables.
 */
export function MobileLegend({ variable, allValues = [], isDark = true }) {
  if (!variable) return null
  if (variable.type === 'categorical') {
    return <MobileCategoricalLegend variable={variable} isDark={isDark} />
  }
  return <MobileContinuousLegend variable={variable} allValues={allValues} isDark={isDark} />
}

function CategoricalLegend({ variable, isDark = true }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Flex sx={{ flexDirection: 'column', gap: 1 }}>
        {variable.categories.map((cat) => {
          const color = isDark ? (cat.colorDark ?? cat.color) : (cat.colorLight ?? cat.color)
          return (
            <Flex key={cat.id} sx={{ alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: 'sm',
                  flexShrink: 0,
                  bg: color,
                }}
              />
              <Text sx={{ fontFamily: 'body', fontSize: 1, color: 'text' }}>
                {cat.label}
              </Text>
            </Flex>
          )
        })}
      </Flex>
    </Box>
  )
}

/**
 * Apply an alpha channel to a D3 rgb() color string.
 */
function withAlpha(cssColor, alpha) {
  if (cssColor.startsWith('rgba')) return cssColor
  return cssColor.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `, ${alpha.toFixed(3)})`)
}

function ContinuousLegend({ variable, allValues = [], isDark = true }) {
  const { zero } = variable.domain
  const unit = variable.unit || ''

  // Compute actual domain from rendered data (p1–p99, matching colorRangeRef in use-map-layer)
  let effectiveDomain = variable.domain
  if (allValues.length >= 2) {
    const sorted_ = [...allValues].sort((a, b) => a - b)
    const p01 = sorted_[Math.floor(sorted_.length * 0.01)] ?? sorted_[0]
    const p99 = sorted_[Math.floor(sorted_.length * 0.99)] ?? sorted_[sorted_.length - 1]
    if (p99 > p01) effectiveDomain = { ...variable.domain, min: p01, max: p99 }
  }
  const { min, max } = effectiveDomain

  // Distribution chart is sorted descending (high → low, left → right).
  // Legend matches that orientation: max on left, min on right.
  let gradient
  if (variable.diverging) {
    const zeroVal = variable.domain?.zero ?? 0
    const negRange = Math.max(zeroVal - min, 0.001)
    const posRange = Math.max(max - zeroVal, 0.001)
    const totalRange = negRange + posRange
    // Zero sits at posRange/total from the left (positive side is on the left now)
    const zeroPct = (posRange / totalRange * 100).toFixed(1)

    // High (positive, blue) on left → transparent at zero → low (negative, red) on right
    const blue = isDark ? '#4393c3' : '#2166ac'
    const red  = isDark ? '#d6604d' : '#b2182b'
    const blueRgb = isDark ? '67,147,195' : '33,102,172'
    const redRgb  = isDark ? '214,96,77'  : '178,24,43'
    gradient = `linear-gradient(to right,
      ${blue} 0%,
      rgba(${blueRgb},0) ${zeroPct}%,
      rgba(${redRgb},0) ${zeroPct}%,
      ${red} 100%)`
  } else {
    // Sequential: high value on left (reverse the gradient)
    // Use scheme-aware colormap so colors match the diverging anchors
    let cm = variable.colormap
    if (cm === 'RdBuBlue') cm = isDark ? 'RdBuBlueDark' : 'RdBuBlueLight'
    if (cm === 'RdBuRed')  cm = isDark ? 'RdBuRedDark'  : 'RdBuRedLight'
    const stops = buildLegendStops({ ...variable, domain: effectiveDomain, colormap: cm }, 30)
    const parts = stops.map((stop, i) => {
      const alpha = 0.15 + (i / (stops.length - 1)) * 0.85
      return `${withAlpha(stop.color, alpha)} ${(i / (stops.length - 1) * 100).toFixed(1)}%`
    })
    gradient = `linear-gradient(to left, ${parts.join(', ')})`
  }

  return (
    <Box sx={{ mb: 3 }}>
      {unit && (
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted', display: 'block', mb: 1 }}>
          {unit}
        </Text>
      )}

      <Box sx={{ height: 10, borderRadius: 'sm', background: gradient, mb: 1 }} />

      {/* Labels: max on left, zero in centre, min on right — matching chart sort order */}
      <Flex sx={{ justifyContent: 'space-between' }}>
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          {formatValue(max, unit)}
        </Text>
        {variable.diverging && zero !== undefined && (
          <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
            {formatValue(zero, unit)}
          </Text>
        )}
        <Text sx={{ fontFamily: 'mono', fontSize: 0, color: 'muted' }}>
          {formatValue(min, unit)}
        </Text>
      </Flex>
    </Box>
  )
}

// ── Mobile legend components ──────────────────────────────────────────────────

/** Format a number without its unit — just the magnitude with k/M suffix. */
function fmtNum(v) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`
  if (abs < 1 && abs > 0) return `${v.toFixed(2)}`
  return `${sign}${Math.round(abs)}`
}

function MobileContinuousLegend({ variable, allValues = [], isDark }) {
  const unit = variable.unit || ''
  const zeroVal = variable.domain?.zero ?? 0

  let effectiveDomain = variable.domain
  if (allValues.length >= 2) {
    const sorted_ = [...allValues].sort((a, b) => a - b)
    const p01 = sorted_[Math.floor(sorted_.length * 0.01)] ?? sorted_[0]
    const p99 = sorted_[Math.floor(sorted_.length * 0.99)] ?? sorted_[sorted_.length - 1]
    if (p99 > p01) effectiveDomain = { ...variable.domain, min: p01, max: p99 }
  }
  const { min, max } = effectiveDomain

  let gradient
  let zeroPct = null   // percentage from left where the gradient is transparent (diverging only)
  if (variable.diverging) {
    const negRange = Math.max(zeroVal - min, 0.001)
    const posRange = Math.max(max - zeroVal, 0.001)
    zeroPct = posRange / (negRange + posRange) * 100
    const blue = isDark ? '#4393c3' : '#2166ac'
    const red  = isDark ? '#d6604d' : '#b2182b'
    const blueRgb = isDark ? '67,147,195' : '33,102,172'
    const redRgb  = isDark ? '214,96,77'  : '178,24,43'
    gradient = `linear-gradient(to right, ${blue} 0%, rgba(${blueRgb},0) ${zeroPct.toFixed(1)}%, rgba(${redRgb},0) ${zeroPct.toFixed(1)}%, ${red} 100%)`
  } else {
    let cm = variable.colormap
    if (cm === 'RdBuBlue') cm = isDark ? 'RdBuBlueDark' : 'RdBuBlueLight'
    if (cm === 'RdBuRed')  cm = isDark ? 'RdBuRedDark'  : 'RdBuRedLight'
    const stops = buildLegendStops({ ...variable, domain: effectiveDomain, colormap: cm }, 30)
    const parts = stops.map((stop, i) => {
      const alpha = 0.15 + (i / (stops.length - 1)) * 0.85
      return `${withAlpha(stop.color, alpha)} ${(i / (stops.length - 1) * 100).toFixed(1)}%`
    })
    gradient = `linear-gradient(to left, ${parts.join(', ')})`
  }

  const textColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'
  const labelStyle = { fontFamily: 'monospace', fontSize: 10, color: textColor, position: 'absolute', whiteSpace: 'nowrap' }

  return (
    <Box>
      {unit && (
        <Box style={{ fontFamily: 'monospace', fontSize: 10, color: textColor, marginBottom: 3 }}>
          {unit}
        </Box>
      )}
      <Box style={{ height: 8, borderRadius: 3, background: gradient, marginBottom: 3 }} />
      {/* Labels: positioned absolutely so zero aligns with the transparent point */}
      <Box style={{ position: 'relative', height: 13 }}>
        <Box style={{ ...labelStyle, left: 0 }}>{fmtNum(max)}</Box>
        {variable.diverging && zeroPct !== null && (
          <Box style={{
            ...labelStyle,
            left: `${zeroPct.toFixed(1)}%`,
            transform: 'translateX(-50%)',
          }}>
            {fmtNum(zeroVal)}
          </Box>
        )}
        <Box style={{ ...labelStyle, right: 0 }}>{fmtNum(min)}</Box>
      </Box>
    </Box>
  )
}

function MobileCategoricalLegend({ variable, isDark }) {
  const textColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'
  return (
    <Flex sx={{ flexDirection: 'column', gap: '4px' }}>
      {variable.categories.map((cat) => {
        const color = isDark ? (cat.colorDark ?? cat.color) : (cat.colorLight ?? cat.color)
        return (
          <Flex key={cat.id} sx={{ alignItems: 'center', gap: '6px' }}>
            <Box style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: color }} />
            <Box style={{ fontFamily: 'monospace', fontSize: 10, color: textColor }}>{cat.label}</Box>
          </Flex>
        )
      })}
    </Flex>
  )
}
