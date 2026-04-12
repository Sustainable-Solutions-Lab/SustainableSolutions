import { ThemeProvider } from 'theme-ui'
import { Global, css } from '@emotion/react'
import theme from '../theme/index.js'
import 'maplibre-gl/dist/maplibre-gl.css'

const globalStyles = css`
  /* Position bottom-right controls flush with our button stack */
  .maplibregl-ctrl-bottom-right {
    bottom: 6px !important;
    right: 6px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 4px !important;
  }
  .maplibregl-ctrl-bottom-right .maplibregl-ctrl {
    margin: 0 !important;
  }
  /* Compact attribution: collapsed shows only the MapLibre "i" icon button */
  .maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-compact-show) {
    background: transparent !important;
    box-shadow: none !important;
    width: 30px !important;
    height: 30px !important;
    padding: 0 !important;
  }
  /* Hide MapLibre's built-in attribution entirely — we render our own static text */
  .maplibregl-ctrl-attrib {
    display: none !important;
  }
`

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={theme}>
      <Global styles={globalStyles} />
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
