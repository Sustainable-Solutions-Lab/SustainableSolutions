/** Small form controls in the lab's publications-filter style. */
import { useState } from 'react'
import { ChevronRight, X } from 'lucide-react'

export function Section({ title, aside = null, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const side = aside ?? (count != null ? count : null)
  return (
    <div className="section">
      <button type="button" className="section-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronRight size={14} strokeWidth={1.75} className="chev" />
        <span className="title">{title}</span>
        {side != null ? <span className="aside">{side}</span> : null}
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </div>
  )
}

export function Field({ label, hint, children, inline = false }) {
  if (inline) {
    return (
      <div className="field row" style={{ alignItems: 'center' }}>
        <p className="label" style={{ margin: 0, flex: '0 0 44%' }}>{label}</p>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="field">
      {label ? <p className="label">{label}</p> : null}
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (
        <option key={o.id} value={o.id} disabled={o.disabled} title={o.hint}>{o.label}</option>
      ))}
    </select>
  )
}

/** Numeric input that keeps the typed text until it parses. */
export function Num({ value, onChange, unit, step = 'any', min, max, width, placeholder }) {
  const [text, setText] = useState(null)
  const shown = text ?? (value == null || Number.isNaN(value) ? '' : String(value))
  return (
    <div className="row" style={{ alignItems: 'center', gap: 6 }}>
      <input
        type="number" className="input" value={shown} step={step} min={min} max={max} placeholder={placeholder}
        style={width ? { flex: `0 0 ${width}px` } : undefined}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        onBlur={() => setText(null)}
      />
      {unit ? <span className="unit narrow" style={{ paddingBottom: 0 }}>{unit}</span> : null}
    </div>
  )
}

export function Txt({ value, onChange, placeholder }) {
  return <input type="text" className="input" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Check({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

export function Range({ value, onChange, min, max, step, format = (v) => v, minLabel, maxLabel }) {
  return (
    <div>
      <div className="range-labels">
        <span>{minLabel ?? format(min)}</span>
        <span className="cur">{format(value)}</span>
        <span>{maxLabel ?? format(max)}</span>
      </div>
      <input type="range" className="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export function RemoveButton({ onClick, title = 'Remove' }) {
  return (
    <button type="button" className="btn icon" onClick={onClick} title={title} aria-label={title}>
      <X size={14} strokeWidth={1.5} />
    </button>
  )
}
