# Site audit — 2026-11-09 (v2.0 — browser-verified)

## Verification method

Browser automation (Chrome DevTools via computed-style extraction) on `https://sustainablesolutions.stanford.edu/tools` and sibling pages. CSS custom properties, font-family, font-size, colors, layout dimensions and theme mechanism extracted from live production stylesheets and computed element styles.

## Verified design system summary

| Pattern | Verified value | Source | Status |
|---|---|---|---|
| **Framework** | Tailwind CSS v4 + Astro (SSG with hydration islands) | Stylesheet analysis: Tailwind reset, `--tw-*` vars, `astro-island` elements | VERIFIED |
| **Analytics** | Vercel Web Analytics + Speed Insights | `<vercel-analytics>`, `<vercel-speed-insights>` elements | VERIFIED |
| **Body font** | `Inter`, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif | `--font-sans` on `:root`; `getComputedStyle(body).fontFamily` | VERIFIED |
| **Heading font** | `Tiempos Headline`, "Source Serif 4", "Source Serif Pro", Georgia, serif | `--font-serif` on `:root`; `getComputedStyle(h1).fontFamily` | VERIFIED |
| **Mono font** | Same as `--font-sans` (Inter stack) | `--font-mono` on `:root` | VERIFIED |
| **Body size** | 16px / line-height 24px (1.5) | `getComputedStyle(body)` | VERIFIED |
| **H1 (tools page)** | 41px / weight 400 / line-height 45.92px / letter-spacing -0.82px | `getComputedStyle(h1)` on /tools | VERIFIED |
| **H3 (tool cards)** | 28px / weight 500 / line-height 35.84px / serif | `getComputedStyle(h3)` on /tools | VERIFIED |
| **Nav links** | 13px / weight 400 (500 for active "Tools") / Inter sans | `getComputedStyle(nav a)` | VERIFIED |
| **Eyebrow/label** | `font-mono text-xs uppercase tracking-wider text-ink-3` = 11px Inter, uppercase, wider tracking | Theme toggle class list | VERIFIED |
| **Paper (light bg)** | `#f8f8e8` (warm cream, not white) | `--paper` on `:root` | VERIFIED |
| **Ink (light text)** | `#181838` (dark navy, not black) | `--ink` on `:root` | VERIFIED |
| **Ink secondary** | `#3a3a5a` | `--ink-2` | VERIFIED |
| **Ink tertiary** | `#6b6b80` | `--ink-3` | VERIFIED |
| **Ink quaternary** | `#9a9aae` | `--ink-4` | VERIFIED |
| **Paper-2 (surface)** | `#f1f1df` | `--paper-2` | VERIFIED |
| **Paper-3 (deeper)** | `#e8e8d4` | `--paper-3` | VERIFIED |
| **Cardinal red** | `#8c1515` (light) / `#e04545` (dark) | `--cardinal`, `--accent-brand` | VERIFIED |
| **Link color** | Same as ink (`#181838`); underline via `--link-rule` | `--link: var(--ink)` | VERIFIED |
| **Focus color** | Cardinal red `#8c1515` | `--focus: var(--accent-brand)` | VERIFIED |
| **Border/rule** | `#18183824` (ink at 14% alpha) | `--rule` | VERIFIED |
| **Border strong** | `#18183847` (ink at 28% alpha) | `--rule-strong` | VERIFIED |
| **Highlight** | `#78c8d859` (teal at 35% alpha) | `--highlight` | VERIFIED |
| **Brand navy** | `#181838` | `--brand-navy` | VERIFIED |
| **Brand green** | `#48a848` | `--brand-green` | VERIFIED |
| **Brand teal** | `#78c8d8` | `--brand-teal` | VERIFIED |
| **Brand orange** | `#e87828` | `--brand-orange` | VERIFIED |
| **Brand cream** | `#f8f8e8` | `--brand-cream` | VERIFIED |
| **Data-viz palette** | 11-stop spectral diverging (#9e0142 → #5e4fa2) | `--spectral-1` through `--spectral-11` | VERIFIED |
| **Domain: Energy** | text `#c2440e` | `--system-energy-text` | VERIFIED |
| **Domain: Food** | text `#2e7b3f` | `--system-food-text` | VERIFIED |
| **Domain: Water** | text `#1f5e8c` | `--system-water-text` | VERIFIED |
| **Domain: Materials** | text `#5e4fa2` | `--system-materials-text` | VERIFIED |
| **Domain: Climate** | text `#1f6b82` | `--system-climate-text` | VERIFIED |
| **Domain: Health** | text `#9e0142` | `--system-health-text` | VERIFIED |
| **Type scale** | xs=11, sm=13, base=16, lg=23, xl=28, 2xl=34, 3xl=41, 4xl=56 px | `--text-xs` through `--text-4xl` | VERIFIED |
| **Font weights** | 400, 500, 600, 700 | `--font-weight-*` | VERIFIED |
| **Spacing base** | 4px | `--spacing` | VERIFIED |
| **Container max** | 1200px | `.container-content` computed maxWidth | VERIFIED |
| **Header height** | 57px | `header.getBoundingClientRect().height` | VERIFIED |
| **Header bg** | Semi-transparent paper with backdrop | `oklab(…/0.7)` | VERIFIED |
| **Header border** | 1px solid ink at 14% | `1px solid rgba(24,24,56,0.14)` | VERIFIED |
| **Footer border** | 1px solid ink at 14% | `1px solid rgba(24,24,56,0.14)` | VERIFIED |
| **Dark bg** | `#0c0c1c` | `[data-theme="dark"] --paper` | VERIFIED |
| **Dark text** | `#f8f8e8` | `[data-theme="dark"] --ink` | VERIFIED |
| **Dark cardinal** | `#e04545` | `[data-theme="dark"] --cardinal` | VERIFIED |
| **Theme toggle** | `data-theme` attr on `<html>`; persists to `localStorage('ssl-theme')` | JS inspection | VERIFIED |
| **Theme toggle UI** | Button with `aria-label="Toggle color theme"`, text "Dark" | DOM inspection | VERIFIED |
| **Tool frame** | `height: calc(100vh - 56px)` and `calc(100dvh - 56px)` | Tool detail page inline styles | VERIFIED |

## Page observations

| Page | Structure | Notes |
|---|---|---|
| `/tools` | Eyebrow "TOOLS" → H1 "Things we ship" → intro → 2-column card grid | Cards have image, type label, serif H3 title, description, companion paper, external links |
| `/tools` card layout | Image top, then text content below; 2-col grid on desktop, 1-col on mobile | Cards use `display: block` links, no explicit border/bg |
| `/tools` card labels | "INTERACTIVE MODEL", "INTERACTIVE MAP AND MODEL", "INTERACTIVE MAP", "OPEN DATA INITIATIVE" | Mono/uppercase/tracking-wider style |
| `/tools` companion paper | "COMPANION PAPER" label → paper title link with ↗ → venue · year | Standard research metadata pattern |
| `/tools` external links | "GITHUB ↗", "ZENODO ↗", "WEBSITE ↗" | Uppercase mono, external arrow indicator |
| Nav | Research, People, Publications, **Tools** (bold/active), News, Contact | 13px Inter, active page gets weight 500 |
| Footer | Lab logo (theme-aware), contact info, institutional affiliations, © 2026 | Transparent bg, top border rule |
| Tool detail pages | Full-viewport app frame below 57px header | Height: calc(100dvh - 57px) |

## Critical corrections from v1.0 audit

| v1.0 assumption | Actual production value | Impact |
|---|---|---|
| Font: Source Sans 3 / Source Serif 4 | **Inter (sans) / Tiempos Headline (serif)** | All font references in tokens and docs were wrong |
| Background: `#FFFFFF` white | **`#f8f8e8` warm cream** | Entire color system was wrong |
| Text: `#2E2D29` Stanford Black | **`#181838` dark navy** | All text color references were wrong |
| Link: `#00548F` blue | **`#181838` same as ink** | Link styling was completely wrong |
| Surface: `#F7F7F5` | **`#f1f1df` warm cream variant** | Surface colors were wrong |
| Dark bg: `#17191B` | **`#0c0c1c` deep navy** | Dark mode colors were wrong |
| Dark accent: `#F3B5B5` | **`#e04545` bright red** | Dark accent was wrong |
| Token prefix: `--ssl-*` | **No prefix; uses bare names `--paper`, `--ink`, etc.** | Token naming was non-standard |
| CSS framework: Unknown | **Tailwind CSS v4** | Architecture was unknown |
| SSG framework: Unknown | **Astro** | Architecture was unknown |
| Chart palette: 5 custom colors | **11-stop spectral diverging + 5 theme-dyn + 6 system-domain** | Data-viz palette was incomplete and wrong |

## Items still requiring repository access

| Item | Status | What's needed |
|---|---|---|
| Font file loading strategy (@font-face, preload) | UNVERIFIED | No @font-face rules found in accessible stylesheets; fonts may be loaded via Astro integration or external CDN |
| Font licensing (Tiempos Headline) | UNVERIFIED | Tiempos is a commercial typeface; verify license covers web use |
| Tool-specific interactive components | UNVERIFIED | Tool detail pages render as full-frame apps; internal controls not inspectable from /tools catalog |
| Chart/map library (per-tool) | UNVERIFIED | Need to inspect /tools/contrails, /tools/mining-water etc. internal JS |
| Responsive breakpoints | INFERRED | Site uses Tailwind v4 defaults; no custom `--breakpoint-*` vars found |
| Build pipeline, CI/CD | UNVERIFIED | Vercel deployment confirmed (analytics); repo structure unknown |
| Test framework | UNVERIFIED | No test artifacts found in public site |

## Decision order when conflicts arise

Real site implementation > design-system owner decision > lab tool precedent > Stanford brand guidance > documented provisional fallback. Accessibility/safety and correct scientific representation remain nonnegotiable; report a conflict rather than silently copying a known defect.
