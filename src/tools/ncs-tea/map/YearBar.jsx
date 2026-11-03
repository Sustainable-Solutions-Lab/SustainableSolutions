/**
 * map/YearBar.jsx — the always-visible year control at the foot of the map,
 * as in the food-emissions explorer: play, slider, the year in bold. The
 * first and last years sit at the ends of the slider. The year only
 * changes views marked "in year"; for the others the bar stays and the
 * label reads "cumulative <start>–<end>".
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
    <div className="yearbar" title={active ? undefined : 'This view sums the whole horizon; the year changes the “in year” and “through year” views.'}>
      <button type="button" className="play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Play through the years'} aria-pressed={playing}>
        {playing ? <Pause size={18} strokeWidth={1.5} /> : <Play size={18} strokeWidth={1.5} />}
      </button>
      <div className="yearbar-track">
        <div className="yearbar-ends"><span>{startYear}</span><span>{startYear + years - 1}</span></div>
        <input type="range" className="range" min={0} max={years - 1} step={1} value={year}
          onChange={(e) => { if (playing) onTogglePlay(); onYear(Number(e.target.value)) }} aria-label="Year" />
      </div>
      {active
        ? <span className="year">{startYear + year}</span>
        : <span className="year">cumulative {startYear}–{startYear + years - 1}</span>}
    </div>
  )
}
