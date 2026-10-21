/**
 * components/sidebar/rangeland-scope-control.jsx
 *
 * Which grazing land counts toward rangeland soil carbon under the GHG
 * Protocol LSRS, chosen by the reader (lib/rangeland-scope.js). Shown when
 * the rangeland term is on the map: the rangeland source itself, all
 * sources, or category 2, for all commodities.
 */

import { Actions } from '../../contracts/events.js'
import { rangelandScopeState } from '../../lib/rangeland-scope.js'

const MODES = [
  ['all', 'All grazing land'],
  ['cult', 'Cultivated grassland only'],
  ['gi', 'Intensity screen'],
]

const EXPLAIN = {
  all: 'The Standard: any land used for livestock is productive land, so every grazed cell counts.',
  cult: 'The Guidance: natural grassland is “not covered in v1”, so only sown or managed (cultivated) grassland counts.',
  gi: 'Cultivated grassland counts, and natural grassland and shrubland count where grazing intensity (share of the year’s above-ground plant growth eaten) reaches the threshold: one way to apply “as long as stocking rates are not intensively managed”. The text sets no threshold.',
}

export function RangelandScopeControl({ config, state, dispatch }) {
  const st = rangelandScopeState(config, state.activeDimensions)
  if (!st) return null
  const { rs, mode, threshold } = st
  const src = state.activeDimensions?.source
  const crop = state.activeDimensions?.crop ?? 'all'
  if (crop !== 'all' || !rs.showForSources.includes(src)) return null
  const regional = state.mapView === 'regional'
  const tot = rs.totals
  const inScope = !tot ? null
    : mode === 'all' ? tot.all : mode === 'cult' ? tot.cult : tot.gi?.[String(threshold)]
  const set = (dimensionId, value) => dispatch({ type: Actions.SET_DIMENSION, dimensionId, value })
  return (
    <div className="mb-4">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-3 leading-none" style={{ margin: '0 0 3px' }}>
        Rangeland scope (LSRS)
      </p>
      <select
        value={mode}
        onChange={(e) => set(rs.modeDimensionId, e.target.value)}
        disabled={regional}
        className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink disabled:text-ink-4 disabled:cursor-not-allowed"
        style={{ borderRadius: 'var(--radius-sm)' }}
        aria-label="Which grazing land counts toward rangeland soil carbon"
      >
        {MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {mode === 'gi' && !regional && (
        <label className="block font-sans text-[11px] text-ink-2" style={{ marginTop: 6 }}>
          Natural grassland counts where livestock eat ≥ <strong className="tabular-nums">{threshold}%</strong> of plant growth
          <input
            type="range" min={rs.thresholdMin} max={rs.thresholdMax} step={rs.thresholdStep}
            value={threshold}
            onChange={(e) => set(rs.thresholdDimensionId, e.target.value)}
            className="w-full accent-cardinal"
            aria-label="Grazing-intensity threshold, percent of above-ground plant growth eaten by livestock"
          />
          <span className="flex justify-between text-ink-3" style={{ fontSize: 10 }}>
            <span>{rs.thresholdMin}% (all grazed)</span><span>{rs.thresholdMax}% (heaviest only)</span>
          </span>
        </label>
      )}
      <p className="font-sans text-ink-3" style={{ fontSize: 10, lineHeight: 1.4, margin: '4px 0 0' }}>
        {regional
          ? 'Applies to the gridded view; regional units count all grazing land.'
          : EXPLAIN[mode]}
        {!regional && inScope != null && tot?.all > 0 && (
          <span className="block text-ink-2" style={{ marginTop: 3 }}>
            In scope, 2020 rangeland soil-carbon losses: <strong className="tabular-nums">{Math.round(inScope)}</strong> of{' '}
            <span className="tabular-nums">{Math.round(tot.all)}</span> Mt CO₂e/yr ({Math.round((100 * inScope) / tot.all)}%).
            {' '}National trend charts and regional units still count all grazing land.
          </span>
        )}
      </p>
    </div>
  )
}
