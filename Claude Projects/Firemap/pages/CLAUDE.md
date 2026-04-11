# Agent G — Pages Agent

## Role
Build the Next.js page shell: `_app.js`, `_document.js`, and `index.js` (the main page
that wires all components together with the shared reducer). Also owns the header bar
with logos and the mobile hamburger menu.

## Reads (do not modify)
- `contracts/events.js`          — Actions, initialState
- `projects/index.js`            — projects registry
- `theme/index.js`               — theme object
- All component exports (read their index.js to see signatures)

## Writes (owns these files)
- `pages/_app.js`
- `pages/_document.js`
- `pages/index.js`

## Must NOT touch
Everything outside `pages/`.

---

## Logo files (in public/)

| File                  | Use when         |
|-----------------------|------------------|
| `SDSS_brand.png`      | **Dark** mode — white/light text, transparent background |
| `SDSS_brand_white.png`| **Light** mode — dark text, transparent background |
| `LabLogo_light.png`   | **Dark** mode symbol — light lines on transparent bg |
| `LabLogo_border.png`  | **Light** mode symbol — dark lines on transparent bg |

Note: "dark" and "light" here refer to the app's color scheme, not the logo
filename suffix — double check the correct pairing above before using.

---

## pages/_app.js

Wrap in ThemeProvider + ColorModeProvider:

```js
import { ThemeProvider } from 'theme-ui'
import theme from '../theme/index.js'

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  )
}
```

---

## pages/_document.js

Standard Next.js `_document.js`. Set `<html lang="en">`.

---

## pages/index.js

### Layout structure

```
┌─────────────────────────────────────────────────┐
│  HEADER (56px, fixed)                           │
│  [☰ mobile] [LabLogo symbol] [SDSS wordmark]    │
│                              [☀/🌙 scheme toggle]│
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ SIDEBAR  │           MAP                        │
│ (280px)  │      (fills remaining space)         │
│          │                                      │
│          │  [detail panel, bottom-right]        │
│          │  [area stats panel, bottom-left]     │
└──────────┴──────────────────────────────────────┘
```

On mobile (< 768px): sidebar is hidden by default, shown as a full-width overlay
when the hamburger (☰) is tapped. **No animation — it appears/disappears instantly,
matching the CarbonPlan mobile pattern.**

### Header

Fixed top bar, 56px tall, `background: 'surface'`, `borderBottom: '1px solid border'`.

Contents (left to right):
1. **Hamburger button** — mobile only (`display: ['flex', 'none']`), dispatches
   nothing — toggles local `sidebarOpen` state
2. **Lab symbol** — `<img src="/LabLogo_light.png">` (dark mode) or
   `<img src="/LabLogo_border.png">` (light mode). Height: 36px.
3. **SDSS wordmark** — `<img src="/SDSS_brand.png">` (dark mode) or
   `<img src="/SDSS_brand_white.png">` (light mode). Height: 28px.
   Wrapped in an `<a href="https://sustainablesolutions.stanford.edu" target="_blank">`.
4. **Spacer** (flex: 1)
5. **Color scheme toggle button** — shows ☀ in dark mode, 🌙 in light mode.
   Uses Theme UI's `useColorMode` hook AND dispatches `TOGGLE_SCHEME`.

### Sidebar visibility

```js
const [sidebarOpen, setSidebarOpen] = useState(false)
```

Desktop: sidebar always visible (`display: 'block'`).
Mobile: `display: sidebarOpen ? 'block' : 'none'`.

When sidebarOpen on mobile: sidebar overlays the map full-width, z-index above map.
No animation — instant show/hide.

### Reducer

Handle all Actions from contracts/events.js. See contracts/events.js for the
full list — SET_LAYER, SET_DIMENSION, SELECT_CELL, DESELECT_CELL, SET_DRAWN_CIRCLE,
SET_AGGREGATE_STATS, SET_PERCENTILE, TOGGLE_AREA_TOOL, TOGGLE_SCHEME, TOGGLE_METHODS.

### Methods overlay

When `state.methodsOpen`:
- Render a full-screen overlay (z-index above sidebar and map)
- Inside: a close button (top-right), then dynamically import and render the project's
  methods MDX:
  ```js
  const MethodsMDX = dynamic(() => import(`../projects/${config.id}/methods.mdx`))
  ```
- Clicking the close button or outside dispatches TOGGLE_METHODS

### Map instance wiring

The Map component calls `onMapReady(map)` when initialized. Store this in a
`useRef` and pass it to `<AreaTool>`.

```js
const mapRef = useRef(null)
// ...
<Map onMapReady={(m) => { mapRef.current = m }} ... />
<AreaTool map={mapRef.current} ... />
```

---

## Done when
- [ ] Header renders with correct logo for current color scheme
- [ ] Logo switches correctly on color scheme toggle
- [ ] Desktop: sidebar always visible beside map
- [ ] Mobile: hamburger toggles sidebar overlay (instant, no animation)
- [ ] Color scheme toggle uses useColorMode + dispatches TOGGLE_SCHEME
- [ ] Reducer handles all Actions
- [ ] Methods overlay opens and closes
- [ ] Page title = project title
- [ ] Map instance passed to AreaTool via ref
