/**
 * components/sidebar/legend.jsx
 *
 * Renders a color legend for the active variable:
 *   - Categorical: colored swatches with labels
 *   - Continuous:  gradient bar with min/zero/max labels
 */

import { buildLegendStops } from '../../lib/colormap.js'
import { formatValue } from '../../lib/format.js'

export function Legend({ variable, allValues = [], isDark = true }) {
  if (!variable) return null
  if (variable.type === 'categorical') {
    return <CategoricalLegend variable={variable} isDark={isDark} />
  }
  // Continuous case — used by projects that don't surface the distribution
  // chart in the sidebar (so the user still gets a color scale + min/max).
  return <ContinuousLegend variable={variable} allValues={allValues} isDark={isDark} />
}

/**
 * Compact color bar for the mobile map overlay.
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
    <div className="mb-6">
      <div className="flex flex-col gap-1">
        {variable.categories.map((cat) => {
          const color = isDark ? (cat.colorDark ?? cat.color) : (cat.colorLight ?? cat.color)
          return (
            <div key={cat.id} className="flex items-center gap-2">
              <span
                className="shrink-0"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 'var(--radius-sm)',
                  background: color,
                }}
              />
              <span className="font-sans text-[13px] text-ink">{cat.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Apply an alpha channel to a D3 rgb() color string.
 */
function withAlpha(cssColor, alpha) {
  if (cssColor.startsWith('rgba')) return cssColor
  return cssColor.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `, ${alpha.toFixed(3)})`)
}

/** Parse "#rrggbb" → "r,g,b" string; null on anything else. */
function hexToRgbStr(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return null
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  return `${r},${g},${b}`
}

// (Continuous sidebar legend — currently unused; the distribution chart
// covers the continuous case in the desktop sidebar. Kept for parity.)
function ContinuousLegend({ variable, allValues = [], isDark = true }) {
  const { zero } = variable.domain
  const unit = variable.unit || ''

  let effectiveDomain = variable.domain
  if (allValues.length >= 2) {
    const sorted_ = [...allValues].sort((a, b) => a - b)
    const p01 = sorted_[Math.floor(sorted_.length * 0.01)] ?? sorted_[0]
    const p99 = sorted_[Math.floor(sorted_.length * 0.99)] ?? sorted_[sorted_.length - 1]
    if (p99 > p01) effectiveDomain = { ...variable.domain, min: p01, max: p99 }
  }
  const { min, max } = effectiveDomain

  let gradient
  if (variable.diverging) {
    const zeroVal = variable.domain?.zero ?? 0
    const negRange = Math.max(zeroVal - min, 0.001)
    const posRange = Math.max(max - zeroVal, 0.001)
    const totalRange = negRange + posRange
    const zeroPct = (posRange / totalRange * 100).toFixed(1)

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
    <div className="mb-6">
      {unit && (
        <p className="font-mono text-[11px] text-ink-3 mb-1 m-0">{unit}</p>
      )}
      <div
        className="mb-1"
        style={{ height: 10, borderRadius: 'var(--radius-sm)', background: gradient }}
      />
      <div className="flex justify-between">
        <span className="font-mono text-[11px] text-ink-3">{formatValue(max, unit)}</span>
        {variable.diverging && zero !== undefined && (
          <span className="font-mono text-[11px] text-ink-3">{formatValue(zero, unit)}</span>
        )}
        <span className="font-mono text-[11px] text-ink-3">{formatValue(min, unit)}</span>
      </div>
    </div>
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

  // Respect any dark-mode colormap swap (e.g. mortality MagmaR → Magma)
  // and the historical RdBuBlue/Red light/dark variants.
  let cm = variable.colormap
  if (isDark && variable.darkColormap) cm = variable.darkColormap
  if (cm === 'RdBuBlue') cm = isDark ? 'RdBuBlueDark' : 'RdBuBlueLight'
  if (cm === 'RdBuRed')  cm = isDark ? 'RdBuRedDark'  : 'RdBuRedLight'

  const hasAnchors = variable.solidColor != null || variable.solidColorNegative != null

  let gradient
  let zeroPct = null
  if (variable.diverging && hasAnchors) {
    // Binary anchored mode (diff layers): the two halves are the pinned
    // solidColor / solidColorNegative; we lay them down respecting the
    // colormap convention so left side = max value (positive side).
    const posIsBlue = variable.colormap !== 'BuRd'
    const fallbackBlue = isDark ? '#4393c3' : '#2166ac'
    const fallbackRed  = isDark ? '#d6604d' : '#b2182b'
    const fallbackBlueRgb = isDark ? '67,147,195' : '33,102,172'
    const fallbackRedRgb  = isDark ? '214,96,77'  : '178,24,43'
    const pos = variable.solidColor ?? (posIsBlue ? fallbackBlue : fallbackRed)
    const neg = variable.solidColorNegative ?? (posIsBlue ? fallbackRed : fallbackBlue)
    const posRgb = hexToRgbStr(pos) ?? (posIsBlue ? fallbackBlueRgb : fallbackRedRgb)
    const negRgb = hexToRgbStr(neg) ?? (posIsBlue ? fallbackRedRgb : fallbackBlueRgb)
    const negRange = Math.max(zeroVal - min, 0.001)
    const posRange = Math.max(max - zeroVal, 0.001)
    // Left = max (positive end), right = min (negative end). The crossover
    // sits at the same fraction of the bar as zero sits within (min, max).
    const crossover = (negRange / (negRange + posRange) * 100)
    zeroPct = crossover
    gradient = `linear-gradient(to right, ${pos} 0%, rgba(${posRgb},0) ${crossover.toFixed(1)}%, rgba(${negRgb},0) ${crossover.toFixed(1)}%, ${neg} 100%)`
  } else if (variable.diverging) {
    // Continuous diverging — walk the actual colormap so PM (BuRd, red
    // at high), race (PRGn, green at high), etc. all render correctly.
    const stops = buildLegendStops({ ...variable, domain: effectiveDomain, colormap: cm }, 30)
    const parts = stops.map((stop, i) => `${stop.color} ${(i / (stops.length - 1) * 100).toFixed(1)}%`)
    // Stops walk min→max, so the LEFT end (gradient 100%) is `max`. Use
    // `to left` to keep the convention left=max consistent with the
    // sequential branch and the axis labels below.
    gradient = `linear-gradient(to left, ${parts.join(', ')})`
    const negRange = Math.max(zeroVal - min, 0.001)
    const posRange = Math.max(max - zeroVal, 0.001)
    zeroPct = posRange / (negRange + posRange) * 100
  } else {
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
    <div>
      {unit && (
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: textColor, marginBottom: 3 }}>
          {unit}
        </div>
      )}
      <div style={{ height: 8, borderRadius: 3, background: gradient, marginBottom: 3 }} />
      <div style={{ position: 'relative', height: 13 }}>
        <div style={{ ...labelStyle, left: 0 }}>{fmtNum(max)}</div>
        {variable.diverging && zeroPct !== null && (
          <div style={{ ...labelStyle, left: `${zeroPct.toFixed(1)}%`, transform: 'translateX(-50%)' }}>
            {fmtNum(zeroVal)}
          </div>
        )}
        <div style={{ ...labelStyle, right: 0 }}>{fmtNum(min)}</div>
      </div>
    </div>
  )
}

function MobileCategoricalLegend({ variable, isDark }) {
  const textColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)'
  return (
    <div className="flex flex-col" style={{ gap: '4px' }}>
      {variable.categories.map((cat) => {
        const color = isDark ? (cat.colorDark ?? cat.color) : (cat.colorLight ?? cat.color)
        return (
          <div key={cat.id} className="flex items-center" style={{ gap: '6px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: color }} />
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: textColor }}>{cat.label}</span>
          </div>
        )
      })}
    </div>
  )
}
