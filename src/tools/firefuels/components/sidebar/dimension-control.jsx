/**
 * components/sidebar/dimension-control.jsx
 *
 * Renders the appropriate control for a given Dimension:
 *   - 'toggle'   → row of pill buttons
 *   - 'slider'   → range input with numeric labels
 *   - 'dropdown' → native <select>
 */

import { Actions } from '../../contracts/events.js'

export function DimensionControl({ dimension, value, dispatch }) {
  function handleChange(newValue) {
    dispatch({ type: Actions.SET_DIMENSION, dimensionId: dimension.id, value: newValue })
  }

  return (
    <div className="mb-6">
      <p className="font-sans text-[13px] font-bold uppercase tracking-[0.12em] text-ink mb-2 m-0">
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
  return (
    <div className="flex flex-wrap">
      {dimension.options.map((option) => {
        const isActive = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={[
              'cursor-pointer bg-transparent border-0 py-1 mb-1 mr-[2px] px-[6px]',
              'font-sans text-[12px] uppercase tracking-[0.12em] whitespace-nowrap',
              'underline-offset-[3px] transition-colors',
              isActive
                ? 'font-bold text-ink underline'
                : 'font-normal text-ink-3 hover:text-ink no-underline',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function SliderControl({ dimension, value, onChange }) {
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
      <input
        type="range"
        min={min}
        max={max}
        value={numericValue}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--cardinal)' }}
      />
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
