/**
 * lib/fixed-color-range.js
 *
 * The colour range for the gridded cells, derived from precomputed samples
 * rather than from whatever features happen to be decoded in the tile cache.
 *
 * Correctness: scanning live features made the scale depend on the viewport,
 * so the same cell changed colour when you panned. The regional map was
 * already fixed this way (regional-layer.jsx reads unit-scales.json); this is
 * the same treatment for the gridded map.
 *
 * Cost: the scan was map.querySourceFeatures() over the whole source, which
 * materialises a JS object with several hundred properties for every cell.
 * Profiling the compare toggle put 3.3 s in the vector-tile Feature
 * constructor and 2.7 s in the per-feature property read.
 *
 * ── Why the per-country ladders ──────────────────────────────────────────
 *
 * A cell's displayed value is its reference-year value times its country's
 * year factor, and in compare mode it is the difference of two such values.
 * So the range depends on the joint distribution of (value, country).
 *
 * Taking a percentile of the global value sample and scaling it by a typical
 * factor is not a usable substitute, because the two are correlated:
 * countries whose emissions fell are systematically the ones with smaller
 * cells. Checked against a full pass over every cell, that shortcut ran 4.25x
 * wide on the positive side and 2.5x on the negative, which is what drained
 * the blue out of the compare map.
 *
 * distributions-by-country.json (2.5 MB raw, 596 KB gzipped, fetched in the
 * background) carries sixteen evenly spaced quantiles per country per
 * property, each standing for n/16 cells. Scaling each country's
 * ladder by that country's own factor and taking a weighted percentile of the
 * mixture reproduces the true p99 to within ~20 % on the positive side and
 * ~5 % on the negative, across year pairs as different as 2024-vs-2000 and
 * 2024-vs-2020.
 *
 * Terms combine in quadrature, not by summing their percentiles: the sum
 * assumes every source peaks in the same cell and runs 1.6-2.5x wide, while
 * quadrature lands at 0.8-1.2x.
 *
 * The range keeps the two-sided shape the colormap expects — { maxPosDev,
 * maxNegDev } as distances from the variable's zero, tracked separately so a
 * skewed field saturates asymmetrically. Forcing symmetry here is what made
 * the negative side unreadable.
 */

const cache = new Map()  // url -> { promise, data }

function loadJson(url) {
  if (!url) return Promise.resolve(null)
  let entry = cache.get(url)
  if (!entry) {
    entry = { data: null }
    entry.promise = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { entry.data = d || {}; return entry.data })
      .catch(() => { entry.data = {}; return entry.data })
    cache.set(url, entry)
  }
  return entry.promise
}

/** Both samples, resolved together: { dist, ladders }. */
export function loadColorSamples(distUrl, ladderUrl) {
  return Promise.all([loadJson(distUrl), loadJson(ladderUrl)])
    .then(([dist, ladders]) => ({ dist, ladders }))
}

export function peekColorSamples(distUrl, ladderUrl) {
  const dist = distUrl ? cache.get(distUrl)?.data : null
  const ladders = ladderUrl ? cache.get(ladderUrl)?.data : null
  return dist || ladders ? { dist, ladders } : null
}

function pct(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.floor(p * (sorted.length - 1))] ?? sorted[sorted.length - 1]
}

/** Weighted percentile over [{ v, w }], v ascending. */
function wpct(items, p) {
  if (!items.length) return 0
  items.sort((a, b) => a.v - b.v)
  let total = 0
  for (const i of items) total += i.w
  if (total <= 0) return 0
  let cum = 0
  for (const i of items) {
    cum += i.w
    if (cum >= p * total) return i.v
  }
  return items[items.length - 1].v
}

/**
 * A property's entry. Deliberately the base property, never an enhanced-mask
 * override.
 *
 * Per cell, readProp prefers the override and falls back to the base. But an
 * override is sparse — the Descals palm reallocation only covers palm — so
 * its distribution is a concentrated subset, not a replacement. Reading the
 * range off it overstated the scale by 2.6x, while the true effect of
 * enabling all seven masks is to move the 2024 p99 from 298 to 302, checked
 * against a full pass over every cell.
 *
 * Ignoring them also keeps the scale from moving when a mask is toggled,
 * which is the same property that makes it not move when the map is panned.
 */
function pick(table, prop) {
  return table?.[prop] ?? null
}

const clip = (f) => Math.min(10, Math.max(0.1, f))

/**
 * A country's factor for a source at a year, or the difference between two
 * years when yearB is given. Mirrors year-factors.js exactly, including the
 * [0.1, 10] clip the exporter applies.
 */
function multiplier(factors, src, m49, year, yearB) {
  const series = factors?.countries?.[m49]?.[src]
  const at = (y) => {
    if (!series) return 1
    const yi = factors.years.indexOf(y)
    if (yi < 0) return 1
    const ref = series[factors.refIdx]
    const v = series[yi]
    if (!ref || !v) return 1
    return clip(v / ref)
  }
  return yearB != null ? at(year) - at(yearB) : at(year)
}

/**
 * Per-term deviation percentiles from the per-country ladders, or null when
 * the term has no ladder. Returns { pos, neg } as distances from `zero`.
 */
function termDevs(ladders, prop, factors, src, year, yearB, zero, p) {
  const byCountry = pick(ladders?.props, prop)
  if (!byCountry) return null
  const K = ladders.ladder || 16
  const pos = [], neg = []
  for (const m49 in byCountry) {
    const rec = byCountry[m49]
    const mult = multiplier(factors, src, m49, year, yearB)
    // In compare mode a country whose factor did not move contributes
    // nothing but zeros, which would drag the percentile down.
    if (yearB != null && mult === 0) continue
    const w = rec.n / K
    for (const v of rec.q) {
      const dev = v * mult - zero
      if (dev > 0) pos.push({ v: dev, w })
      else if (dev < 0) neg.push({ v: -dev, w })
    }
  }
  return { pos: wpct(pos, p), neg: wpct(neg, p) }
}

/**
 * Fixed colour range for a variable, or null when nothing can be derived
 * (the caller then falls back to the variable's declared domain).
 *
 * `colorMax` / `colorMin` still win — they are the deliberate clean caps.
 */
export function fixedColorRange(variable, samples, factors) {
  if (!variable || variable.type === 'categorical') return null
  const zero = variable.domain?.zero ?? variable.domain?.min ?? 0
  if (variable.colorMax != null || variable.colorMin != null) {
    return {
      maxPosDev: variable.colorMax != null ? Math.max(variable.colorMax - zero, 0) : 0,
      maxNegDev: variable.colorMin != null ? Math.max(zero - variable.colorMin, 0) : 0,
    }
  }
  const dist = samples?.dist
  const ladders = samples?.ladders
  if (!dist && !ladders) return null

  const p = variable.colorPercentile ?? 0.99
  const terms = variable.scaled?.terms ?? variable.yearTerms ?? null
  const year = variable.scaled?.year
  const yearB = variable.scaled?.yearB
  const isDiff = yearB != null

  // Preferred path: per-country ladders, combined in quadrature.
  if (ladders?.props && terms?.length && factors && year != null) {
    let posSq = 0, negSq = 0, hit = 0
    for (const t of terms) {
      const d = termDevs(ladders, t.prop, factors, t.src, year, yearB, isDiff ? 0 : zero, p)
      if (!d) continue
      hit += 1
      posSq += d.pos * d.pos
      negSq += d.neg * d.neg
    }
    if (hit > 0) {
      const maxPosDev = Math.sqrt(posSq)
      const maxNegDev = Math.sqrt(negSq)
      if (maxPosDev > 0 || maxNegDev > 0) return { maxPosDev, maxNegDev }
    }
  }

  // Fallbacks, for variables with no ladder (and for a stale cached file).
  if (!dist) return null
  const devsOf = (sample, z) => {
    const pos = [], neg = []
    for (const x of sample) {
      if (x == null || isNaN(x)) continue
      if (x > z) pos.push(x - z)
      else if (x < z) neg.push(z - x)
    }
    pos.sort((a, b) => a - b); neg.sort((a, b) => a - b)
    return { pos: pct(pos, p), neg: pct(neg, p) }
  }
  if (terms?.length) {
    let posSq = 0, negSq = 0
    for (const t of terms) {
      const s = pick(dist, t.prop)
      if (!Array.isArray(s) || !s.length) continue
      const d = devsOf(s, zero)
      posSq += d.pos * d.pos
      negSq += d.neg * d.neg
    }
    const maxPosDev = Math.sqrt(posSq), maxNegDev = Math.sqrt(negSq)
    if (maxPosDev > 0 || maxNegDev > 0) return { maxPosDev, maxNegDev }
  }
  const own = pick(dist, variable.id)
  if (Array.isArray(own) && own.length) {
    const d = devsOf(own, zero)
    if (d.pos > 0 || d.neg > 0) return { maxPosDev: d.pos, maxNegDev: d.neg }
  }
  return null
}
