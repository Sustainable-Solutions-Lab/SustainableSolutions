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
  interpolateGreens,
  interpolateOranges,
  interpolateYlOrRd,
  interpolateBlues,
  interpolatePurples,
  interpolateRdPu,
  interpolateBuPu,
} from 'd3-scale-chromatic'

const INTERPOLATORS = {
  // Standard RdBu: t=0 → red (costs > benefits), t=1 → blue (benefits > costs)
  RdBu: interpolateRdBu,
  // Inverted RdBu: t=0 → blue, t=1 → red. Used by Just Air's diff layers where
  // a positive diff (High CDR is dirtier / kills more people) reads as bad.
  BuRd: (t) => interpolateRdBu(1 - t),
  PuOr: interpolatePuOr,
  Greens: interpolateGreens,
  Oranges: interpolateOranges,
  YlOrRd: interpolateYlOrRd,
  Blues: interpolateBlues,
  Purples: interpolatePurples,
  RdPu: interpolateRdPu,
  BuPu: interpolateBuPu,
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
  const interp = INTERPOLATORS[variable.colormap] ?? interpolateGreens
  const { min, max, zero = 0 } = variable.domain

  if (variable.diverging) {
    return scaleDiverging(interp).domain([min, zero, max])
  }
  return scaleSequential(interp).domain([min, max])
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
