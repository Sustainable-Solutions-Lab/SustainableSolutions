/**
 * engine/aggregate.js
 *
 * Summaries over many cells: the marginal abatement cost (supply) curve,
 * totals for a region, and a ranking by country.
 */

import { STATUS } from './evaluate.js'

/**
 * Supply curve: cells sorted by levelized cost; cumulative abatement over
 * the horizon (Mt CO2e) against cost ($/t). `maxCost` clips the long tail.
 * Returns at most `points` points plus the total.
 */
export function supplyCurve(res, { mask = null, maxCost = 1000, points = 300 } = {}) {
  const { status, lcoa, mitTotal } = res
  const idx = []
  for (let i = 0; i < status.length; i++) {
    if (status[i] !== STATUS.OK) continue
    if (mask && !mask[i]) continue
    if (!(mitTotal[i] > 0) || !Number.isFinite(lcoa[i])) continue
    idx.push(i)
  }
  idx.sort((a, b) => lcoa[a] - lcoa[b])
  const curve = []
  let cum = 0
  const step = Math.max(1, Math.floor(idx.length / points))
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]
    cum += mitTotal[i]
    if (k % step === 0 || k === idx.length - 1) {
      curve.push({ mt: cum / 1e6, cost: Math.min(lcoa[i], maxCost), clipped: lcoa[i] > maxCost })
    }
  }
  // Abatement available at or below a few benchmark prices.
  const at = (p) => { let s = 0; for (const i of idx) { if (lcoa[i] <= p) s += mitTotal[i]; else break }; return s / 1e6 }
  return { curve, totalMt: cum / 1e6, cells: idx.length, atPrice: { 50: at(50), 100: at(100), 200: at(200) } }
}

/** Totals over a mask (or everything). */
export function totalsOver(res, mask = null) {
  const { status, area, mitTotal, mitPV, costNPV, netBenefit, def } = res
  const t = { cells: 0, areaHa: 0, mitTotal: 0, mitPV: 0, costNPV: 0, netBenefit: 0 }
  for (let i = 0; i < status.length; i++) {
    if (status[i] !== STATUS.OK) continue
    if (mask && !mask[i]) continue
    t.cells++; t.areaHa += area[i]; t.mitTotal += mitTotal[i]; t.mitPV += mitPV[i]; t.costNPV += costNPV[i]; t.netBenefit += netBenefit[i]
  }
  const denom = def.finance.discountCarbon ? t.mitPV : t.mitTotal
  t.lcoa = denom > 0 ? t.costNPV / denom : NaN
  return t
}

/** Totals by country code, sorted by abatement. */
export function byCountry(res, countryLayer, countries, limit = 15) {
  const { status, area, mitTotal, costNPV, def } = res
  const acc = new Map()
  for (let i = 0; i < status.length; i++) {
    if (status[i] !== STATUS.OK) continue
    const c = Math.round(countryLayer[i])
    if (!c) continue
    let a = acc.get(c)
    if (!a) { a = { id: c, areaHa: 0, mitTotal: 0, costNPV: 0 }; acc.set(c, a) }
    a.areaHa += area[i]; a.mitTotal += mitTotal[i]; a.costNPV += costNPV[i]
  }
  const names = new Map(countries.map((c) => [c.id, c]))
  return [...acc.values()]
    .map((a) => ({ ...a, name: names.get(a.id)?.name ?? `#${a.id}`, iso3: names.get(a.id)?.iso3, lcoa: a.mitTotal > 0 ? a.costNPV / a.mitTotal : NaN }))
    .sort((x, y) => y.mitTotal - x.mitTotal)
    .slice(0, limit)
}
