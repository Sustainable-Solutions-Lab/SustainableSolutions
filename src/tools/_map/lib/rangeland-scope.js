/**
 * lib/rangeland-scope.js
 *
 * LSRS grassland-scope control for rangeland soil carbon (config.rangelandScope).
 * The Standard and its Guidance read differently on which grazing land is in
 * scope, so the reader picks:
 *   all  - every rangeland cell (Standard: any land used for livestock is
 *          productive land)
 *   cult - the cultivated-grassland share of each cell only (Guidance: natural
 *          grassland "not covered in v1")
 *   gi   - cultivated share, plus the natural/shrubland share where 2020
 *          grazing intensity >= a threshold (the "not intensively managed
 *          stocking rates" test made operational; no threshold in the text,
 *          hence a slider)
 * Cells carry gc (GPW cultivated share of the cell's grassland) and gq, a
 * 30-character string of ten 3-digit permille shares: the natural+shrubland
 * share lying on 5' cells whose 2020 grazing intensity is >= 0, 10, ..., 90.
 * The threshold is therefore applied at 5', not to a cell-mean intensity
 * (which pulls cells at the cap below it). Cells without gc (unit tiles,
 * non-rangeland cells) are left unscaled.
 *
 * The scope multiplies only the rangeland term: the rangeland view itself
 * (raw segment expressions) and the rsoil term inside totals and the
 * category-2 sum (yearTerms), so every consumer that resolves a variable
 * through getActiveVariable - paint, filters, area statistics - agrees.
 */

const num = (p) => ['coalesce', ['to-number', ['get', p]], 0]

export function rangelandScopeState(config, dims) {
  const rs = config?.rangelandScope
  if (!rs) return null
  const mode = dims?.[rs.modeDimensionId] ?? 'all'
  const threshold = Number(dims?.[rs.thresholdDimensionId] ?? rs.defaultThreshold)
  return { rs, mode, threshold }
}

export function scopeMultiplier(mode, t) {
  if (mode === 'all') return null
  const k = Math.max(0, Math.min(9, Math.round(t / 10)))
  const natExpr = ['/', ['to-number', ['slice', ['coalesce', ['get', 'gq'], '000000000000000000000000000000'], 3 * k, 3 * k + 3], 0], 1000]
  const share = mode === 'cult' ? num('gc') : ['+', num('gc'), natExpr]
  return {
    expr: ['case', ['has', 'gc'], share, 1],
    fn: (p) => {
      if (p?.gc == null) return 1
      const nat = mode === 'cult' || typeof p.gq !== 'string' ? 0
        : Number(p.gq.slice(3 * k, 3 * k + 3)) / 1000
      return Number(p.gc) + (Number.isFinite(nat) ? nat : 0)
    },
  }
}

export function scopeLabel(mode, t) {
  return mode === 'cult' ? 'cultivated grassland only'
    : mode === 'gi' ? `cultivated + natural where grazing intensity ≥ ${t}` : null
}

/** Apply the active scope to a resolved variable (no-op when 'all'). */
export function applyRangelandScope(config, dims, v) {
  const st = rangelandScopeState(config, dims)
  if (!st || !v) return v
  const sc = scopeMultiplier(st.mode, st.threshold)
  if (!sc) return v
  const { rs } = st
  const label = `${v.label} (${scopeLabel(st.mode, st.threshold)})`
  if (v.rawExpr != null && rs.variableIds.includes(v.id)) {
    const baseExpr = v.rawExpr
    const baseRead = v.rawRead
    return {
      ...v,
      rawExpr: ['*', baseExpr, sc.expr],
      rawRead: (p) => {
        const b = baseRead ? baseRead(p) : p?.[v.id]
        return b == null ? b : b * sc.fn(p)
      },
      label,
      rangelandScoped: true,
    }
  }
  const terms = v.scaled?.terms ?? v.yearTerms
  if (terms?.some((t) => rs.sources.includes(t.src))) {
    const scopedTerms = terms.map((t) => (rs.sources.includes(t.src) ? { ...t, cellScale: sc } : t))
    const yc = config.yearControl
    const year = Number(dims?.[yc?.dimensionId] ?? yc?.referenceYear)
    return {
      ...v,
      // A reference-year variable reads its stored total; force the
      // term-by-term sum so the scope can reach the rangeland term.
      scaled: v.scaled ? { ...v.scaled, terms: scopedTerms } : { terms: scopedTerms, year },
      colorAnchorId: v.colorAnchorId ?? v.id,
      label,
      rangelandScoped: true,
    }
  }
  return v
}
