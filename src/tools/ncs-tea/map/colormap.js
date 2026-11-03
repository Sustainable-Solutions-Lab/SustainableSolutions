/**
 * map/colormap.js
 *
 * Colour ramps, following the lab site's lib/colormap.js: ColorBrewer
 * Spectral is the default data palette. Sequential views use SpectralR
 * (blue = low, red = high, "more reads hotter"); cost per tonne uses
 * Spectral so that cheap reads cool and expensive reads hot as well.
 */
import { interpolateSpectral, interpolateRdBu, interpolateViridis, interpolateYlOrRd, interpolateBlues, interpolateGreens } from 'd3-scale-chromatic'

export const INTERPOLATORS = {
  Spectral: interpolateSpectral,
  SpectralR: (t) => interpolateSpectral(1 - t),
  SpectralHot: (t) => interpolateSpectral(0.38 * (1 - t)),
  RdBu: interpolateRdBu,
  BuRd: (t) => interpolateRdBu(1 - t),
  Viridis: interpolateViridis,
  YlOrRd: interpolateYlOrRd,
  Blues: interpolateBlues,
  Greens: interpolateGreens,
}

/** 256-entry RGBA lookup table for a ramp. */
export function buildLut(name, alpha = 235) {
  const f = INTERPOLATORS[name] ?? INTERPOLATORS.SpectralR
  const lut = new Uint8ClampedArray(256 * 4)
  for (let k = 0; k < 256; k++) {
    const [r, g, b] = parseRgb(f(k / 255))
    lut[k * 4] = r; lut[k * 4 + 1] = g; lut[k * 4 + 2] = b; lut[k * 4 + 3] = alpha
  }
  return lut
}

export function parseRgb(css) {
  const m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
  if (m) return [+m[1], +m[2], +m[3]]
  if (css[0] === '#') return [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16))
  return [0, 0, 0]
}

/** CSS gradient for a legend bar. */
export function legendGradient(name, n = 24) {
  const f = INTERPOLATORS[name] ?? INTERPOLATORS.SpectralR
  const stops = Array.from({ length: n }, (_, i) => `${f(i / (n - 1))} ${((i / (n - 1)) * 100).toFixed(1)}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}
