import { legendGradient } from './colormap.js'
import { fmt } from './format.js'

/** Gradient legend for the active map variable (rail and floating variants share it). */
export function Legend({ variable, domain, floating = false }) {
  if (!variable || !domain) return null
  const [lo, hi] = domain
  const unit = variable.unit ?? ''
  return (
    <div className={floating ? 'legend-float' : 'field'}>
      {floating ? <div className="legend-title">{variable.label}</div> : null}
      <div className="legend-bar" style={{ background: legendGradient(variable.colormap) }} />
      <div className="legend-labels">
        <span>{fmt(lo, unit)}</span>
        {variable.diverging ? <span>0</span> : null}
        <span>{fmt(hi, unit)}{variable.clampMax != null && hi >= variable.clampMax ? '+' : ''}</span>
      </div>
    </div>
  )
}
