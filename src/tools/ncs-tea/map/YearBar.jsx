/**
 * map/YearBar.jsx — the always-visible year control at the foot of the map,
 * as in the food-emissions explorer. The year only changes views marked
 * "in year"; for the others the bar stays and says so.
 */
import { useEffect, useRef } from 'react'
import { Play, Pause } from 'lucide-react'

export function YearBar({ startYear, years, year, onYear, playing, onTogglePlay, active }) {
  const tRef = useRef(null)
  useEffect(() => {
    if (!playing) return
    tRef.current = setInterval(() => onYear((y) => (y + 1 >= years ? 0 : y + 1)), 450)
    return () => clearInterval(tRef.current)
  }, [playing, years, onYear])
  return (
    <div className="yearbar" style={{ flexWrap: 'wrap', rowGap: 4 }}>
      <button type="button" className="play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Play through the years'} aria-pressed={playing}>
        {playing ? <Pause size={18} strokeWidth={1.5} /> : <Play size={18} strokeWidth={1.5} />}
      </button>
      <input type="range" className="range" style={{ flex: 1, minWidth: 90 }} min={0} max={years - 1} step={1} value={year}
        onChange={(e) => { if (playing) onTogglePlay(); onYear(Number(e.target.value)) }} aria-label="Year" />
      <span className="year">{startYear + year}</span>
      {!active ? <p className="note">The year changes only the “in year” and “through year” views; this view sums the whole horizon.</p> : null}
    </div>
  )
}
