/**
 * engine/evaluate.js
 *
 * Evaluate an intervention definition over every cell of the grid.
 *
 * The model is separable in space and time, which is what makes it fast
 * enough to re-run on every slider move for 260k cells: each mitigation
 * component is a spatial rate R_c(i) (t CO2e per ha in year one) times a
 * time profile g_c(t) that already includes reversal, and each cost
 * component is a spatial unit cost U_k(i) (USD per occurrence) times a
 * timing series h_k(t) that already includes escalation and discounting.
 *
 *   mitigation_i(t)  = A_i * sum_c R_c(i) g_c(t)
 *   cost_i(t)        = sum_k U_k(i) h_k(t)  +  sum_{k per tCO2} v_k m_k(i) mitigation_i(t)
 *
 * so per-cell totals are dot products with precomputed time sums, and the
 * full annual series is only built for the one cell the user clicks.
 *
 * Result arrays are Float32Array of grid.size; NaN where the cell is not
 * eligible or an input is missing (see `status`).
 */

import { rateValue } from './rates.js'
import { profileSeries, applyReversal } from './profiles.js'

export const STATUS = { OUT: 0, OK: 1, MISSING: 2 }

export function evaluate(def, grid) {
  const { layers, size: N } = grid
  const T = def.horizon.years
  const r = def.finance.discountRate ?? 0
  const price = Number(def.finance.carbonPrice) || 0
  const discountCarbon = !!def.finance.discountCarbon

  const df = new Float64Array(T)
  for (let t = 0; t < T; t++) df[t] = 1 / Math.pow(1 + r, t)

  // ── Area and eligibility ────────────────────────────────────────────────
  const areaL = layers[def.area.layer]
  const share = Math.max(0, Math.min(1, Number(def.area.share ?? 1)))
  const elig = (def.area.eligibility ?? []).map((e) => ({ L: layers[e.layer], min: e.min, max: e.max }))
  const area = new Float32Array(N)
  const status = new Uint8Array(N)
  let totalArea = 0
  for (let i = 0; i < N; i++) {
    let ok = !!areaL && Number.isFinite(areaL[i]) && areaL[i] > 0
    for (let k = 0; ok && k < elig.length; k++) {
      const { L, min, max } = elig[k]
      const v = L ? L[i] : NaN
      if (!Number.isFinite(v)) ok = false
      else if (Number.isFinite(min) && v < min) ok = false
      else if (Number.isFinite(max) && v > max) ok = false
    }
    if (ok) {
      area[i] = areaL[i] * share
      status[i] = STATUS.OK
      totalArea += area[i]
    } else {
      area[i] = 0
      status[i] = STATUS.OUT
    }
  }

  // ── Mitigation components: R_c(i) and g_c(t) ───────────────────────────
  const mit = def.mitigation.map((m) => {
    const g = applyReversal(profileSeries(m.profile, T), Number(m.reversal) || 0)
    let G = 0, Gd = 0
    const cum = new Float64Array(T)
    for (let t = 0; t < T; t++) { G += g[t]; Gd += g[t] * df[t]; cum[t] = G }
    const R = new Float32Array(N)
    const sign = (m.sign ?? 1) < 0 ? -1 : 1
    const keep = 1 - (Number(m.leakage) || 0)
    for (let i = 0; i < N; i++) {
      if (status[i] !== STATUS.OK) { R[i] = NaN; continue }
      const v = rateValue(m.rate, layers, i)
      if (!Number.isFinite(v)) { R[i] = NaN; status[i] = STATUS.MISSING; continue }
      R[i] = sign * v * keep
    }
    return { def: m, R, g, cum, G, Gd }
  })

  // ── Cost components: U_k(i) and h_k(t) ──────────────────────────────────
  const costs = def.costs.map((c) => {
    const h = profileSeries(c.timing, T)
    const esc = Number(c.escalation) || 0
    const hd = new Float64Array(T) // occurrence × escalation × discount
    let H = 0
    for (let t = 0; t < T; t++) { hd[t] = h[t] * Math.pow(1 + esc, t) * df[t]; H += hd[t] }
    const U = new Float32Array(N)
    const value = Number(c.value) || 0
    const perT = c.basis === 'per_tco2'
    // For per-tCO2 costs the "unit" is the multiplier applied to that year's
    // mitigation; the time coupling with each g_c is precomputed below.
    const gk = perT ? mit.map((m) => { let s = 0; for (let t = 0; t < T; t++) s += m.g[t] * hd[t]; return s }) : null
    for (let i = 0; i < N; i++) {
      if (status[i] !== STATUS.OK) { U[i] = NaN; continue }
      let mod = 1
      for (const sp of c.modifiers ?? []) mod *= rateValue(sp, layers, i)
      let q
      switch (c.basis) {
        case 'per_ha': q = area[i]; break
        case 'per_t_material': {
          const ar = rateValue(c.quantity, layers, i)
          q = area[i] * ar
          break
        }
        case 'per_cell': q = 1; break
        case 'per_project': q = totalArea > 0 ? area[i] / totalArea : 0; break
        case 'per_tco2': q = 1; break
        default: q = area[i]
      }
      const u = value * mod * q
      if (!Number.isFinite(u)) { U[i] = NaN; status[i] = STATUS.MISSING; continue }
      U[i] = u
    }
    return { def: c, U, h, hd, H, perT, gk }
  })

  // ── Per-cell totals ──────────────────────────────────────────────────────
  const mitTotal = new Float32Array(N)   // t CO2e over the horizon, undiscounted
  const mitPV = new Float32Array(N)      // t CO2e, discounted
  const costNPV = new Float32Array(N)    // USD, present value
  const lcoa = new Float32Array(N)       // USD per t CO2e
  const netBenefit = new Float32Array(N) // USD, PV of carbon value minus cost
  const mitRate0 = new Float32Array(N)   // t CO2e per ha in the first year
  const costPerHaYr = new Float32Array(N)// USD per ha per year, annualized
  const annuity = r > 0 ? (1 - Math.pow(1 + r, -T)) / r : T

  const totals = {
    cells: 0, areaHa: 0, mitTotal: 0, mitPV: 0, costNPV: 0, netBenefit: 0,
    byCost: costs.map(() => 0), byMitigation: mit.map(() => 0), missing: 0,
  }

  for (let i = 0; i < N; i++) {
    if (status[i] !== STATUS.OK) {
      mitTotal[i] = mitPV[i] = costNPV[i] = lcoa[i] = netBenefit[i] = mitRate0[i] = costPerHaYr[i] = NaN
      if (status[i] === STATUS.MISSING) totals.missing++
      continue
    }
    const a = area[i]
    let mT = 0, mPV = 0, m0 = 0
    for (let c = 0; c < mit.length; c++) {
      const R = mit[c].R[i]
      mT += a * R * mit[c].G
      mPV += a * R * mit[c].Gd
      m0 += R * mit[c].g[0]
      totals.byMitigation[c] += a * R * mit[c].G
    }
    let cost = 0
    for (let k = 0; k < costs.length; k++) {
      const ck = costs[k]
      let v
      if (ck.perT) {
        v = 0
        for (let c = 0; c < mit.length; c++) v += a * mit[c].R[i] * ck.gk[c]
        v *= ck.U[i]
      } else {
        v = ck.U[i] * ck.H
      }
      cost += v
      totals.byCost[k] += v
    }
    mitTotal[i] = mT
    mitPV[i] = mPV
    costNPV[i] = cost
    mitRate0[i] = m0
    costPerHaYr[i] = a > 0 ? cost / annuity / a : NaN
    const denom = discountCarbon ? mPV : mT
    lcoa[i] = denom > 0 ? cost / denom : NaN
    netBenefit[i] = price * mPV - cost
    totals.cells++
    totals.areaHa += a
    totals.mitTotal += mT
    totals.mitPV += mPV
    totals.costNPV += cost
    totals.netBenefit += netBenefit[i]
  }
  const denomTotal = discountCarbon ? totals.mitPV : totals.mitTotal
  totals.lcoa = denomTotal > 0 ? totals.costNPV / denomTotal : NaN

  return {
    def, grid, T, df, annuity, area, status, mit, costs,
    mitTotal, mitPV, costNPV, lcoa, netBenefit, mitRate0, costPerHaYr, totals,
  }
}

/**
 * A per-cell quantity in a given year, for the map's time-varying views.
 *   'mit_rate'   t CO2e per ha in year t (net of leakage and reversal)
 *   'mit_cell'   t CO2e in the cell in year t
 *   'mit_cum'    t CO2e per ha accumulated through year t
 *   'cost_ha'    USD per ha spent in year t (undiscounted, incl. escalation)
 */
export function yearField(res, t, kind) {
  const { grid, area, status, mit, costs } = res
  const N = grid.size
  const out = new Float32Array(N)
  const tt = Math.max(0, Math.min(res.T - 1, Math.round(t)))
  for (let i = 0; i < N; i++) {
    if (status[i] !== STATUS.OK) { out[i] = NaN; continue }
    let v = 0
    if (kind === 'mit_rate' || kind === 'mit_cell' || kind === 'mit_cum') {
      for (const m of mit) v += m.R[i] * (kind === 'mit_cum' ? m.cum[tt] : m.g[tt])
      if (kind === 'mit_cell') v *= area[i]
    } else if (kind === 'cost_ha') {
      let mitYear = 0
      for (const m of mit) mitYear += area[i] * m.R[i] * m.g[tt]
      for (const c of costs) {
        const occ = c.h[tt] * Math.pow(1 + (Number(c.def.escalation) || 0), tt)
        v += c.perT ? c.U[i] * mitYear * occ : c.U[i] * occ
      }
      v = area[i] > 0 ? v / area[i] : NaN
    }
    out[i] = v
  }
  return out
}

/** Full annual series for one cell, for the detail panel. */
export function cellSeries(res, i) {
  const { T, df, area, status, mit, costs, def } = res
  if (status[i] !== STATUS.OK) return null
  const a = area[i]
  const years = Array.from({ length: T }, (_, t) => (def.horizon.startYear ?? 0) + t)
  const mitigation = new Float64Array(T), cumulative = new Float64Array(T), cost = new Float64Array(T)
  const byMit = mit.map(() => new Float64Array(T))
  const byCost = costs.map(() => new Float64Array(T))
  let cum = 0
  for (let t = 0; t < T; t++) {
    let m = 0
    mit.forEach((c, ci) => { const v = a * c.R[i] * c.g[t]; byMit[ci][t] = v; m += v })
    costs.forEach((c, k) => {
      const occ = c.h[t] * Math.pow(1 + (Number(c.def.escalation) || 0), t)
      const v = c.perT ? c.U[i] * m * occ : c.U[i] * occ
      byCost[k][t] = v
      cost[t] += v
    })
    mitigation[t] = m
    cum += m
    cumulative[t] = cum
  }
  return { years, mitigation, cumulative, cost, byMit, byCost, df, areaHa: a }
}
