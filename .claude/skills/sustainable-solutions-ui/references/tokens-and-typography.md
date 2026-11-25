# Tokens, typography, layout and themes

**Status:** v2.0 -- browser-verified 2026-11-09. Values marked **VERIFIED** were extracted from computed styles on `https://sustainablesolutions.stanford.edu/tools` and sibling pages using Chrome DevTools. Values marked **PROPOSED** are design-system candidates requiring owner approval before production use. Values marked **INFERRED** are derived from verified observations but not directly confirmed in source.

---

## 1. Token hierarchy

The production site uses bare CSS custom-property names (no `--ssl-` prefix). Tokens are organized into three tiers with a proposed fourth.

### Reference primitives (VERIFIED)

Immutable brand and palette values. These never change between themes; semantic aliases select from them.

| Token | Value | Purpose |
|---|---|---|
| `--brand-navy` | `#181838` | Lab primary brand color |
| `--brand-green` | `#48a848` | Lab secondary -- sustainability |
| `--brand-teal` | `#78c8d8` | Lab secondary -- water/climate |
| `--brand-orange` | `#e87828` | Lab secondary -- energy/warmth |
| `--brand-cream` | `#f8f8e8` | Lab secondary -- warm neutral |
| `--cardinal` | `#8c1515` (light) / `#e04545` (dark) | Stanford institutional red |
| `--spectral-1` through `--spectral-11` | See section 6 | 11-stop diverging data palette |

### Semantic aliases (VERIFIED)

Theme-aware tokens that resolve to different values in light and dark modes.

| Token | Light value | Dark value | Role |
|---|---|---|---|
| `--paper` | `#f8f8e8` | `#0c0c1c` | Page background |
| `--paper-2` | `#f1f1df` | `#14142a` | Surface / card background |
| `--paper-3` | `#e8e8d4` | `#1c1c36` | Deeper surface / inset |
| `--ink` | `#181838` | `#f8f8e8` | Primary text |
| `--ink-2` | `#3a3a5a` | `#c8c8d8` | Secondary text |
| `--ink-3` | `#6b6b80` | `#9a9ab0` | Tertiary text / labels |
| `--ink-4` | `#9a9aae` | `#686880` | Disabled / placeholder |
| `--rule` | `#18183824` | `#f8f8e824` | Border (ink at 14% alpha) |
| `--rule-strong` | `#18183847` | `#f8f8e847` | Border emphasis (ink at 28% alpha) |
| `--highlight` | `#78c8d859` | `#78c8d859` | Selection / teal tint (35% alpha) |
| `--link` | `var(--ink)` | `var(--ink)` | Link text (same as body text) |
| `--accent` / `--accent-brand` | `#8c1515` | `#e04545` | Accent / Cardinal red |
| `--focus` | `var(--accent-brand)` | `var(--accent-brand)` | Focus ring color |

### Component tokens (PROPOSED -- not yet in production)

Proposed scoped tokens for reusable components. These would alias semantic tokens to component-specific roles.

| Proposed token | Resolves to | Component |
|---|---|---|
| `--card-bg` | `var(--paper)` | Tool card background |
| `--card-border` | `var(--rule)` | Tool card border |
| `--card-title-color` | `var(--ink)` | Card title text |
| `--toolbar-height` | `57px` | Site header / toolbar |
| `--toolbar-bg` | `oklab(.../0.7)` | Header semi-transparent bg |
| `--input-border` | `var(--rule-strong)` | Form input borders |
| `--input-focus` | `var(--focus)` | Form input focus ring |
| `--chart-grid` | `var(--rule)` | Chart gridline color |
| `--legend-gap` | `var(--spacing) * 3` | Legend item spacing |

Component tokens are **PROPOSED** and must be approved by the design-system owner before adoption.

---

## 2. Typography

### Font stacks (VERIFIED)

| Token | Stack | Usage |
|---|---|---|
| `--font-sans` | `Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif` | Body text, UI, navigation |
| `--font-serif` | `Tiempos Headline, "Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif` | Headings (H1, H3 card titles) |
| `--font-mono` | Same as `--font-sans` (Inter stack) | Eyebrow labels -- uppercase + tracking |

**NOTE:** Tiempos Headline is a commercial typeface designed by Kris Sowersby, published by Klim Type Foundry. Verify that the web license covers this deployment. No `@font-face` rules were found in publicly accessible stylesheets; the font may be loaded via Astro integration, a private CDN, or a self-hosted configuration not visible from the public page source.

### Type scale (VERIFIED)

All values extracted from `--text-xs` through `--text-4xl` custom properties.

| Step | Token | Size (px) | Typical line-height | Ratio to base |
|---|---|---|---|---|
| xs | `--text-xs` | 11 | ~1.45 | 0.6875 |
| sm | `--text-sm` | 13 | ~1.4 | 0.8125 |
| base | `--text-base` | 16 | 1.5 (24px) | 1.0 |
| lg | `--text-lg` | 23 | ~1.35 | 1.4375 |
| xl | `--text-xl` | 28 | ~1.28 (35.84px) | 1.75 |
| 2xl | `--text-2xl` | 34 | ~1.24 | 2.125 |
| 3xl | `--text-3xl` | 41 | ~1.12 (45.92px) | 2.5625 |
| 4xl | `--text-4xl` | 56 | ~1.08 | 3.5 |

The scale is not a strict mathematical ratio. Steps were individually tuned.

### Font weights (VERIFIED)

| Token | Value | Usage |
|---|---|---|
| `--font-weight-normal` | 400 | Body text, headings, inactive nav |
| `--font-weight-medium` | 500 | Card titles (H3), active nav link |
| `--font-weight-semibold` | 600 | Emphasis, button labels (INFERRED) |
| `--font-weight-bold` | 700 | Strong emphasis (INFERRED) |

### Verified typographic specimens

| Element | Page | Size | Weight | Family | Letter-spacing | Line-height | Status |
|---|---|---|---|---|---|---|---|
| H1 | `/tools` | 41px (`text-3xl`) | 400 | serif (`--font-serif`) | -0.82px | 45.92px (~1.12) | VERIFIED |
| H3 tool card title | `/tools` | 28px (`text-xl`) | 500 | serif (`--font-serif`) | normal | 35.84px (~1.28) | VERIFIED |
| Nav links | header | 13px (`text-sm`) | 400 (500 for active) | sans (`--font-sans`) | normal | computed | VERIFIED |
| Eyebrow / label | tool cards | 11px (`text-xs`) | 400 | mono/sans (`--font-mono`) | wider (`tracking-wider`) | computed | VERIFIED |
| Body text | all pages | 16px (`text-base`) | 400 | sans (`--font-sans`) | normal | 24px (1.5) | VERIFIED |
| Eyebrow color | tool cards | -- | -- | -- | -- | -- | `ink-3` (`#6b6b80` light / `#9a9ab0` dark) VERIFIED |

### Tailwind utility class mapping (VERIFIED)

Eyebrow/label classes observed: `font-mono text-xs uppercase tracking-wider text-ink-3`. The `font-mono` class maps to `--font-mono`, which is the Inter sans stack -- there is no distinct monospace typeface in use; the monospace treatment is achieved purely through uppercase transformation and wider letter-spacing.

---

## 3. Layout

### Spacing and dimensions (VERIFIED)

| Property | Token / selector | Value | Status |
|---|---|---|---|
| Spacing base | `--spacing` | 4px | VERIFIED |
| Container max-width | `.container-content` | 1200px | VERIFIED |
| Header height | `header` element | 57px | VERIFIED |
| Header background | `header` | `oklab(.../0.7)` -- semi-transparent paper with backdrop blur | VERIFIED |
| Header border | `header` | `1px solid rgba(24,24,56,0.14)` | VERIFIED |
| Footer border | `footer` | `1px solid rgba(24,24,56,0.14)` | VERIFIED |
| Tool frame height | tool detail pages | `calc(100vh - 57px)` and `calc(100dvh - 57px)` | VERIFIED |

### Spacing scale (INFERRED from 4px base)

The site uses Tailwind CSS v4 default spacing, which derives from the 4px base unit:

```
4  8  12  16  20  24  32  40  48  64  80  96  128  160  192  224  256 px
1  2  3   4   5   6   8   10  12  16  20  24  32   40   48   56   64  (multiplier)
```

### Framework (VERIFIED)

- **CSS framework:** Tailwind CSS v4 -- utility-first classes, not traditional component CSS
- **SSG framework:** Astro (static site generation with hydration islands)
- **Deployment:** Vercel (confirmed via `<vercel-analytics>` and `<vercel-speed-insights>` elements)
- **Responsive:** Tailwind v4 default breakpoints (no custom `--breakpoint-*` variables found); INFERRED

### Grid and content (VERIFIED from page observation)

- `/tools` catalog uses a 2-column card grid on desktop, 1-column on mobile
- Cards use `display: block` links with no explicit border or background color
- Tool detail pages render as full-viewport app frames below the 57px header
- Content max-width of 1200px constrains the main content area

---

## 4. Colors -- light mode (VERIFIED)

All values extracted from CSS custom properties on `:root`.

### Paper (backgrounds)

| Token | Hex | Description |
|---|---|---|
| `--paper` | `#f8f8e8` | Page background -- warm cream, not white |
| `--paper-2` | `#f1f1df` | Surface / card background |
| `--paper-3` | `#e8e8d4` | Deeper inset / well background |

### Ink (text)

| Token | Hex | Description |
|---|---|---|
| `--ink` | `#181838` | Primary text -- dark navy, not black |
| `--ink-2` | `#3a3a5a` | Secondary text |
| `--ink-3` | `#6b6b80` | Tertiary / labels / eyebrows |
| `--ink-4` | `#9a9aae` | Disabled / placeholder / decorative |

### Accent and interactive

| Token | Hex | Description |
|---|---|---|
| `--cardinal` / `--accent-brand` | `#8c1515` | Stanford Cardinal Red -- accent, focus rings |
| `--focus` | `var(--accent-brand)` = `#8c1515` | Focus ring color |
| `--link` | `var(--ink)` = `#181838` | Link text color -- same as ink, NOT blue |
| `--link-rule` | underline via `--rule-strong` | Links are distinguished by underline, not color |

### Borders and decoration

| Token | Hex | Description |
|---|---|---|
| `--rule` | `#18183824` | Default border (ink at ~14% alpha) |
| `--rule-strong` | `#18183847` | Emphasized border (ink at ~28% alpha) |
| `--highlight` | `#78c8d859` | Selection highlight (teal at ~35% alpha) |

### Brand palette

| Token | Hex | Name |
|---|---|---|
| `--brand-navy` | `#181838` | Navy |
| `--brand-green` | `#48a848` | Green |
| `--brand-teal` | `#78c8d8` | Teal |
| `--brand-orange` | `#e87828` | Orange |
| `--brand-cream` | `#f8f8e8` | Cream |

---

## 5. Colors -- dark mode (VERIFIED)

Applied via `[data-theme="dark"]` selector on the `<html>` element.

### Paper (backgrounds)

| Token | Hex | Description |
|---|---|---|
| `--paper` | `#0c0c1c` | Deep navy background |
| `--paper-2` | `#14142a` | Elevated surface |
| `--paper-3` | `#1c1c36` | Deeper surface / inset |

### Ink (text)

| Token | Hex | Description |
|---|---|---|
| `--ink` | `#f8f8e8` | Primary text -- warm cream on dark |
| `--ink-2` | `#c8c8d8` | Secondary text |
| `--ink-3` | `#9a9ab0` | Tertiary / labels |
| `--ink-4` | `#686880` | Disabled / placeholder |

### Accent and borders

| Token | Hex | Description |
|---|---|---|
| `--cardinal` / `--accent-brand` | `#e04545` | Brighter red for dark backgrounds |
| `--rule` | `#f8f8e824` | Border (cream-ink at ~14% alpha) |
| `--rule-strong` | `#f8f8e847` | Emphasized border (cream-ink at ~28% alpha) |

---

## 6. Data visualization palette (VERIFIED)

### Spectral diverging -- 11 stops

Extracted from `--spectral-1` through `--spectral-11`. This is a perceptually ordered diverging palette suitable for signed-difference data (e.g. temperature anomaly, change from baseline).

| Token | Hex | Position |
|---|---|---|
| `--spectral-1` | `#9e0142` | Extreme negative (magenta-red) |
| `--spectral-2` | `#d53e4f` | Strong negative (red) |
| `--spectral-3` | `#f46d43` | Moderate negative (orange-red) |
| `--spectral-4` | `#fdae61` | Mild negative (orange) |
| `--spectral-5` | `#fee08b` | Slight negative (yellow) |
| `--spectral-6` | `#ffffbf` | Neutral midpoint (pale yellow) |
| `--spectral-7` | `#e6f598` | Slight positive (yellow-green) |
| `--spectral-8` | `#abdda4` | Mild positive (green) |
| `--spectral-9` | `#66c2a5` | Moderate positive (teal-green) |
| `--spectral-10` | `#3288bd` | Strong positive (blue) |
| `--spectral-11` | `#5e4fa2` | Extreme positive (purple) |

### Dynamic theme colors (VERIFIED)

Five dynamically assigned chart colors for general-purpose categorical or sequential use:

- `--theme-dyn-1` through `--theme-dyn-5`

These resolve to theme-appropriate values in light and dark modes.

### Research domain colors (VERIFIED)

Six domain-specific colors with text variants for labeling research areas:

| Domain | Text color token | Verified text hex |
|---|---|---|
| Energy | `--system-energy-text` | `#c2440e` |
| Food | `--system-food-text` | `#2e7b3f` |
| Water | `--system-water-text` | `#1f5e8c` |
| Materials | `--system-materials-text` | `#5e4fa2` |
| Climate | `--system-climate-text` | `#1f6b82` |
| Health | `--system-health-text` | `#9e0142` |

Each domain also has light and dark background variants (e.g. `--system-energy-light`, `--system-energy-dark`); exact hex values for background variants require repository inspection.

### Palette application guidance

| Data type | Palette | Notes |
|---|---|---|
| Sequential magnitude | Subset of spectral (single hue ramp) or sequential custom | Light-to-dark, perceptually uniform |
| Diverging (signed) | Full 11-stop spectral | Neutral midpoint at zero or meaningful center |
| Categorical (unordered) | `--theme-dyn-*` or domain colors | Max 5--7 distinct hues; supplement with patterns/shapes |
| Domain identification | `--system-{domain}-text` | Use with domain label; do not rely on color alone |
| Missing / no data | Distinct from all palette stops | Use hatching, gray, or explicit "no data" legend entry |

---

## 7. Theme system (VERIFIED)

### Mechanism

| Aspect | Implementation | Status |
|---|---|---|
| Attribute | `data-theme` on `<html>` element | VERIFIED |
| Persistence | `localStorage` key `'ssl-theme'` | VERIFIED |
| Fallback | `prefers-color-scheme: dark` media query | VERIFIED |
| Toggle button | `aria-label="Toggle color theme"` | VERIFIED |
| Toggle label text | `"Dark"` (when in light mode) / `"Light"` (when in dark mode) | VERIFIED |
| Toggle classes | `font-mono text-xs uppercase tracking-wider text-ink-3` | VERIFIED |

### Theme switching behavior (INFERRED)

1. On page load, check `localStorage('ssl-theme')` for a stored preference.
2. If no stored preference, check `prefers-color-scheme: dark` system setting.
3. Apply the resolved theme by setting `data-theme="light"` or `data-theme="dark"` on `<html>`.
4. When the toggle button is clicked, flip the theme and persist the new value to `localStorage`.

### Authoring rules

- All semantic tokens must have both light and dark values defined.
- Never hard-code hex colors in component markup; always reference semantic tokens.
- Test all new components in both themes before merging.
- Dark mode is independently tuned -- not a mechanical inversion. Background, surface, text, links, chart grids, shadows, and data-viz colors are all adjusted for legibility on dark surfaces.
- Do not invert satellite imagery, photographs, or raster map tiles for dark mode.

---

## 8. Contrast notes (VERIFIED pairings)

### Light mode

| Foreground | Background | Pairing | Approximate ratio | Notes |
|---|---|---|---|---|
| `--ink` `#181838` | `--paper` `#f8f8e8` | Primary text on bg | High (well above 7:1) | Passes AAA for normal text |
| `--ink-2` `#3a3a5a` | `--paper` `#f8f8e8` | Secondary text on bg | High (above 4.5:1) | Passes AA for normal text |
| `--ink-3` `#6b6b80` | `--paper` `#f8f8e8` | Tertiary text on bg | Check for 4.5:1 minimum | Use only for large text or non-essential labels if below 4.5:1 |
| `--ink-4` `#9a9aae` | `--paper` `#f8f8e8` | Disabled/placeholder | Likely below 4.5:1 | Acceptable only for disabled states per WCAG |
| `--cardinal` `#8c1515` | `--paper` `#f8f8e8` | Accent on bg | Check contrast | May need pairing adjustments for small text |
| `--brand-green` `#48a848` | `--paper` `#f8f8e8` | Green on cream | Check contrast | Green on warm cream may be marginal |

### Dark mode

| Foreground | Background | Pairing | Approximate ratio | Notes |
|---|---|---|---|---|
| `--ink` `#f8f8e8` | `--paper` `#0c0c1c` | Primary text on bg | High (well above 7:1) | Passes AAA for normal text |
| `--ink-2` `#c8c8d8` | `--paper` `#0c0c1c` | Secondary text on bg | High (above 4.5:1) | Passes AA for normal text |
| `--ink-3` `#9a9ab0` | `--paper` `#0c0c1c` | Tertiary text on bg | Check for 4.5:1 minimum | Verify with contrast checker |
| `--cardinal` `#e04545` | `--paper` `#0c0c1c` | Dark accent on bg | Check contrast | Brighter red improves dark-mode legibility |

### Verification requirements

- Verify all "Check contrast" pairings with a WCAG 2.x contrast calculator before using for normal-sized body text (requires >= 4.5:1 for AA).
- Large text (>= 18pt regular or >= 14pt bold) requires >= 3:1.
- Non-text UI components (borders, icons, focus rings) require >= 3:1 against adjacent colors.
- Never rely solely on color to convey meaning; supplement with text labels, patterns, or icons.

---

## 9. Migration map from v1.0 candidate tokens

The v1.0 skill used a `--ssl-*` prefixed token system that did not match production. The table below maps old candidate names to verified production equivalents.

| v1.0 candidate | Production token | Semantic alias | Notes |
|---|---|---|---|
| `--ssl-bg` | `--paper` | `--bg` (if aliased) | Warm cream `#f8f8e8`, not white |
| `--ssl-surface` | `--paper-2` | `--bg-alt` (if aliased) | `#f1f1df`, not `#F7F7F5` |
| `--ssl-ink` | `--ink` | `--fg` (if aliased) | Dark navy `#181838`, not Stanford Black |
| `--ssl-muted` | `--ink-3` | `--fg-3` (if aliased) | `#6b6b80`, not a gray |
| `--ssl-border` | `--rule` | -- | Alpha-based `#18183824`, not opaque |
| `--ssl-link` | `--link` = `var(--ink)` | -- | Same as ink, NOT blue; underline-distinguished |
| `--ssl-accent` | `--cardinal` / `--accent-brand` | `--accent` (if aliased) | `#8c1515` in light, `#e04545` in dark |
| `--ssl-focus` | `--focus` = `var(--accent-brand)` | -- | Cardinal red for focus rings |
| `--ssl-danger` | (no direct equivalent found) | -- | PROPOSED: use `--cardinal` or define separately |
| `--ssl-positive` | (no direct equivalent found) | -- | PROPOSED: use `--brand-green` or define separately |
| `--ssl-chart-1` through `--ssl-chart-5` | `--spectral-*` or `--theme-dyn-*` | -- | 11-stop spectral replaces 5-color candidate |
| `--ssl-card-pad` | (not in production) | -- | PROPOSED component token |
| `--ssl-toolbar-height` | Header = 57px | -- | No named token; measured from element |

### Key migration corrections

1. **Prefix removed.** The `--ssl-*` prefix is not used in production. All tokens use bare names: `--paper`, `--ink`, `--rule`, etc.
2. **Font families wrong.** v1.0 assumed Source Sans 3 / Source Serif 4. Production uses Inter (sans) / Tiempos Headline (serif).
3. **Background wrong.** v1.0 assumed white `#FFFFFF`. Production is warm cream `#f8f8e8`.
4. **Text color wrong.** v1.0 assumed Stanford Black `#2E2D29`. Production is dark navy `#181838`.
5. **Link color wrong.** v1.0 assumed Digital Blue `#00548F`. Production links are ink-colored `#181838` with underline.
6. **Dark mode wrong.** v1.0 assumed `#17191B` background. Production is `#0c0c1c` deep navy.
7. **Chart palette wrong.** v1.0 had 5 arbitrary colors. Production has an 11-stop spectral diverging palette plus 5 dynamic theme colors and 6 domain-specific colors.

---

## Disclaimers

- **VERIFIED** values were extracted from browser computed styles on `https://sustainablesolutions.stanford.edu/tools` and related pages on 2026-11-09. They reflect the production site at the time of inspection.
- **PROPOSED** values (component tokens, missing semantic tokens) are design-system candidates that require review and approval by the lab's design-system owner before production use.
- **INFERRED** values are logically derived from verified observations but were not directly confirmed in source code or computed styles.
- Font licensing, `@font-face` loading strategy, responsive breakpoint customization, and per-tool internal component styles remain **UNVERIFIED** and require repository access.
- This document should be re-verified whenever the production site's CSS is updated. Treat the live site as the single source of truth; this reference is a snapshot, not a specification.

### Decision order when conflicts arise

Real site implementation > design-system owner decision > lab tool precedent > Stanford brand guidance > documented provisional fallback. Accessibility/safety and correct scientific representation remain nonnegotiable; report a conflict rather than silently copying a known defect.
