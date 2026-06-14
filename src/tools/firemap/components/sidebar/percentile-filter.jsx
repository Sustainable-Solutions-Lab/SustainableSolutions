/**
 * components/sidebar/percentile-filter.jsx
 *
 * Simple one-sided percentile filter:
 *   - Radio: "Top" | "Bottom"
 *   - Number input: 1–100 (the X in "Top/Bottom X%")
 *   - Dispatches SET_PERCENTILE with the appropriate { low, high }
 *   - Shows filtered cell count, mean, and median
 */

import { useState } from 'react'
import { Actions } from '../../contracts/events.js'
import { formatValue } from '../../lib/format.js'

export function PercentileFilter({
  variable,
  percentileRange,
  featureCount,
  filteredCount,
  filteredMean,
  filteredMedian,
  dispatch,
}) {
  const isTop = percentileRange.low > 0 || percentileRange.high === 100
  const currentPct = isTop ? 100 - percentileRange.low : percentileRange.high
  const noFilter = percentileRange.low === 0 && percentileRange.high === 100

  const [mode, setMode] = useState(noFilter ? 'all' : percentileRange.low > 0 ? 'top' : 'bottom')
  const [pctValue, setPctValue] = useState(noFilter ? 10 : currentPct)

  const unit = variable?.unit || ''

  function apply(newMode, newPct) {
    if (newMode === 'all') {
      dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
      return
    }
    const n = Math.max(1, Math.min(99, newPct))
    const low = newMode === 'top' ? 100 - n : 0
    const high = newMode === 'top' ? 100 : n
    dispatch({ type: Actions.SET_PERCENTILE, low, high })
  }

  function handleModeChange(newMode) {
    setMode(newMode)
    apply(newMode, pctValue)
  }

  function handlePctChange(e) {
    const val = +e.target.value
    setPctValue(val)
    apply(mode, val)
  }

  const pctFiltered =
    featureCount > 0 && filteredCount != null
      ? ((filteredCount / featureCount) * 100).toFixed(0)
      : null
  const meanDisplay = filteredMean != null ? formatValue(filteredMean, unit) : '—'
  const medianDisplay = filteredMedian != null ? formatValue(filteredMedian, unit) : '—'

  return (
    <div className="mb-6">
      <p className="font-sans text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2 m-0">
        Filter{variable ? ` — ${variable.label}` : ''}
      </p>

      {/* Controls row: All / Top / Bottom radio + number input */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          {[
            { id: 'all', label: 'All' },
            { id: 'top', label: 'Top' },
            { id: 'bottom', label: 'Bottom' },
          ].map(({ id, label }) => (
            <label key={id} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="pct-mode"
                value={id}
                checked={mode === id}
                onChange={() => handleModeChange(id)}
                style={{ accentColor: 'var(--cardinal)', cursor: 'pointer' }}
              />
              <span
                className={[
                  'font-sans text-[13px]',
                  mode === id ? 'text-ink' : 'text-ink-3',
                ].join(' ')}
              >
                {label}
              </span>
            </label>
          ))}
        </div>

        {mode !== 'all' && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={99}
              value={pctValue}
              onChange={handlePctChange}
              className="w-[44px] bg-transparent border-0 border-b border-rule rounded-none text-ink font-mono text-[13px] text-right px-1 py-[2px] outline-none focus:border-ink"
              style={{
                MozAppearance: 'textfield',
              }}
            />
            <span className="font-sans text-[13px] text-ink-3">%</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div>
        <p className="font-mono text-[13px] text-ink-3 mb-1 m-0">
          {noFilter
            ? 'All cells shown'
            : filteredCount != null
            ? `${filteredCount.toLocaleString()} cells${pctFiltered != null ? ` (${pctFiltered}%)` : ''}`
            : '—'}
        </p>
        <p className="font-mono text-[13px] text-ink-3 m-0">
          Mean: {meanDisplay} · Median: {medianDisplay}
        </p>
      </div>
    </div>
  )
}
