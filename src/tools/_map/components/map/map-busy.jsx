/**
 * components/map/map-busy.jsx
 *
 * Shown while the map redraws: toggling compare, switching an improved crop
 * mask, changing source, commodity or year.
 *
 * The mark is the lab logo drawn the way you would draw it by hand — the
 * crosshair first, in two perpendicular strokes, the horizontal one broken by
 * the small gap the logo has on its left arm; then the globe in a single
 * clockwise stroke; then the satellites last, arriving on their orbit streaks
 * while the crosshair and globe are already drying off. Nothing ever
 * completes, which is the point: it signals work in progress without implying
 * a fraction of it we cannot measure.
 *
 * Geometry is hand-built from LabLogo_print.ai rather than converted, because
 * a converted file gives filled outlines — every shape a closed contour to be
 * traced around, which reads as a wobble, not a brushstroke. These are open
 * paths in the stroke order above, proportioned off the artwork: the three
 * satellites sit on a common orbit at r = 137 about the globe's centre, which
 * is what the original draws them on.
 */
import { useEffect, useState } from 'react'

const C = 200            // centre of the 400 x 400 viewBox
const R = 82             // globe radius

// 1 — vertical crosshair, top to bottom. The arms clear the globe by about
//      half a radius; further out and the mark reads as a gunsight rather
//      than a logo.
const VERT = `M ${C} 84 L ${C} 330`

// 2 — horizontal crosshair, left to right, with the gap on the left arm.
//     Two subpaths in one element: a dash sweep crosses the gap and picks
//     up again on the far side, exactly like lifting the pen.
//     The artwork's gap scales to about 8 units here, but at this size an
//     11-unit stroke all but closes it, so it is opened to 20 to survive.
const HORIZ = `M 76 ${C} L 152 ${C} M 172 ${C} L 324 ${C}`

// 3 — the globe, one clockwise stroke from six o'clock: down at the bottom,
//     round past nine, over the top and back. Sweep flag 1 is clockwise on
//     screen, so from the bottom it leaves to the left.
const GLOBE = `M ${C} ${C + R} A ${R} ${R} 0 0 1 ${C} ${C - R} ` +
              `A ${R} ${R} 0 0 1 ${C} ${C + R}`

// 4 — satellites: an orbit streak, then the body, then the lit core.
//     Ordered the way the globe is drawn — clockwise from six o'clock — so
//     they arrive following the stroke that just went round.
const SATS = [
  { streak: 'M 104.6 108.8 A 138 138 0 0 0 55 196.5',    cx: 113.8, cy: 92.6,  r: 23.0, k: 9.7 },
  { streak: 'M 74.6 256.6 A 137 137 0 0 0 132.3 319',    cx: 303.3, cy: 128.4, r: 25.4, k: 13.2 },
  { streak: 'M 298.7 291.2 A 136 136 0 0 1 326.3 255.4', cx: 290.6, cy: 302.8, r: 22.0, k: 9.2 },
]

// Logo colours: navy structure (cream on a dark map so it stays visible),
// the globe's green-to-teal, and the satellites' orange core.
const GREEN = '#48A848'
const TEAL  = '#78C8D8'
const AMBER = '#E87828'

const CYCLE = 2600       // ms for one full draw-and-evaporate pass

// Each element's slice of the cycle, as percentages. Strokes overlap: the
// crosshair is already fading before the satellites land.
const SW = 11            // crosshair / globe stroke width

export function MapBusy({ busy, isDark = true, label = 'Redrawing' }) {
  // Render on the SAME commit that sets busy. Gating visibility on state set
  // inside an effect meant the veil needed a second render pass, and that
  // pass sat behind the very work it was meant to cover. `linger` only
  // extends the fade-out.
  const [linger, setLinger] = useState(false)
  useEffect(() => {
    if (busy) { setLinger(true); return undefined }
    const t = setTimeout(() => setLinger(false), 240)
    return () => clearTimeout(t)
  }, [busy])

  if (!busy && !linger) return null
  const ink = isDark ? '#F8F8E8' : '#181838'
  const veil = isDark ? 'rgba(12,12,28,0.34)' : 'rgba(248,248,232,0.42)'

  return (
    <div
      aria-live="polite"
      aria-busy={busy ? 'true' : 'false'}
      style={{
        position: 'absolute', inset: 0, zIndex: 9,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, pointerEvents: 'none', background: veil,
        opacity: busy ? 1 : 0, transition: 'opacity 200ms ease',
      }}
    >
      <svg viewBox="0 0 400 400" width="116" height="116" aria-hidden="true">
        <defs>
          {/* Left half green, right half blue, as the globe is drawn. */}
          <linearGradient id="ssl-globe" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={GREEN} />
            <stop offset="52%" stopColor={GREEN} />
            <stop offset="53%" stopColor={TEAL} />
            <stop offset="100%" stopColor={TEAL} />
          </linearGradient>
        </defs>

        {/* 1 — vertical crosshair */}
        <path
          d={VERT} fill="none" stroke={ink} strokeWidth={SW} strokeLinecap="butt"
          style={{ strokeDasharray: 300, animation: `ssl-v ${CYCLE}ms linear infinite` }}
        />
        {/* 2 — horizontal crosshair, broken on the left arm */}
        <path
          d={HORIZ} fill="none" stroke={ink} strokeWidth={SW} strokeLinecap="butt"
          style={{ strokeDasharray: 300, animation: `ssl-h ${CYCLE}ms linear infinite` }}
        />
        {/* 3 — the globe, clockwise */}
        <path
          d={GLOBE} fill="none" stroke="url(#ssl-globe)" strokeWidth={SW} strokeLinecap="round"
          style={{ strokeDasharray: 520, animation: `ssl-g ${CYCLE}ms linear infinite` }}
        />
        {/* 4 — satellites on their streaks */}
        {SATS.map((s, i) => (
          <g key={i} style={{ animation: `ssl-s ${CYCLE}ms linear ${i * 110}ms infinite` }}>
            <path
              d={s.streak} fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round"
              style={{ strokeDasharray: 200, animation: `ssl-trail ${CYCLE}ms linear ${i * 110}ms infinite` }}
            />
            {/* The logo rings each orange core in navy. On a dark veil a
                filled disc would invert that; a ring keeps the reading. */}
            <circle cx={s.cx} cy={s.cy} r={s.r - 4} fill="none" stroke={ink} strokeWidth={7} />
            <circle cx={s.cx} cy={s.cy} r={s.k} fill={AMBER} />
          </g>
        ))}
      </svg>

      <span
        style={{
          font: '10px "JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: ink, opacity: 0.6,
        }}
      >
        {label}
      </span>

      <style>{`
        /* Each stroke lays down wet, then retreats from the end it started
           at, the way water drawn on hot pavement goes from where you began. */
        @keyframes ssl-v {
          0%   { stroke-dashoffset: 300; opacity: 0; }
          3%   { opacity: 1; }
          16%  { stroke-dashoffset: 0; opacity: 1; }
          58%  { stroke-dashoffset: 0; opacity: 1; }
          80%  { stroke-dashoffset: -300; opacity: 0.25; }
          88%  { opacity: 0; }
          100% { stroke-dashoffset: -300; opacity: 0; }
        }
        @keyframes ssl-h {
          0%   { stroke-dashoffset: 300; opacity: 0; }
          14%  { stroke-dashoffset: 300; opacity: 0; }
          17%  { opacity: 1; }
          32%  { stroke-dashoffset: 0; opacity: 1; }
          62%  { stroke-dashoffset: 0; opacity: 1; }
          84%  { stroke-dashoffset: -300; opacity: 0.25; }
          91%  { opacity: 0; }
          100% { stroke-dashoffset: -300; opacity: 0; }
        }
        @keyframes ssl-g {
          0%   { stroke-dashoffset: 520; opacity: 0; }
          30%  { stroke-dashoffset: 520; opacity: 0; }
          33%  { opacity: 1; }
          54%  { stroke-dashoffset: 0; opacity: 1; }
          70%  { stroke-dashoffset: 0; opacity: 1; }
          90%  { stroke-dashoffset: -520; opacity: 0.25; }
          96%  { opacity: 0; }
          100% { stroke-dashoffset: -520; opacity: 0; }
        }
        @keyframes ssl-trail {
          0%   { stroke-dashoffset: 200; }
          52%  { stroke-dashoffset: 200; }
          66%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 0; }
        }
        /* Satellites arrive last and outlast the rest, so the mark empties
           out from the centre while they are still on their orbits. */
        @keyframes ssl-s {
          0%   { opacity: 0; }
          54%  { opacity: 0; }
          64%  { opacity: 1; }
          92%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          svg path, svg g {
            animation-duration: 0ms !important;
            stroke-dashoffset: 0 !important;
            opacity: 0.85 !important;
          }
        }
      `}</style>
    </div>
  )
}
