/**
 * ui/Shell.jsx — the lab's tool chrome: desktop left rail of controls beside
 * the map; below 768px a compact header with the controls in a slide-down
 * drawer over a tap-to-dismiss scrim (after the site's ToolShell).
 */
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function Shell({ eyebrow, title, summary, rail, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ncs shell">
      <header className="mobile-head">
        <div className="grow">
          <p className="eyebrow">{eyebrow}</p>
          <p className="title">{title}</p>
        </div>
        <button type="button" className="btn link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide controls' : 'Show controls'} {open ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
        </button>
      </header>
      <div className="shell-row">
        <aside className="rail">
          <div className="rail-head">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="title">{title}</h1>
            {summary ? <p className="summary">{summary}</p> : null}
          </div>
          <div className="rail-body">{rail}</div>
        </aside>
        <main className="main">
          {children}
          {open ? <div className="scrim" onClick={() => setOpen(false)} /> : null}
          {open ? <div className="drawer">{rail}</div> : null}
        </main>
      </div>
    </div>
  )
}
