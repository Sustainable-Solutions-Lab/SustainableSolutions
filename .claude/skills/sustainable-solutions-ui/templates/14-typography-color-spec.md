# Template — Typography, color and graphic design specification

> Fill by inspecting **the lab's live computed styles** and repo. The values below are proposals until verified. Do not present them as a pixel-perfect copy of the site.

## Typography token inventory

| Role | CSS token / semantic name | Proposed font | Proposed range | Behavior | Verified website selector |
|---|---|---|---|---|---|
| Display / H1 | `--ssl-font-display`, `--ssl-text-h1` | Inherit lab heading stack; fallback Source Serif 4 | `clamp(2rem,4vw,3.75rem)` | heading line-height 1.1–1.2, wrap naturally | TBD |
| H2 | `--ssl-text-h2` | Confirmed heading stack | `clamp(1.5rem,2.8vw,2.5rem)` | sentence case | TBD |
| H3 | `--ssl-text-h3` | Confirmed UI stack | `clamp(1.2rem,2vw,1.65rem)` | semantic nesting | TBD |
| Body | `--ssl-font-ui`, `--ssl-text-body` | Inherit lab UI stack; fallback Source Sans 3 | `1rem–1.125rem` | line-height 1.5–1.7; maximum ~70ch | TBD |
| Data / axis | `--ssl-font-mono`, `--ssl-text-data` | Site stack; tabular figures | `0.875–1rem` | never force unreadably small labels | TBD |
| Eyebrow | `--ssl-text-eyebrow` | Confirmed UI stack | `0.75–0.875rem` | uppercase only if existing site does | TBD |
| Caption/source | `--ssl-text-caption` | Confirmed UI stack | >= `0.875rem` preferred | adjacent to figure/source | TBD |

Always inspect actual site. Avoid font weights not supplied by loaded font and unlicensed webfont distribution. Use `font-display: swap` only if compatible with the production typography strategy. Use HTML headings for hierarchy; do not simulate headings via `<div>`.

## Color token inventory

| Semantic role | Light candidate | Dark candidate | Purpose / test |
|---|---|---|---|
| Canvas | `#FFFFFF` | `#17191B` | full-page background |
| Primary text | `#2E2D29` | `#F7F7F5` | >=4.5:1 on matching background |
| Secondary text | `#53565A` | `#D9DDDF` | >=4.5:1 |
| Surface | `#F7F7F5` | `#25292C` | panel/card backgrounds |
| Link | `#00548F` | `#6FC3FF` | distinguish also via underline |
| Accent | `#8C1515` | `#F3B5B5` | sparing high-priority emphasis |
| Focus | `#00548F` | `#6FC3FF` | clearly outlined focus, tested per background |
| Plot series | token-defined palettes | token-defined palettes | shape/dash/label redundancies mandatory |

**Institutional distinction:** Cardinal Red `#8C1515` is confirmed as Stanford University brand, but its usage in this site is unverified. Official reference: https://identity.stanford.edu/design-elements/color/primary-colors/. Primary Stanford institutional typefaces: Source Sans 3 + Source Serif 4 (https://identity.stanford.edu/design-elements/typography/).

## Reusable visual decision table

| Decision | Lab site observed? | Component token | Allowed variant? | Approval |
|---|---|---|---|---|
| Button shape/border | UNVERIFIED | `button.*` | only documented semantic variants | UI lead |
| Card radius and spacing | UNVERIFIED | `card.*` | compact / standard | UI lead |
| Map ramp | UNVERIFIED | `map.*` | data-specific palette with legend | Scientist + UI |
| Chart categorical colors | UNVERIFIED | `chart.*` | sufficient contrast/identification | Scientist + UI |
| Image aspect ratio | UNVERIFIED | `media.*` | per-content appropriate | Content reviewer |

**Review:** inspect light/dark backgrounds, color vision deficiency simulation, Windows High Contrast/forced-colors and grayscale printing. Never use red/green alone to distinguish status or compare scenarios.
