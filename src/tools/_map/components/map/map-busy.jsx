/**
 * components/map/map-busy.jsx
 *
 * Shown while MapLibre re-evaluates every feature's paint expression:
 * toggling compare, switching an improved crop mask, changing source or
 * commodity. That work is synchronous main-thread time we cannot remove,
 * so the map should at least say it is working.
 *
 * The mark paints itself in the lab's Spectral palette and the earliest
 * strokes begin evaporating before the last ones land, the way water
 * drawn on hot pavement disappears from where you started. It never
 * completes, which is the point: it signals work in progress without
 * implying a fraction of it we cannot measure.
 */
import { useEffect, useState } from 'react'

// The actual lab mark, converted from LabLogo_spectral.ai (the Illustrator
// master) rather than redrawn: the two blue quarter arcs, the green
// enclosing arc, the cream bar, and the three orange nodes, in the
// artwork's own colours. Rendered as strokes so each can be painted on.
const MARK = [
  { c: '#A9DE94', k: 'arc', d: 'M 175.84375 260.746094 C 126.117188 260.746094 85.800781 220.433594 85.800781 170.707031 C 85.800781 120.976562 126.117188 80.664062 175.84375 80.664062' },
  { c: '#348AC8', k: 'arc', d: 'M 175.84375 170.707031 L 175.84375 80.664062 C 225.570312 80.664062 265.886719 120.976562 265.886719 170.707031' },
  { c: '#348AC8', k: 'arc', d: 'M 175.84375 170.707031 L 175.84375 260.746094 C 225.570312 260.746094 265.886719 220.433594 265.886719 170.707031' },
  { c: '#FCFDEA', k: 'bar', d: 'M 171.375 240.875 L 247.097656 240.875 L 247.097656 214.941406 L 171.375 214.941406 Z M 171.375 240.875' },
  { c: '#F89A40', k: 'dot', d: 'M 102.722656 60.929688 C 102.722656 70.574219 94.902344 78.394531 85.257812 78.394531 C 75.613281 78.394531 67.796875 70.574219 67.796875 60.929688 C 67.796875 51.285156 75.613281 43.464844 85.257812 43.464844 C 94.902344 43.464844 102.722656 51.285156 102.722656 60.929688' },
  { c: '#F89A40', k: 'dot', d: 'M 305.78125 95.371094 C 305.78125 107.429688 296.007812 117.199219 283.953125 117.199219 C 271.898438 117.199219 262.125 107.429688 262.125 95.371094 C 262.125 83.316406 271.898438 73.542969 283.953125 73.542969 C 296.007812 73.542969 305.78125 83.316406 305.78125 95.371094' },
  { c: '#F89A40', k: 'dot', d: 'M 287.101562 280.484375 C 287.101562 290.128906 279.28125 297.949219 269.636719 297.949219 C 259.992188 297.949219 252.171875 290.128906 252.171875 280.484375 C 252.171875 270.839844 259.992188 263.019531 269.636719 263.019531 C 279.28125 263.019531 287.101562 270.839844 287.101562 280.484375' },
]

// Nodes are closed circles and the bar is a closed rectangle, so they read
// better fading in as a whole than being traced.
const CYCLE = 2200          // ms for one full paint-and-evaporate pass
const STAGGER = 150         // ms between strokes starting

export function MapBusy({ busy, isDark = true, label = 'Redrawing' }) {
  // Render on the SAME commit that sets busy. Gating visibility on state
  // set inside an effect meant the veil needed a second render pass, and
  // that pass sat behind the very main-thread block it was meant to cover,
  // so it never appeared at all. `linger` only extends the fade-out.
  const [linger, setLinger] = useState(false)
  useEffect(() => {
    if (busy) { setLinger(true); return undefined }
    const t = setTimeout(() => setLinger(false), 220)
    return () => clearTimeout(t)
  }, [busy])

  if (!busy && !linger) return null
  const ink = isDark ? '#F8F8E8' : '#181838'
  const veil = isDark ? 'rgba(12,12,28,0.30)' : 'rgba(248,248,232,0.38)'

  return (
    <div
      aria-live="polite"
      aria-busy={busy ? 'true' : 'false'}
      style={{
        position: 'absolute', inset: 0, zIndex: 9,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 14, pointerEvents: 'none', background: veil,
        opacity: busy ? 1 : 0, transition: 'opacity 200ms ease',
      }}
    >
      <svg viewBox="0 0 343.482 343.905" width="104" height="104" aria-hidden="true">
        {MARK.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill={s.k === 'arc' ? 'none' : s.c}
            stroke={s.c}
            strokeWidth={s.k === 'arc' ? 15 : 0}
            strokeLinecap="round"
            style={{
              // Arcs are traced; the bar and nodes simply wash in and out.
              ...(s.k === 'arc'
                ? { strokeDasharray: 620, animation: `ssl-paint ${CYCLE}ms linear ${i * STAGGER}ms infinite` }
                : { animation: `ssl-wash ${CYCLE}ms linear ${i * STAGGER}ms infinite` }),
            }}
          />
        ))}
      </svg>
      <span
        style={{
          font: '10px "JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: ink, opacity: 0.65,
        }}
      >
        {label}
      </span>
      <style>{`
        @keyframes ssl-paint {
          /* wet: the stroke lays down */
          0%   { stroke-dashoffset: 620; opacity: 0; }
          7%   { opacity: 1; }
          40%  { stroke-dashoffset: 0;  opacity: 1; }
          /* drying: it retreats from the end it was drawn from */
          72%  { stroke-dashoffset: -620; opacity: 0.4; }
          86%  { opacity: 0; }
          100% { stroke-dashoffset: -620; opacity: 0; }
        }
        @keyframes ssl-wash {
          0%   { opacity: 0; }
          18%  { opacity: 1; }
          58%  { opacity: 1; }
          86%  { opacity: 0; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          svg path { animation-duration: 0ms !important;
                     stroke-dashoffset: 0 !important; opacity: 0.85 !important; }
        }
      `}</style>
    </div>
  )
}
