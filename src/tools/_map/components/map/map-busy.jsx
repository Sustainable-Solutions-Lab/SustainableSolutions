/**
 * components/map/map-busy.jsx
 *
 * The map is unresponsive for a moment whenever a change forces MapLibre
 * to re-evaluate every feature's paint expression: toggling compare,
 * switching an improved crop mask, changing source or commodity. That
 * work happens on the main thread and cannot be made instant, so the
 * honest fix is to say so immediately rather than let the map sit there
 * looking broken.
 *
 * The mark draws itself, holds, then undraws, which reads as progress
 * without implying a percentage we cannot measure.
 */
import { useEffect, useState } from 'react'

// The lab mark: two quarter arcs and the enclosing circle, from
// public/logos/lab/lab-logo.svg. Ordered so the drawing reads
// outside-in.
const STROKES = [
  'M176.11,260.93c-49.8,0-90.18-40.37-90.18-90.18s40.37-90.18,90.18-90.18',
  'M176.11,170.75v-90.18c49.8,0,90.18,40.37,90.18,90.18',
  'M176.11,170.75v90.18c49.8,0,90.18-40.37,90.18-90.18',
]

export function MapBusy({ busy, isDark = true, label = 'Redrawing' }) {
  // Keep the overlay up for a beat after work finishes: flashing it for
  // 80 ms is worse than not showing it at all.
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (busy) { setShow(true); return undefined }
    const t = setTimeout(() => setShow(false), 260)
    return () => clearTimeout(t)
  }, [busy])

  if (!show) return null
  const ink = isDark ? '#F8F8E8' : '#181838'
  const veil = isDark ? 'rgba(12,12,28,0.42)' : 'rgba(248,248,232,0.5)'

  return (
    <div
      aria-live="polite"
      aria-busy={busy}
      style={{
        position: 'absolute', inset: 0, zIndex: 9,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12, pointerEvents: 'none',
        background: veil,
        backdropFilter: 'blur(0.5px)',
        opacity: busy ? 1 : 0,
        transition: 'opacity 240ms ease',
      }}
    >
      <svg viewBox="0 0 343.48 343.91" width="76" height="76" aria-hidden="true">
        {STROKES.map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={ink}
            strokeWidth={10}
            strokeLinecap="round"
            style={{
              // Each arc is roughly 300 user units long; a dash pattern
              // that size means one offset cycle covers the whole stroke.
              strokeDasharray: 300,
              animation: `ssl-draw 1600ms cubic-bezier(.65,.05,.36,1) ${i * 180}ms infinite`,
            }}
          />
        ))}
      </svg>
      <span
        style={{
          font: '10px "JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: ink, opacity: 0.7,
        }}
      >
        {label}
      </span>
      <style>{`
        @keyframes ssl-draw {
          0%   { stroke-dashoffset: 300; }
          45%  { stroke-dashoffset: 0; }
          55%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -300; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-busy] path { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>
    </div>
  )
}
