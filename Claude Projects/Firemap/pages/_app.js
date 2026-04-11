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
  /* Force compact attribution to stay collapsed — hide text in non-expanded state */
  .maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-compact-show) .maplibregl-ctrl-attrib-inner {
    display: none !important;
  }
  .maplibregl-ctrl-attrib-button {
    width: 24px !important;
    height: 24px !important;
    padding: 0 !important;
    margin: 0 !important;
    /* background-color transparent removes the white box; background-image "i" is preserved */
    background-color: transparent !important;
    border: none !important;
    opacity: 0.45 !important;
    /* Hide any raw text that MapLibre v4 may put in the button */
    font-size: 0 !important;
    overflow: hidden !important;
  }
  .maplibregl-ctrl-attrib-button:hover {
    opacity: 0.8 !important;
  }
  /* Remove blue focus ring */
  .maplibregl-ctrl-attrib-button:focus,
  .maplibregl-ctrl-attrib-button:active {
    outline: none !important;
    box-shadow: none !important;
  }
  /* Expanded attribution panel (after clicking the "i") */
  .maplibregl-ctrl-attrib.maplibregl-compact-show {
    background: rgba(255, 255, 255, 0.88) !important;
    width: auto !important;
    height: auto !important;
    padding: 4px 10px !important;
    border-radius: 4px !important;
  }
  .maplibregl-ctrl-attrib.maplibregl-compact-show .maplibregl-ctrl-attrib-inner,
  .maplibregl-ctrl-attrib.maplibregl-compact-show a {
    font-size: 11px !important;
    color: rgba(60, 60, 60, 0.8) !important;
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
