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

// The lab mark (public/logos/lab/lab-logo.svg), ordered so the drawing
// reads outside-in: the enclosing arc, the two inner quarters, then the
// small gestures and the outer ticks.
const STROKES = [
  { d: 'M32.27,170.53c0-36.8,14.04-73.6,42.12-101.68', w: 7 },
  { d: 'M102.88,294.33c-25.86-15.32-46.51-38.52-58.64-66.29', w: 7 },
  { d: 'M309.41,224.43c-6.06,14.98-14.57,28.7-25.03,40.67', w: 7 },
  { d: 'M176.11,260.93c-49.8,0-90.18-40.37-90.18-90.18s40.37-90.18,90.18-90.18', w: 11 },
  { d: 'M176.11,170.75v-90.18c49.8,0,90.18,40.37,90.18,90.18', w: 11 },
  { d: 'M176.11,170.75v90.18c49.8,0,90.18-40.37,90.18-90.18', w: 11 },
  { d: 'M176.07,94.13c11.66-.85,33.12,5.93,38.49,10.16', w: 6 },
  { d: 'M180.48,234.6c6.78-26.73,45.74-4.89,65.13-17.88', w: 6 },
]

// ColorBrewer Spectral, the lab's data palette, warm through cool so the
// stroke order carries the ramp.
const SPECTRAL = ['#9E0142', '#D53E4F', '#F46D43', '#FDAE61',
                  '#66C2A5', '#3288BD', '#5E4FA2', '#78C8D8']

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
      <svg viewBox="0 0 343.48 343.91" width="96" height="96" aria-hidden="true">
        {STROKES.map((s, i) => (
          <path
            key={s.d + i}
            d={s.d}
            fill="none"
            stroke={SPECTRAL[i % SPECTRAL.length]}
            strokeWidth={s.w}
            strokeLinecap="round"
            style={{
              // 360 comfortably exceeds the longest arc, so one offset
              // sweep covers any stroke without measuring each path.
              strokeDasharray: 360,
              animation: `ssl-paint ${CYCLE}ms linear ${i * STAGGER}ms infinite`,
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
          0%   { stroke-dashoffset: 360; opacity: 0; }
          8%   { opacity: 0.95; }
          38%  { stroke-dashoffset: 0;  opacity: 0.95; }
          /* drying: it thins from the end it was drawn from */
          70%  { stroke-dashoffset: -360; opacity: 0.35; }
          85%  { opacity: 0; }
          100% { stroke-dashoffset: -360; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          svg path { animation-duration: 0ms !important;
                     stroke-dashoffset: 0 !important; opacity: 0.85 !important; }
        }
      `}</style>
    </div>
  )
}
