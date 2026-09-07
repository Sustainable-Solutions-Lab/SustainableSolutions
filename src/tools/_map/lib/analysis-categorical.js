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
  if (state.analysis !== 'pale') return null
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
    }))
  }
  // kind === 'commodity'
  const pool = source === 'all'
    ? commodities
    : commodities.filter((c) => c.sources.includes(source))
  return pool.map((c) => ({
    prop: source === 'all' ? `tot_${c.id}` : `${source}_${c.id}`,
    label: c.label,
    legendLabel: c.legendLabel,
    color: c.color,
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
