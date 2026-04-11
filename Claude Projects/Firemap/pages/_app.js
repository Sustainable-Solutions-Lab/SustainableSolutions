import { ThemeProvider } from 'theme-ui'
import theme from '../theme/index.js'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
