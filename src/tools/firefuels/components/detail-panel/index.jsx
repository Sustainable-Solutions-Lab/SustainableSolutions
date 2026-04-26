/**
 * components/detail-panel/index.jsx
 * Overlay panel showing all variable values for a clicked grid cell.
 */

import { X } from 'lucide-react'
import { Actions } from '../../contracts/events.js'
import { formatValue, formatCoord } from '../../lib/format.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { BenefitCostChart } from './bar-chart.jsx'

export function DetailPanel({ config, cell, state, dispatch }) {
  if (!cell) return null

  const activeVariable = getActiveVariable(
    config,
    state.activeLayer,
    state.activeDimensions,
  )

  const rawValue = activeVariable ? cell.values[activeVariable.id] : null

  return (
    <div
      className="absolute z-10 bg-paper-2 border border-rule p-6"
      style={{
        bottom: 24,
        right: 24,
        width: '100%',
        maxWidth: 300,
        borderRadius: 'var(--radius-md)',
      }}
    >
      {/* Header row: coordinates + close button */}
      <div className="flex items-start justify-between mb-6">
        <span className="font-mono text-[11px] text-ink-3 leading-snug">
          {formatCoord(cell.lat, cell.lng)}
        </span>
        <button
          type="button"
          onClick={() => dispatch({ type: Actions.DESELECT_CELL })}
          aria-label="Close detail panel"
          className="ml-2 shrink-0 flex items-center justify-center cursor-pointer bg-transparent text-ink-3 hover:text-ink border border-rule transition-colors"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Active variable value */}
      {activeVariable && (
        <div className="mb-6">
          <p className="font-sans text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-1 m-0">
            {activeVariable.label}
          </p>
          <p className="font-mono text-[16px] text-ink m-0" style={{ lineHeight: 1.4 }}>
            {formatValue(rawValue, activeVariable.unit)}
          </p>
        </div>
      )}

      {/* Benefit vs cost chart */}
      <BenefitCostChart cell={cell} config={config} />
    </div>
  )
}
