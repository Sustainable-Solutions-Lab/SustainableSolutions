/**
 * lib/analysis-cell-change.js
 *
 * The PALE decomposition on the gridded cells, minus the population term.
 *
 * Population and per-capita demand only exist per jurisdiction, so the
 * cell-level identity drops them and works with total production instead:
 *
 *     E = Prod x (Land / Prod) x (E / Land)
 *
 * which is the regional identity with P x (Prod/P) collapsed back into
 * Prod. Contributions are log-mean Divisia, expressed as a percentage of
 * the cell's own start-year emissions, so they are comparable across cells
 * and sum exactly to the net change — the same convention as the regional
 * polygons.
 *
 * All of it is computable in the paint expression: the emissions ratio is
 * per cell (each cell has its own source mix, and each source its own
 * national trajectory), while the production and agricultural-land ratios
 * are national, so they enter as per-country constants matched on m49.
 * Nothing new is needed in the tiles.
 *
 *     pct_i = 100 x K(rE) x ln(r_i),  K(rE) = (rE - 1) / ln(rE)
 *     r_prod = national,  r_landprod = rLand/rProd,  r_eland = rE/rLand
 *
 * Because two of the three ratios are national, those terms vary between
 * countries but not within them; the emissions-intensity term and the net
 * change carry the within-country texture. The sidebar says so.
 */

import { factorPairs } from './year-factors.js'

const EPS = 1e-9

/** Σ over the variable's source terms of prop x national factor for `year`. */
function emissionsExpr(terms, factors, year) {
  const parts = terms.map((t) => {
    const get = ['coalesce', ['to-number', ['get', t.prop]], 0]
    const pairs = factorPairs(factors, t.src, year)
    return pairs.length === 0 ? get : ['*', get, ['match', ['get', 'm49'], ...pairs, 1]]
  })
  return parts.length === 1 ? parts[0] : ['+', ...parts]
}

/** Per-country ln(ratio) of a national-trends series between two years. */
function lnRatioPairs(trends, key, y0, yT) {
  const i0 = trends.years.indexOf(y0)
  const iT = trends.years.indexOf(yT)
  const pairs = []
  if (i0 < 0 || iT < 0) return pairs
  for (const [m49, series] of Object.entries(trends.countries)) {
    const a = series[key]?.[i0]
    const b = series[key]?.[iT]
    if (!(a > 0) || !(b > 0)) continue
    const v = Math.log(b / a)
    if (Math.abs(v) < 1e-6) continue
    pairs.push(Number(m49), Math.round(v * 1e4) / 1e4)
  }
  return pairs
}

const matchOrZero = (pairs) =>
  pairs.length ? ['match', ['get', 'm49'], ...pairs, 0] : 0

/**
 * Percentage-of-start-year contribution expression for one term.
 * term: 'net' | 'prod' | 'landprod' | 'eland'
 */
export function cellChangeExpr({ terms, factors, trends, term, y0 = 2000, yT = 2023 }) {
  const e0 = emissionsExpr(terms, factors, y0)
  const eT = emissionsExpr(terms, factors, yT)
  // rE, guarded: cells with no start-year emissions have no ratio.
  const rE = ['/', eT, ['max', e0, EPS]]
  const lnRE = ['ln', ['max', rE, EPS]]
  const lnProd = matchOrZero(lnRatioPairs(trends, 'prod', y0, yT))
  const lnLand = matchOrZero(lnRatioPairs(trends, 'land', y0, yT))

  // K = (rE - 1) / ln(rE), -> 1 as rE -> 1.
  const K = ['case',
    ['<', ['abs', ['-', rE, 1]], 1e-4], 1,
    ['/', ['-', rE, 1], lnRE],
  ]
  const lnTerm =
    term === 'prod' ? lnProd
    : term === 'landprod' ? ['-', lnLand, lnProd]
    : term === 'eland' ? ['-', lnRE, lnLand]
    : lnRE  // net
  const pct = ['*', 100, K, lnTerm]
  return ['case', ['>', e0, EPS], pct, 0]
}

/** Start-year emissions, for weighting a contribution map by magnitude. */
export function cellChangeMagnitudeExpr({ terms, factors, y0 = 2000 }) {
  return emissionsExpr(terms, factors, y0)
}

/** Cells with no start-year emissions carry no contribution. */
export function cellChangeHasExpr(terms) {
  return ['any', ...terms.map((t) => ['has', t.prop])]
}

/** Diverging paint for a percentage-of-2000 contribution. */
export function cellChangeColorExpr(expr, range = 50, isDark = false) {
  const neutral = isDark ? 'rgba(248,248,232,0.05)' : 'rgba(24,24,56,0.05)'
  return ['interpolate', ['linear'], expr,
    -range, 'rgba(50,136,189,0.85)',
    -range / 5, 'rgba(102,194,165,0.6)',
    0, neutral,
    range / 5, 'rgba(253,174,97,0.6)',
    range, 'rgba(213,62,79,0.9)',
  ]
}

/** Which term a driver maps to on the cells, or null if regional-only. */
export function cellTermFor(config, state) {
  if (state.analysis !== 'pale' || state.mapView === 'regional') return null
  const d = (config.paleMap?.drivers ?? []).find((x) => x.id === state.analysisDriver)
  return d?.cellTerm ?? null
}
