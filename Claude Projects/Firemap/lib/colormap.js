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
} from 'd3-scale-chromatic'

const INTERPOLATORS = {
  // Standard RdBu: t=0 → red (costs > benefits), t=1 → blue (benefits > costs)
  RdBu: interpolateRdBu,
  PuOr: interpolatePuOr,
  Greens: interpolateGreens,
  Oranges: interpolateOranges,
  YlOrRd: interpolateYlOrRd,
  Blues: interpolateBlues,
  // Blue half of RdBu — for benefit variables: low=transparent, high=blue
  RdBuBlue: (t) => interpolateRdBu(0.5 + t * 0.5),
  // Red half of RdBu — for cost variables: low=transparent, high=red
  RdBuRed: (t) => interpolateRdBu(0.5 - t * 0.5),
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
