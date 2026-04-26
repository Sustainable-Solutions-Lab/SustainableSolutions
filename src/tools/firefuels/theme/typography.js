/**
 * theme/typography.js
 * Aligned with the lab design system fonts (Inter / JetBrains Mono / Source Serif 4).
 */

export const fonts = {
  body:    "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
  heading: "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
  mono:    "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  serif:   "'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', serif",
}

// Aligned with the design system's 1.20 minor-third scale.
export const fontSizes = [11, 13, 16, 19, 23, 28, 34]
// index:                   0   1   2   3   4   5   6

export const fontWeights = {
  body: 400,
  heading: 600,
  bold: 700,
}

export const lineHeights = {
  body: 1.5,
  heading: 1.28,
  mono: 1.4,
}

export const letterSpacings = {
  body: 'normal',
  caps: '0.12em', // matches --tr-eyebrow in the system
}
