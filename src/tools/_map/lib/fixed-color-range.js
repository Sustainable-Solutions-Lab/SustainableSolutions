/**
 * lib/fixed-color-range.js
 *
 * The colour range for the gridded cells, derived from the precomputed
 * cell sample (distributions.json, ~4.8k values per property) instead of
 * from whatever features happen to be decoded in the tile cache.
 *
 * Two reasons this matters.
 *
 * Correctness: scanning live features made the scale depend on the
 * viewport, so the same cell changed colour when you panned. The regional
 * map was already fixed this way (regional-layer.jsx reads unit-scales.json);
 * this is the same treatment for the gridded map.
 *
 * Cost: the scan was map.querySourceFeatures() over the whole source,
 * which materialises a JS object with several hundred properties for every
 * cell, then reads the variable out of each one. Profiling the compare
 * toggle put 3.3 s in the vector-tile Feature constructor and 2.7 s in the
 * per-feature property read, out of 7.2 s of blocked main thread. Reading a
 * percentile off a preloaded array costs nothing measurable.
 *
 * The range keeps the two-sided shape the colormap expects:
 * { maxPosDev, maxNegDev } as distances from the variable's zero, tracked
 * separately so a skewed field can saturate asymmetrically.
 */

const cache = new Map()  // url -> { promise, data }

export function loadDistributions(url) {
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

export function peekDistributions(url) {
  return url ? cache.get(url)?.data ?? null : null
}

function pct(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.floor(p * (sorted.length - 1))] ?? sorted[sorted.length - 1]
}

/** Sample for a property, preferring an enhanced-mask override if one exists. */
function sampleFor(dist, prop, suffixes) {
  if (suffixes) {
    for (const sfx of suffixes) {
      const s = dist[prop + sfx]
      if (Array.isArray(s) && s.length) return s
    }
  }
  const s = dist[prop]
  return Array.isArray(s) && s.length ? s : null
}

/** One-sided percentile of a single property's deviation from `zero`. */
function devs(sample, zero, p) {
  const pos = [], neg = []
  for (const x of sample) {
    if (x == null || isNaN(x)) continue
    if (x > zero) pos.push(x - zero)
    else if (x < zero) neg.push(zero - x)
  }
  pos.sort((a, b) => a - b)
  neg.sort((a, b) => a - b)
  return { pos: pct(pos, p), neg: pct(neg, p) }
}

/**
 * Spread of a source's national year factors between two years: the p90
 * of |f(year) - f(yearB)| across countries. In compare mode a cell's value
 * is its reference-year emissions times exactly that difference, so this
 * converts a level scale into a difference scale without touching a tile.
 */
function factorSpread(factors, src, year, yearB) {
  if (!factors) return 0
  const yi = factors.years.indexOf(year)
  const yj = factors.years.indexOf(yearB)
  if (yi < 0 || yj < 0) return 0
  const d = []
  for (const series of Object.values(factors.countries)) {
    const s = series[src]
    if (!s) continue
    const ref = s[factors.refIdx]
    if (!ref) continue
    const a = s[yi], b = s[yj]
    if (!a || !b) continue
    d.push(Math.abs(a / ref - b / ref))
  }
  d.sort((x, y) => x - y)
  return pct(d, 0.9)
}

/**
 * Fixed colour range for a variable, or null when nothing can be derived
 * (the caller then falls back to the variable's declared domain).
 *
 * `colorMax` / `colorMin` on the variable still win — they are the
 * deliberate clean caps (population pinned at 1000, and so on).
 */
export function fixedColorRange(variable, dist, factors) {
  if (!variable || variable.type === 'categorical') return null
  const zero = variable.domain?.zero ?? variable.domain?.min ?? 0
  if (variable.colorMax != null || variable.colorMin != null) {
    return {
      maxPosDev: variable.colorMax != null ? Math.max(variable.colorMax - zero, 0) : 0,
      maxNegDev: variable.colorMin != null ? Math.max(zero - variable.colorMin, 0) : 0,
    }
  }
  if (!dist) return null
  const p = variable.colorPercentile ?? 0.99
  const sfx = variable.maskSuffixes
  const terms = variable.scaled?.terms ?? variable.yearTerms ?? null

  // Difference variables (compare mode, and stored diffOf pairs) have no
  // sample of their own; they are built from the level scale.
  const isDiff = variable.scaled?.yearB != null || !!variable.diffOf
  if (isDiff && terms) {
    const { year, yearB } = variable.scaled ?? {}
    let m = 0
    for (const t of terms) {
      const s = sampleFor(dist, t.prop, sfx)
      if (!s) continue
      m += devs(s, 0, p).pos * factorSpread(factors, t.src, year, yearB)
    }
    // Symmetric about zero: a difference map that cannot go blue on one
    // side is reading as one-directional when it is not.
    return m > 0 ? { maxPosDev: m, maxNegDev: m } : null
  }

  if (terms && terms.length) {
    // p99 of a sum is not the sum of p99s, but it is deterministic and
    // errs toward a cooler map, which is the right way to be wrong here.
    let posSum = 0, negSum = 0
    for (const t of terms) {
      const s = sampleFor(dist, t.prop, sfx)
      if (!s) continue
      const d = devs(s, zero, p)
      posSum += d.pos
      negSum += d.neg
    }
    if (posSum > 0 || negSum > 0) return { maxPosDev: posSum, maxNegDev: negSum }
  }

  const own = sampleFor(dist, variable.id, sfx)
  if (own) {
    const d = devs(own, zero, p)
    if (d.pos > 0 || d.neg > 0) return { maxPosDev: d.pos, maxNegDev: d.neg }
  }
  return null
}
