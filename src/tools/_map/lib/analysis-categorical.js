/**
 * lib/analysis-categorical.js
 *
 * Dominance analyses (config.paleMap.categorical): color each cell or unit
 * by WHICH source — or which commodity — contributes the most emissions
 * there, rather than by how much.
 *
 * The candidate set follows the sidebar selection, so the question sharpens
 * with it:
 *   Dominant source    · All commodities → which of the 11 sources leads
 *   Dominant source    · Maize          → which source leads maize's total
 *   Dominant commodity · All sources    → which of the 20 commodities leads
 *   Dominant commodity · Fertilizer N2O → which commodity leads fertilizer
 *
 * Dominance is evaluated on the stored reference-year (2020) props: the
 * per-source × per-country year factors would have to be inlined for every
 * candidate in every comparison, which explodes the paint expression. The
 * ranking is stable enough that this is a fair simplification, and the UI
 * says so.
 */

export function categoricalFor(config, state) {
  if (state.analysis !== 'dominance') return null
  return (config.paleMap?.categorical ?? []).find((c) => c.id === state.analysisDriver) ?? null
}

/**
 * Candidate entries [{ prop, label, color }] for the active selection.
 * Returns [] when the selection has no candidates (e.g. dominant source
 * within a livestock commodity uses only the three livestock pathways).
 */
export function categoricalEntries(cat, config, state) {
  const source = state.activeDimensions?.source ?? 'all'
  const crop = state.activeDimensions?.crop ?? 'all'
  const { sources = [], commodities = [] } = config.paleMap?.taxonomy ?? {}
  const commodity = commodities.find((c) => c.id === crop)

  if (cat.kind === 'source') {
    const pool = crop === 'all'
      ? sources
      : sources.filter((s) => (commodity?.sources ?? []).includes(s.id))
    return pool.map((s) => ({
      prop: crop === 'all' ? s.id : `${s.id}_${crop}`,
      label: s.label,
      color: s.color,
      src: s.id,
    }))
  }
  // kind === 'commodity'. `src` drives year scaling in compare mode: exact
  // when one source is selected; otherwise a representative trajectory
  // (enteric for livestock groups, fertilizer for crops — the same proxy
  // the feed variable uses).
  const pool = source === 'all'
    ? commodities
    : commodities.filter((c) => c.sources.includes(source))
  return pool.map((c) => ({
    prop: source === 'all' ? `tot_${c.id}` : `${source}_${c.id}`,
    label: c.label,
    legendLabel: c.legendLabel,
    color: c.color,
    src: source !== 'all' ? source : (c.sources.includes('ent') ? 'ent' : 'fer'),
  }))
}

const num = (prop) => ['coalesce', ['to-number', ['get', prop]], 0]

/** Fill/circle color: the winning entry's color, transparent where absent. */
export function categoricalColorExpr(entries, minValue = 0) {
  if (entries.length === 0) return 'rgba(0,0,0,0)'
  const maxExpr = entries.length === 1
    ? num(entries[0].prop)
    : ['max', ...entries.map((e) => num(e.prop))]
  const expr = ['case']
  for (const e of entries) {
    expr.push(['all', ['>', maxExpr, minValue], ['==', num(e.prop), maxExpr]], e.color)
  }
  expr.push('rgba(0,0,0,0)')
  return expr
}

/**
 * Magnitude-scaled opacity for a dominance map: the winning value drives
 * alpha, so a flat wash of category colors becomes a map where the places
 * that matter read strongest. `stops` are [value, alpha] pairs in the
 * units of the underlying props (kt CO2e).
 */
export function categoricalOpacityExpr(entries, stops) {
  if (entries.length === 0) return 0
  const maxExpr = entries.length === 1
    ? num(entries[0].prop)
    : ['max', ...entries.map((e) => num(e.prop))]
  const expr = ['interpolate', ['linear'], maxExpr]
  for (const [v, a] of stops) expr.push(v, a)
  return expr
}

/**
 * Legend rows: one per COLOR, so a shared long-tail color (the minor
 * commodities) collapses to a single "Other" row instead of a wall of
 * identical swatches. Entries keep their true labels for the popups.
 */
export function categoricalLegend(entries) {
  const seen = new Map()
  for (const e of entries) {
    if (seen.has(e.color)) continue
    seen.set(e.color, { ...e, label: e.legendLabel ?? e.label })
  }
  return [...seen.values()]
}

/**
 * Compare mode for dominance maps: color the cells/units whose LEADER
 * changed between two years, by the new leader; unchanged leaders are
 * transparent. Values are the reference-year props scaled by each entry's
 * national source trajectory (factorPairs), matched on the m49 prop —
 * the same construction the year bar uses for the emissions map.
 */
import { factorPairs } from './year-factors.js'

function scaledNum(e, factors, year) {
  const pairs = factorPairs(factors, e.src, year)
  if (!pairs.length) return num(e.prop)
  return ['*', num(e.prop), ['match', ['to-number', ['get', 'm49']], ...chunkPairs(pairs), 1]]
}

// factorPairs returns a flat [m49, f, ...] list; match wants
// label(s)/output pairs — group each m49 alone with its factor.
function chunkPairs(pairs) {
  const out = []
  for (let i = 0; i < pairs.length; i += 2) out.push(pairs[i], pairs[i + 1])
  return out
}

export function categoricalChangeColorExpr(entries, factors, yearFrom, yearTo, minValue = 0) {
  if (entries.length === 0 || !factors) return 'rgba(0,0,0,0)'
  const maxOf = (year) => entries.length === 1
    ? scaledNum(entries[0], factors, year)
    : ['max', ...entries.map((e) => scaledNum(e, factors, year))]
  const body = ['case']
  for (const e of entries) {
    body.push(['all',
      ['>', ['var', 'mTo'], minValue],
      ['==', scaledNum(e, factors, yearTo), ['var', 'mTo']],
      ['!=', scaledNum(e, factors, yearFrom), ['var', 'mFrom']],
    ], e.color)
  }
  body.push('rgba(0,0,0,0)')
  return ['let', 'mFrom', maxOf(yearFrom), 'mTo', maxOf(yearTo), body]
}

/** The new leader's value at yearTo — drives the alpha ramp in compare mode. */
export function categoricalChangeMagnitudeExpr(entries, factors, yearTo) {
  if (entries.length === 0 || !factors) return 0
  return entries.length === 1
    ? scaledNum(entries[0], factors, yearTo)
    : ['max', ...entries.map((e) => scaledNum(e, factors, yearTo))]
}

/** JS-side: sorted [{label, color, value, share}] for a properties object. */
export function composition(props, entries) {
  if (!props) return []
  const rows = entries
    .map((e) => ({ ...e, value: Number(props[e.prop] ?? 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = rows.reduce((t, r) => t + r.value, 0)
  if (!(total > 0)) return []
  return rows.map((r) => ({ ...r, share: r.value / total }))
}
