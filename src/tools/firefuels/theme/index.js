import { dark, light } from './colors.js'
import { fonts, fontSizes, fontWeights, lineHeights, letterSpacings } from './typography.js'

const theme = {
  config: {
    initialColorModeName: 'dark',
    useColorSchemeMediaQuery: false,
    useLocalStorage: false,
  },

  colors: {
    ...dark,
    modes: {
      light: { ...light },
    },
  },

  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,

  // Breakpoints: mobile < 768px, desktop >= 768px
  breakpoints: ['48em', '64em', '80em'],

  space: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  // index: 0  1  2   3   4   5   6   7   8

  radii: {
    none: 0,
    sm: 2,
    md: 4,
    pill: 9999,
  },

  // ── Component variants ───────────────────────────────────────────────────

  buttons: {
    // Pill toggle button — used for variable/scenario selectors
    toggle: {
      fontFamily: 'body',
      fontSize: 1,
      fontWeight: 'body',
      lineHeight: 'body',
      cursor: 'pointer',
      px: 3,
      py: 1,
      borderRadius: 'pill',
      border: '1px solid',
      borderColor: 'border',
      bg: 'transparent',
      color: 'muted',
      transition: 'all 0.15s ease',
      '&:hover': { color: 'text', borderColor: 'muted' },
      '&.active': {
        color: 'text',
        borderColor: 'primary',
        borderBottomWidth: '2px',
        borderBottomColor: 'primary',
      },
    },
    // Small square icon button — color scheme toggle, close button
    icon: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      p: 0,
      cursor: 'pointer',
      bg: 'transparent',
      border: '1px solid',
      borderColor: 'border',
      borderRadius: 'sm',
      color: 'muted',
      '&:hover': { color: 'text', borderColor: 'muted' },
    },
  },

  text: {
    // Monospace — for numeric data values
    mono: {
      fontFamily: 'mono',
      fontSize: 1,
      lineHeight: 'mono',
    },
    // Small all-caps label
    label: {
      fontFamily: 'body',
      fontSize: 0,
      fontWeight: 'bold',
      letterSpacing: 'caps',
      textTransform: 'uppercase',
      color: 'muted',
    },
  },

  cards: {
    // Sidebar / panel background
    panel: {
      bg: 'surface',
      border: '1px solid',
      borderColor: 'border',
      borderRadius: 'md',
      p: 4,
    },
  },

  // ── Global styles ────────────────────────────────────────────────────────

  styles: {
    root: {
      fontFamily: 'body',
      fontSize: 2,
      lineHeight: 'body',
      color: 'text',
      bg: 'background',
      margin: 0,
      padding: 0,
      '*, *::before, *::after': { boxSizing: 'border-box' },
    },
    a: {
      color: 'primary',
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    },
  },
}

export default theme
