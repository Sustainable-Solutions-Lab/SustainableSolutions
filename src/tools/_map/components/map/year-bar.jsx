/**
 * components/map/year-bar.jsx
 *
 * Always-visible year control pinned to the bottom of the map, for projects
 * that declare config.yearControl. Replaces the old sidebar year slider and
 * the separate change-over-time / difference layers:
 *
 *   [play] [——————slider——————] 2020   [ ] compare
 *
 * Compare mode swaps the play button for a second slider, and the map shows
 * the difference between the two years (diverging palette). The sliders
 * drive the same dimension state (SET_DIMENSION) the sidebar controls use,
 * and play/pause drives the tool-level animation loop via SET_ANIMATING.
 */

import { Play, Pause } from 'lucide-react'
import { Actions } from '../../contracts/events.js'

export function YearBar({ config, state, dispatch, isDark , disableCompare = false }) {
  const yc = config.yearControl
  if (!yc) return null
  const yearDim = config.dimensions.find((d) => d.id === yc.dimensionId)
  const yearBDim = config.dimensions.find((d) => d.id === yc.yearBDimensionId)
  if (!yearDim) return null

  const ids = yearDim.options.map((o) => o.id)
  const year = String(state.activeDimensions[yearDim.id] ?? yearDim.defaultValue)
  const yearB = yearBDim
    ? String(state.activeDimensions[yearBDim.id] ?? yearBDim.defaultValue)
    : null
  // Time-constant variables (e.g. the soil-carbon mean rate) have nothing
  // to compare between years: hide the toggle and force the mode off.
  const compareOn = !disableCompare && (yc.compareDimensionId
    ? (state.activeDimensions[yc.compareDimensionId] ?? 'off') === 'on'
    : false)
  const playing = state.animatingDimension === yearDim.id

  const ink = isDark ? '#F8F8E8' : '#181838'
  const inkFaint = isDark ? 'rgba(248,248,232,0.55)' : 'rgba(24,24,56,0.55)'
  const paper = isDark ? 'rgba(12,12,28,0.92)' : 'rgba(248,248,232,0.92)'
  const rule = isDark ? 'rgba(248,248,232,0.18)' : 'rgba(24,24,56,0.18)'

  function setDim(dimId, value) {
    dispatch({ type: Actions.SET_DIMENSION, dimensionId: dimId, value })
  }
  function togglePlay() {
    dispatch({ type: Actions.SET_ANIMATING, dimensionId: playing ? null : yearDim.id })
  }
  function toggleCompare() {
    if (playing) dispatch({ type: Actions.SET_ANIMATING, dimensionId: null })
    const turningOn = !compareOn
    // The sliders cannot reach FROM == TO, but the state can already be
    // there when compare is switched on (the year slider moves freely while
    // it is off). Step FROM back so the mode never opens on the degenerate
    // comparison.
    if (turningOn && yearBDim && yearB === year) {
      const i = Math.max(0, ids.indexOf(year))
      setDim(yearBDim.id, ids[i > 0 ? i - 1 : Math.min(1, ids.length - 1)])
    }
    setDim(yc.compareDimensionId, compareOn ? 'off' : 'on')
  }

  // Comparing a year with itself is a degenerate state — no change anywhere
  // by construction — and it also exposes a MapLibre staleness bug in the
  // dominance overlay, where cells keep colours evaluated under the previous
  // year pair and a map that should be blank is not. Rather than let the
  // sliders reach it, each one stops one step short of the other. This is a
  // guard on the degenerate case, NOT a fix for the staleness; see
  // components/map/level-layer.jsx.
  const lastIdx = ids.length - 1
  const idxOf = (v) => Math.max(0, ids.indexOf(v))
  const boundsFor = (dimId) => {
    if (!compareOn || !yearBDim) return { min: 0, max: lastIdx }
    // FROM must stay below TO, and TO above FROM.
    return dimId === yc.yearBDimensionId
      ? { min: 0, max: Math.max(0, idxOf(year) - 1) }
      : { min: Math.min(lastIdx, idxOf(yearB) + 1), max: lastIdx }
  }

  const sliderRow = (dimId, value, rowLabel) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {rowLabel && (
        <span style={{
          font: '10px "JetBrains Mono", ui-monospace, monospace',
          textTransform: 'uppercase', letterSpacing: '0.08em', color: inkFaint,
          width: 34, flexShrink: 0,
        }}>
          {rowLabel}
        </span>
      )}
      <input
        type="range"
        min={boundsFor(dimId).min}
        max={boundsFor(dimId).max}
        step={1}
        value={Math.max(0, ids.indexOf(value))}
        onChange={(e) => setDim(dimId, ids[Number(e.target.value)])}
        aria-label={rowLabel ? `${rowLabel} year` : 'Year'}
        style={{ flex: 1, minWidth: 90, accentColor: ink, cursor: 'pointer', margin: 0 }}
      />
      <span style={{
        font: '700 13px "JetBrains Mono", ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums', color: ink, flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  )

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        width: 'min(440px, calc(100% - 24px))',
        background: paper,
        border: `1px solid ${rule}`,
        borderRadius: 4,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {!compareOn && (
        <button
          type="button"
          onClick={togglePlay}
          title={playing ? 'Pause' : 'Play through years'}
          aria-pressed={playing}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, padding: 0, flexShrink: 0,
            background: 'transparent', border: 'none', cursor: 'pointer', color: ink,
          }}
        >
          {playing ? <Pause size={18} strokeWidth={1.5} /> : <Play size={18} strokeWidth={1.5} />}
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {compareOn && yearBDim && sliderRow(yearBDim.id, yearB, 'From')}
        {sliderRow(yearDim.id, year, compareOn ? 'To' : null)}
      </div>

      {yc.compareDimensionId && !disableCompare && (
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            font: '10px "JetBrains Mono", ui-monospace, monospace',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: compareOn ? ink : inkFaint, cursor: 'pointer', userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={compareOn}
            onChange={toggleCompare}
            style={{ accentColor: ink, cursor: 'pointer', margin: 0 }}
          />
          Compare
        </label>
      )}
    </div>
  )
}
