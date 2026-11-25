# Architecture, token governance, testing, migrations and handoff

## Source-verified stack (2026-11-09)

Verified from the project repository `Sustainable-Solutions-Lab/SustainableSolutions`.

| Layer | Technology | Source | Status |
|---|---|---|---|
| **Static site generator** | Astro 5.x | `astro.config.mjs` | SOURCE-VERIFIED |
| **CSS framework** | Tailwind CSS v4 | `@tailwindcss/vite` plugin, `@import 'tailwindcss'` in global.css | SOURCE-VERIFIED |
| **UI islands** | React 18 via `@astrojs/react` | `package.json`, `client:only="react"` in pages | SOURCE-VERIFIED |
| **Content** | MDX via `@astrojs/mdx` | `astro.config.mjs` | SOURCE-VERIFIED |
| **Sitemap** | `@astrojs/sitemap` | `astro.config.mjs` | SOURCE-VERIFIED |
| **Design tokens** | CSS custom properties in `src/styles/colors_and_type.css` | `:root` + `[data-theme="dark"]` | SOURCE-VERIFIED |
| **Tailwind bridge** | `@theme inline` + `@theme` in `src/styles/global.css` | Maps CSS vars → utility classes | SOURCE-VERIFIED |
| **Font loading** | Google Fonts `<link>` in `BaseLayout.astro` | Inter (400/500/600/700) + Source Serif 4 (300–900) | SOURCE-VERIFIED |
| **Serif stack note** | Tiempos Headline listed first but `@font-face` is **commented out** | Not licensed; Source Serif 4 is the rendered font | SOURCE-VERIFIED |
| **Theme system** | `data-theme` attribute on `<html>`; `localStorage('ssl-theme')`; `prefers-color-scheme` fallback | Inline `<script>` in BaseLayout.astro | SOURCE-VERIFIED |
| **Charting** | D3 (array, contour, geo, hierarchy, scale, chromatic, selection, shape) | `package.json` | SOURCE-VERIFIED |
| **Mapping** | MapLibre GL JS + PMTiles (protomaps) | `package.json` | SOURCE-VERIFIED |
| **Geospatial** | Turf.js (area, bbox, boolean-point-in-polygon), TopoJSON, world-atlas | `package.json` | SOURCE-VERIFIED |
| **State management** | Zustand 5.x | `package.json` | SOURCE-VERIFIED |
| **Icons** | Lucide React | `package.json` | SOURCE-VERIFIED |
| **Analytics** | Vercel Web Analytics + Speed Insights | `BaseLayout.astro` | SOURCE-VERIFIED |
| **Deployment** | Vercel | `vercel.json` + Vercel analytics components | SOURCE-VERIFIED |
| **Serverless** | Python function: `api/contrails.py` | `vercel.json` | SOURCE-VERIFIED |
| **Build scripts** | `fetch-sheets.js`, `fetch-external-pubs.js`, `fetch-github.js`, `fetch-magnet-grid.js`, `build-materials.js` | `package.json` scripts | SOURCE-VERIFIED |
| **Content source** | Google Sheets (published CSV) fetched at build time | `package.json` prebuild | SOURCE-VERIFIED |
| **Testing** | puppeteer-core (devDependency) | `package.json` | SOURCE-VERIFIED |

## CSS architecture

```
src/styles/global.css
  ├── @import 'tailwindcss'              ← Tailwind v4 engine
  ├── @import './colors_and_type.css' layer(base)  ← design tokens + typography
  ├── @theme inline { ... }              ← live CSS var → Tailwind utility bridge
  ├── @theme { ... }                     ← static values (text scale, spacing, radii)
  └── local overrides                    ← containers, rules, transitions
```

The `layer(base)` import ensures design system element styles (heading margins, link underlines) sit below Tailwind utilities in the cascade, so utility classes like `m-0` override them.

## How tools integrate with the site shell

### Page-level: ToolFrame.astro

- Extends `BaseLayout.astro` with `hideFooter={true}`
- Disables body scroll (`overflow: hidden`)
- Tool frame: `calc(100dvh - 56px)` (dvh for iOS Safari URL bar)
- Fallback: `calc(100vh - 56px)`
- Sizes `astro-island` wrapper to `width/height: 100%`

### In-tool: ToolShell.tsx (`src/tools/_shell/`)

- Desktop: left rail (300px) beside main area
- Mobile (<768px): compact header with Show/Hide Controls drawer
- Z-stack: header 30 > drawer 21 > scrim 20 > in-map overlays 10
- `busy` prop shows animated lab mark overlay (never add a second spinner)
- `BusyOverlay` importable separately for tools with custom z-order needs

### Tool architecture (three kinds)

| Folder | Kind | Description |
|---|---|---|
| `_engine/` | **engine** | Reusable config-driven data-explorer (charts/store/ui/data) |
| `_map/` | **engine** | Reusable config-driven MapLibre/PMTiles map (grew from firemap, extracted 2026-09) |
| `_shell/` | **shell** | Standard tool chrome (ToolShell.tsx + BusyOverlay) |
| `firemap/` | config → `_map` | Firefuels: fuel-treatment cost/benefit |
| `just-air/` | config → `_map` | Just Air: net-zero air quality / mortality |
| `food-emissions/` | config → `_map` | Food Emissions: global cropland-management GHGs |
| `materials/` | config → `_engine` | Global material flows (Busch et al.) |
| `magnets/` | bespoke | US rare-earth-magnet supply-chain explorer |
| `mining-water/` | bespoke | Water stress from mining battery minerals (MapLibre + GeoJSON) |
| `contrails/` | bespoke | Booking-time contrail predictor (SVG great-circle map + Duffel API) |
| `ncs-tea/` | bespoke | Technoeconomics of nature-based climate solutions (unlisted) |
| `forest-accounting/` | bespoke | Forest carbon accounting rules (unlisted) |
| `ai-labor/` | bespoke | AI and labor (unlisted) |
| `refinery/` | bespoke | Refinery tool (unlisted) |

### Adding a new tool

Three files, usually no shared code changes:
1. `src/tools/<slug>/` — tool code (config for engine, or bespoke component tree)
2. `src/pages/tools/<slug>.astro` — page wrapping tool in `ToolFrame` with `client:only="react"`
3. A row in the Tools Google Sheet (set `unlisted` TRUE while building)

## CSS token naming: dual conventions

The source CSS (`colors_and_type.css`) uses `--t-*` prefix for the type scale:
```css
--t-xs: 11px;  --t-sm: 13px;  --t-base: 16px;  /* etc. */
```

The Tailwind `@theme` bridge (`global.css`) maps to Tailwind's `--text-*`:
```css
@theme { --text-xs: 11px;  --text-sm: 13px;  /* etc. */ }
```

Both naming conventions are valid. Use `--t-*` when writing raw CSS; use Tailwind `text-*` utilities in component markup.

## Recommended layers

1. **Tokens** (`tokens/`): CSS custom properties matching production names. JSON mirror for tooling. Schema validation.
2. **Tailwind bridge** (`global.css` @theme): Maps CSS vars to utility classes. `@theme inline` for live-switching values; `@theme` for static.
3. **Astro layouts** (`src/layouts/`): `BaseLayout.astro` (full page) and `ToolFrame.astro` (full-viewport tool frame).
4. **Astro components** (`src/components/`): Nav, Footer, CoordReadout, etc.
5. **Tool engines** (`src/tools/_engine/`, `src/tools/_map/`): Reusable chart/map infrastructure.
6. **Tool shell** (`src/tools/_shell/`): Standard tool chrome (ToolShell + BusyOverlay).
7. **Tool-specific code** (`src/tools/<slug>/`): React islands consuming CSS custom properties.

## Component API conventions

- **Tailwind-first**: Components use utility classes (e.g., `font-mono text-xs uppercase tracking-wider text-ink-3`).
- **Token contract**: All tool-internal colors use CSS custom properties, never hex literals. Hard-coded colors break dark mode silently.
- Wrap in `ToolShell` rather than rebuilding rail/drawer layout.
- Use `busy` prop for anything taking >1 second (shows animated lab mark).
- Hover-driven interactions need tap equivalents (hover never fires on touch).
- Bottom-anchored overlays sit ~55px up on mobile to clear iOS Safari URL bar.
- Headings inside tools need explicit inline font sizes (design system's bare heading styles beat Tailwind's layered utilities).

## File conventions / versioning

- Token files carry explicit `status` field (`SOURCE_VERIFIED` or `PROPOSED`).
- The source CSS is `src/styles/colors_and_type.css`; skill tokens must match it.
- Semantic versioning for skill and components. Breaking visual token changes require migration guidance.
- ADR entries in `references/decisions-and-exceptions.md` when departing from shared patterns.

## Token governance

| Action | Owner | Process |
|---|---|---|
| Add PROPOSED token | Skill maintainer | Add to tokens file with PROPOSED status; document rationale in ADR |
| Promote PROPOSED → VERIFIED | Site owner | Match against `colors_and_type.css`; update status |
| Change VERIFIED token | Site owner | Update `colors_and_type.css`; update skill tokens to match |
| Deprecate token | Site owner + skill maintainer | Add migration note; keep old name as alias for one version |

## Visual regression plan

- Snapshot catalog, baseline tool page, model inputs/results, plot, map, media, bibliography, dark mode and 4 responsive widths.
- Use puppeteer-core (already a devDependency) for headless screenshots.
- Stabilize data/time/tile responses via fixtures and deterministic mocks.
- Use animation-disabled (`prefers-reduced-motion: reduce`) and consistent fonts/test browser.
- Compare against production screenshots.

## Documentation in each PR

Change summary; user goal; route and shared components used; before/after screenshots; verified source values; open assumptions; accessibility notes; scientific accuracy sign-off; credit/license evidence; manual QA and automated test outcomes; performance impact; deployment/rollback notes; unresolved tickets.
