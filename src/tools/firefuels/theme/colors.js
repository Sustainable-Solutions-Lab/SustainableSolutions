/**
 * theme/colors.js
 * Aligned with the lab design system (src/styles/colors_and_type.css).
 *
 * Notes:
 * - background / text / surface / border / muted track the system's paper/ink scale.
 * - primary uses brand-orange (#E87828) sampled from the lab logo. It's the
 *   accent for fuel-treatment work — fire-flavored without being alarming Cardinal.
 * - secondary uses brand-green (#48A848) from the lab logo.
 * - These are *chrome* colors only. The map's data layer is colored separately
 *   by lib/colormap.js (RdBu, etc.) — those are semantic and stay as-is.
 */

export const dark = {
  background: '#0C0C1C',  // --paper (dark)
  text:       '#F8F8E8',  // --ink (dark)
  primary:    '#E87828',  // --brand-orange
  secondary:  '#48A848',  // --brand-green
  muted:      '#9A9AB0',  // --ink-3 (dark)
  border:     'rgba(248, 248, 232, 0.14)', // --rule (dark)
  surface:    '#14142A',  // --paper-2 (dark)
};

export const light = {
  background: '#F8F8E8',  // --paper
  text:       '#181838',  // --ink
  primary:    '#E87828',  // --brand-orange
  secondary:  '#48A848',  // --brand-green
  muted:      '#6B6B80',  // --ink-3
  border:     'rgba(24, 24, 56, 0.14)',    // --rule
  surface:    '#F1F1DF',  // --paper-2
};
