/**
 * components/map/map-busy.jsx
 *
 * Shown while the map redraws: toggling compare, switching an improved crop
 * mask, changing source, commodity or year.
 *
 * The mark is the lab logo drawn the way you would draw it by hand — the
 * crosshair first, in two perpendicular strokes, the horizontal one broken by
 * the small gap the logo has on its left arm; then the globe in a single
 * clockwise stroke; then the orbit last, arriving one element at a time
 * clockwise from six o'clock while the crosshair and globe are already
 * drying off. Nothing ever
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
//     Two subpaths in one element. SVG restarts the dash pattern at each
//     subpath, so the arms trace in parallel from their own left ends rather
//     than as one sweep hopping the gap — the short arm lands first, and the
//     gap is simply never drawn through.
//     The artwork's gap scales to about 8 units here, but at this size an
//     11-unit stroke all but closes it, so it is opened to 20 to survive.
const HORIZ = `M 76 ${C} L 152 ${C} M 172 ${C} L 324 ${C}`

// 3 — the globe, one clockwise stroke from six o'clock: down at the bottom,
//     round past nine, over the top and back. Sweep flag 1 is clockwise on
//     screen, so from the bottom it leaves to the left.
const GLOBE = `M ${C} ${C + R} A ${R} ${R} 0 0 1 ${C} ${C - R} ` +
              `A ${R} ${R} 0 0 1 ${C} ${C + R}`

// 4 — the orbit: streaks and satellites, in clock order starting at six and
//     going clockwise, so they arrive following the stroke that just went
//     round the globe.
//
//     The artwork pairs a trailing arc with the upper-left and lower-right
//     satellites, leaves the upper-right one bare, and puts a fourth arc on
//     its own at lower left. Keeping that as four separate elements rather
//     than forcing three streak-plus-satellite pairs is both truer to the
//     logo and what makes the sweep legible: four arrivals read as a
//     sequence where three barely did.
//     Every streak is written to be traced in the clockwise direction —
//     endpoints swapped and the sweep flag flipped relative to the artwork's
//     own path data. Drawn the other way they each ran counter to the sweep,
//     which is what made the sequence read as arbitrary even though the
//     elements were in the right order.
const ORBIT = [
  { streak: 'M 132.3 319 A 137 137 0 0 1 74.6 256.6' },                                // 6:30 -> 7:45
  { streak: 'M 55 196.5 A 138 138 0 0 1 104.6 108.8',
    cx: 113.8, cy: 92.6,  r: 23.0, k: 9.7 },                                           // 9:05 -> 10:30
  { cx: 303.3, cy: 128.4, r: 25.4, k: 13.2 },                                          // 1:30
  { streak: 'M 326.3 255.4 A 136 136 0 0 0 298.7 291.2',
    cx: 290.6, cy: 302.8, r: 22.0, k: 9.2 },                                           // 3:40 -> 4:20
]

// Each orbit element gets its own keyframes rather than a shared set offset
// by animation-delay. A delay shifts the whole timeline, so the last element
// to arrive would still be fading out after the next cycle's crosshair had
// started drawing. Explicit percentages keep every arrival inside one pass.
const ORBIT_IN = 58      // first element starts arriving, % of cycle
const ORBIT_STEP = 6     // spacing between arrivals, % of cycle
const ORBIT_DRAW = 7     // how long a streak takes to trace, % of cycle
const ORBIT_OUT = 92     // all of them leave together

// Logo colours: navy structure (cream on a dark map so it stays visible),
// the globe's green-to-teal, and the satellites' orange core.
const GREEN = '#48A848'
const TEAL  = '#78C8D8'
const AMBER = '#E87828'

const CYCLE = 3120       // ms for one full draw-and-evaporate pass

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
        {/* 4 — the orbit, arriving clockwise from six o'clock */}
        {ORBIT.map((s, i) => (
          <g key={i} style={{ animation: `ssl-orbit-${i} ${CYCLE}ms linear infinite` }}>
            {s.streak && (
              <path
                d={s.streak} fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round"
                style={{ strokeDasharray: 200, animation: `ssl-trail-${i} ${CYCLE}ms linear infinite` }}
              />
            )}
            {s.cx != null && (
              /* The satellite lands where its streak ends, so each element
                 reads as one motion rather than a dot and a line arriving
                 together. Elements with no streak simply appear. */
              <g style={{ animation: `ssl-sat-${i} ${CYCLE}ms linear infinite` }}>
                {/* The logo rings each orange core in navy. On a dark veil a
                    filled disc would invert that; a ring keeps the reading. */}
                <circle cx={s.cx} cy={s.cy} r={s.r - 4} fill="none" stroke={ink} strokeWidth={7} />
                <circle cx={s.cx} cy={s.cy} r={s.k} fill={AMBER} />
              </g>
            )}
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
          17%  { stroke-dashoffset: 300; opacity: 0; }
          19%  { opacity: 1; }
          34%  { stroke-dashoffset: 0; opacity: 1; }
          62%  { stroke-dashoffset: 0; opacity: 1; }
          84%  { stroke-dashoffset: -300; opacity: 0.25; }
          91%  { opacity: 0; }
          100% { stroke-dashoffset: -300; opacity: 0; }
        }
        @keyframes ssl-g {
          0%   { stroke-dashoffset: 520; opacity: 0; }
          36%  { stroke-dashoffset: 520; opacity: 0; }
          38%  { opacity: 1; }
          58%  { stroke-dashoffset: 0; opacity: 1; }
          74%  { stroke-dashoffset: 0; opacity: 1; }
          90%  { stroke-dashoffset: -520; opacity: 0.25; }
          96%  { opacity: 0; }
          100% { stroke-dashoffset: -520; opacity: 0; }
        }
        /* The orbit arrives last and outlasts the rest, so the mark empties
           out from the centre while the satellites are still on station.
           One keyframe set per element, stepped ${ORBIT_STEP}% apart. */
        ${ORBIT.map((_, i) => {
          const a = ORBIT_IN + i * ORBIT_STEP
          return `
        @keyframes ssl-orbit-${i} {
          0%   { opacity: 0; }
          ${a - 1}%  { opacity: 0; }
          ${a}%   { opacity: 1; }
          ${ORBIT_OUT}%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ssl-trail-${i} {
          0%   { stroke-dashoffset: 200; }
          ${a}%   { stroke-dashoffset: 200; }
          ${a + ORBIT_DRAW}%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes ssl-sat-${i} {
          0%   { opacity: 0; }
          ${a + ORBIT_DRAW - 2}%  { opacity: 0; }
          ${a + ORBIT_DRAW + 1}%  { opacity: 1; }
          100% { opacity: 1; }
        }`
        }).join('')}
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
