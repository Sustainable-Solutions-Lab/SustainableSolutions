/**
 * lib/colormap.js
 *
 * Build D3 color scales from a Variable config object.
 * See lib/CLAUDE.md for the full spec.
 *
 * TODO (Agent C): implement buildColorScale and buildLegendStops.
 */

import { scaleSequential, scaleDiverging } from 'd3-scale'
import {
  interpolateRdBu,
  interpolatePuOr,
  interpolatePRGn,
  interpolateGreens,
  interpolateOranges,
  interpolateYlOrRd,
  interpolateOrRd,
  interpolateBlues,
  interpolatePurples,
  interpolateRdPu,
  interpolateBuPu,
  interpolateInferno,
  interpolateMagma,
} from 'd3-scale-chromatic'

export const INTERPOLATORS = {
  // Standard RdBu: t=0 → red (costs > benefits), t=1 → blue (benefits > costs)
  RdBu: interpolateRdBu,
  // Inverted RdBu: t=0 → blue, t=1 → red. Used by Just Air's diff layers where
  // a positive diff (High CDR is dirtier / kills more people) reads as bad.
  BuRd: (t) => interpolateRdBu(1 - t),
  PuOr: interpolatePuOr,
  // PRGn — diverging purple ↔ green. t=0 → dark purple, t=1 → dark
  // green, t=0.5 → near-white. Used by the race / ethnicity layer.
  PRGn: interpolatePRGn,
  // GnPu = PRGn flipped, so t=0 is green and t=1 is purple. Lets a
  // variable that runs "low → high" with green at low and purple at
  // high (e.g. % non-Hispanic white where high purple means more
  // non-white) drop into the same diverging color framework.
  GnPu: (t) => interpolatePRGn(1 - t),
  Greens: interpolateGreens,
  Oranges: interpolateOranges,
  YlOrRd: interpolateYlOrRd,
  Blues: interpolateBlues,
  Purples: interpolatePurples,
  RdPu: interpolateRdPu,
  BuPu: interpolateBuPu,
  OrRd: interpolateOrRd,
  // Magma + reversed. Reversed reads from cream (low) through orange and
  // wine-pink to deep wine-black (high) — the closest stock palette to the
  // mortality figure in the companion paper (white → pink → red → wine
  // → black).
  Magma:  interpolateMagma,
  MagmaR: (t) => interpolateMagma(1 - t),
  // Inferno + reversed. Inferno goes black → purple → red → orange → yellow;
  // reversed is yellow → orange → red → purple → black.
  Inferno:  interpolateInferno,
  InfernoR: (t) => interpolateInferno(1 - t),
  // Blue half of RdBu — for benefit variables: low=light blue, high=deep blue
  // Starts at 0.62 (not 0.5/white) so even low values show a visible blue
  RdBuBlue: (t) => interpolateRdBu(0.62 + t * 0.38),
  // Red half of RdBu — for cost variables: low=light red, high=deep red
  // Starts at 0.38 (not 0.5/white) so even low values show a visible red
  RdBuRed: (t) => interpolateRdBu(0.38 - t * 0.38),

  // Scheme-aware variants that top out at the same hues as the diverging anchors:
  //   dark  blue anchor: #4393c3 ≈ interpolateRdBu(0.80)
  //   light blue anchor: #2166ac ≈ interpolateRdBu(0.90)
  //   dark  red  anchor: #d6604d ≈ interpolateRdBu(0.20)
  //   light red  anchor: #b2182b ≈ interpolateRdBu(0.10)
  RdBuBlueDark:  (t) => interpolateRdBu(0.62 + t * 0.18),
  RdBuBlueLight: (t) => interpolateRdBu(0.57 + t * 0.33),
  RdBuRedDark:   (t) => interpolateRdBu(0.38 - t * 0.18),
  RdBuRedLight:  (t) => interpolateRdBu(0.43 - t * 0.33),
}

/**
 * Returns a function mapping a data value to a CSS color string.
 * @param {import('../contracts/project-config').Variable} variable
 * @returns {(value: number) => string}
 */
export function buildColorScale(variable) {
  const baseInterp = INTERPOLATORS[variable.colormap] ?? interpolateGreens
  const { min, max, zero = 0 } = variable.domain

  // `colormapStart` re-maps the data range onto a sub-portion of the
  // colormap, skipping the colormap's lowest stops. Useful when the
  // user wants those low-end hues replaced by transparency rather
  // than rendered — e.g. PM₂.₅ with `colormapStart: 0.35` displays
  // values starting at YlOrRd's orange end (the pale-yellow lower
  // third is dropped) and alpha-from-magnitude carries the fade.
  const start = variable.colormapStart ?? 0
  const interp = start > 0
    ? (t) => baseInterp(start + (1 - start) * t)
    : baseInterp

  if (variable.diverging) {
    return scaleDiverging(interp).domain([min, zero, max])
  }
  return scaleSequential(interp).domain([min, max])
}

/**
 * Returns two accent colors drawn from the variable's colormap for use as
 * the income (left) / race (right) groups on the equity chart, so the chart
 * palette tracks whichever variable the user is mapping. Each side returns
 * a fully-opaque `bar` color and a translucent `band` color for the CI
 * rectangle behind each bar.
 *
 * Picks t=0.15 / t=0.85 for diverging colormaps (the two saturated ends —
 * blue / red on BuRd) and t=0.40 / t=0.70 for sequential ones (a lighter
 * mid + a deeper near-end stop — e.g. MagmaR gives orange + wine-pink).
 * Respects `darkColormap` and `colormapStart`.
 */
export function getEquityPalette(variable, isDark) {
  const fallbackBar1 = isDark ? 'rgb(67, 147, 195)' : 'rgb(33, 102, 172)'
  const fallbackBar2 = isDark ? 'rgb(214, 96, 77)'  : 'rgb(178, 24, 43)'
  if (!variable) {
    return {
      income: { bar: fallbackBar1, band: withAlphaRgb(fallbackBar1, 0.25) },
      race:   { bar: fallbackBar2, band: withAlphaRgb(fallbackBar2, 0.25) },
    }
  }
  const cmName = (isDark && variable.darkColormap) ? variable.darkColormap : (variable.colormap ?? 'BuRd')
  const baseInterp = INTERPOLATORS[cmName] ?? INTERPOLATORS.BuRd
  const start = variable.colormapStart ?? 0
  const interp = start > 0 ? (t) => baseInterp(start + (1 - start) * t) : baseInterp
  const t1 = variable.diverging ? 0.15 : 0.40
  const t2 = variable.diverging ? 0.85 : 0.70
  const c1 = interp(t1)
  const c2 = interp(t2)
  return {
    income: { bar: c1, band: c1 },
    race:   { bar: c2, band: c2 },
  }
}

function withAlphaRgb(rgbStr, alpha) {
  return rgbStr.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `, ${alpha})`)
}

/**
 * Returns an array of evenly-spaced { value, color } stops for a legend gradient.
 * @param {import('../contracts/project-config').Variable} variable
 * @param {number} n  - number of stops (default 20)
 * @returns {{ value: number, color: string }[]}
 */
export function buildLegendStops(variable, n = 20) {
  const scale = buildColorScale(variable)
  const { min, max } = variable.domain
  return Array.from({ length: n }, (_, i) => {
    const value = min + (i / (n - 1)) * (max - min)
    return { value, color: scale(value) }
  })
}
