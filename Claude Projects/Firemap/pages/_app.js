import { ThemeProvider } from 'theme-ui'
import theme from '../theme/index.js'

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
