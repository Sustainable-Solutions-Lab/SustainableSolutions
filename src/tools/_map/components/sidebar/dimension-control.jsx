/**
 * components/sidebar/dimension-control.jsx
 *
 * Renders the appropriate control for a given Dimension:
 *   - 'toggle'   → row of pill buttons
 *   - 'slider'   → range input with numeric labels
 *   - 'dropdown' → native <select>
 */

import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { Actions } from '../../contracts/events.js'

export function DimensionControl({ dimension, value, dispatch }) {
  function handleChange(newValue) {
    dispatch({ type: Actions.SET_DIMENSION, dimensionId: dimension.id, value: newValue })
  }

  return (
    <div className="mb-2">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-0.5 m-0">
        {dimension.label}
      </p>

      {dimension.type === 'toggle' && (
        <ToggleControl dimension={dimension} value={value} onChange={handleChange} />
      )}
      {dimension.type === 'slider' && (
        <SliderControl dimension={dimension} value={value} onChange={handleChange} />
      )}
      {dimension.type === 'dropdown' && (
        <DropdownControl dimension={dimension} value={value} onChange={handleChange} />
      )}
    </div>
  )
}

function ToggleControl({ dimension, value, onChange }) {
  // Render as a <select> matching the publications-page filter style — was
  // previously a row of underlined text buttons. Toggle/dropdown render the
  // same way now; the type distinction in the config still drives whether
  // multi-select / radio behavior applies in future.
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink"
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      {dimension.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

// Emits the option ID (a string, per the DimensionOption contract) — not the
// raw number. get-active-variable matches dimensionValues with strict
// equality, so a numeric emission here silently deselects every variable.
// dimension.animate: true adds a play button that steps through the options
// (wrapping) — used by the food-emissions year slider.
function SliderControl({ dimension, value, onChange }) {
  const [playing, setPlaying] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    if (!playing) return undefined
    const ids = dimension.options.map((o) => o.id)
    const timer = setInterval(() => {
      const idx = ids.indexOf(String(valueRef.current))
      onChangeRef.current(ids[(idx + 1) % ids.length])
    }, 700)
    return () => clearInterval(timer)
  }, [playing, dimension])
  const numericValue = typeof value === 'number' ? value : parseFloat(value)
  const options = dimension.options
  const min = options.length >= 2 ? parseFloat(options[0].id) : 0
  const max = options.length >= 2 ? parseFloat(options[options.length - 1].id) : 100

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="font-mono text-[13px] text-ink-3">
          {min}{dimension.unit ? ` ${dimension.unit}` : ''}
        </span>
        <span className="font-mono text-[13px] text-ink">
          {numericValue}{dimension.unit ? ` ${dimension.unit}` : ''}
        </span>
        <span className="font-mono text-[13px] text-ink-3">
          {max}{dimension.unit ? ` ${dimension.unit}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {dimension.animate && (
          <button
            type="button"
            onClick={() => setPlaying((x) => !x)}
            aria-label={playing ? 'Pause animation' : 'Animate through values'}
            className="bg-transparent border-0 cursor-pointer p-0 text-ink-2 hover:text-ink"
            style={{ lineHeight: 0, flexShrink: 0 }}
          >
            {playing ? <Pause size={15} strokeWidth={1.75} /> : <Play size={15} strokeWidth={1.75} />}
          </button>
        )}
        <input
          type="range"
          min={min}
          max={max}
          value={numericValue}
          onChange={(e) => { setPlaying(false); onChange(String(+e.target.value)) }}
          style={{ width: '100%', accentColor: 'var(--cardinal)' }}
        />
      </div>
    </div>
  )
}

function DropdownControl({ dimension, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink"
      style={{ borderRadius: 'var(--radius-sm)' }}
    >
      {dimension.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
