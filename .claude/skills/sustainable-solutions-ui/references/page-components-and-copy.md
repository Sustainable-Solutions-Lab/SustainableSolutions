# Page architecture, UI components, responsive behavior & copy

**Priority:** conform to the current live shell/components first. Examples below are normative behavior patterns, not evidence of existing production CSS. [VERIFIED] markers indicate patterns confirmed via browser-automation audit (2026-11-09) against `sustainablesolutions.stanford.edu`.

## Consistent page taxonomy

The site uses **Tailwind CSS v4** utility classes with **Astro** (SSG + hydration islands). Typography is **Inter** (sans/mono) and **Tiempos Headline** (serif). Custom properties use bare names (`--paper`, `--ink`, `--rule`, etc.) with no `--ssl-` prefix. [VERIFIED]

| Page type | Mandatory user outcome | Essential sections |
|---|---|---|
| Catalog `/tools` | Identify and enter the right tool | Tool cards, type labels, one-sentence purpose, companion paper and code/data links when real |
| Tool landing | Understand the research question | Eyebrow, H1, lead, limitations, primary interaction, outcome, source links |
| Interactive model | Change inputs and interpret output | Labeled inputs, units/ranges/defaults, run/reset, summary, uncertainty, methodology, export |
| Interactive map | Find and compare spatial patterns | Search/region, keyboard accessible layer selector, legend, map and table alternative, spatial metadata |
| Plot/dashboard | Compare variables and scenarios | Context, plotted panels, consistent scales, explanations, accessible data/download |
| Dataset | Identify provenance and safely reuse records | Coverage, schema, version, license, citation, download, update cadence, known limitations |
| Media essay | Learn with images/video | Storytelling hierarchy, caption, transcript, rights/credits and linked evidence |

## Page anatomy / order

1. Shared accessible skip link, site-level masthead, primary navigation and mode control (do not re-create shell per tool).
2. Tool eyebrow/type + H1 + plain-language research summary (one concise idea per sentence).
3. Metadata: last updated, status, companion paper and data version only when values are known.
4. Primary workflow: controls -> result summary -> map/visualization -> explanatory legend and data alternative.
5. Methods, uncertainty, geographic and temporal scope, caveats, questions and limitations.
6. Downloads and reproducibility (including source, methods, license, version and precise exported query).
7. Research & credits (authors, paper/DOI, dataset, code, imagery and cartography providers, media licensing and footnotes).
8. Existing shared footer and accessibility contact; persistent navigation/back links.

## Key components -- states, content & accessibility

| Component | API / rules | Explicit states / QA |
|---|---|---|
| Site masthead | [VERIFIED] 57px header with semi-transparent paper bg (`oklab(... / 0.7)`), 1px bottom border (ink at 14% = `--rule`), nav at 13px Inter sans (weight 400, active page weight 500). Reuse actual lab shell; don't duplicate. | keyboard, skip, current route, responsive, theme |
| Tool card | [VERIFIED] `display:block` anchor wrapping entire card; no explicit card bg or border. Image top + text content below. Type eyebrow in mono/uppercase/xs (`font-mono text-xs uppercase tracking-wider text-ink-3`), title in serif/xl/500 (Tiempos, 28px, weight 500). Companion paper block below with "COMPANION PAPER" label, title link with arrow, venue and year. External links (GITHUB, ZENODO, WEBSITE) in uppercase mono with arrow indicator. | long text, link click area, missing paper, focus |
| Eyebrow + page heading | [VERIFIED] `font-mono text-xs uppercase tracking-wider text-ink-3` -- verified class pattern (11px Inter, uppercase, wider tracking). Single H1 per page; avoid all-caps paragraphs. | mobile wrap, long title, zoom |
| Button/CTA | verb + target, primary per workflow; destructive with confirm | hover, pressed, focus, disabled reason, busy |
| Link | [VERIFIED] Links use ink color (`--link: var(--ink)`, `#181838` light / `#f8f8e8` dark), not blue. Underline via `--link-rule` / `--rule-strong`. Distinguish external destinations with arrow indicator if desired. | focus, visited, new-tab disclosure |
| Theme toggle | [VERIFIED] `<button>` with `aria-label="Toggle color theme"`, text label "Dark". Classes: `font-mono text-xs uppercase tracking-wider text-ink-3 hover:text-ink`. Toggles `data-theme` attribute on `<html>`; persists to `localStorage('ssl-theme')`. | keyboard, focus, aria-pressed, respects `prefers-color-scheme` |
| Form field | actual label, help, units, errors and selected value | default, invalid, required, disabled, reset |
| Range/slider | bounded min/max/step, numeric value, text/number alternative | keyboard, extreme values, precision |
| Filter/chips | persistent selected state, clear all, result count | no matches, multiple filters, announce changes |
| Tabs | native buttons, aria-controls/selected, arrow-key pattern if ARIA tablist | horizontal scroll, responsive, panel heading |
| Accordion | semantic details/summary or established accessible component | all opened, headings, print |
| Tooltip | supplemental only, no critical info exclusively in tooltip | focus and touch equivalents, dismissal |
| Alert/banner | specific severity and remedy; no color-only status | network error, stale data, partial load |
| Data table | table headers/scope, caption, units, pagination and sorting | 200% zoom, mobile horizontal scroll, export |
| Plot | `<figure>` title, summary, legend, accessible data, source | empty, sparse, dense, zero, negative, update |
| Map | labels, legend, bounds, keyboard alternative, attributions | no tiles, no coordinates, zoom, touch, keyboard |
| Media | source, responsive width, description, rights | unavailable asset, slow load, captions/transcript |
| Citation | stable ID, contextual inline anchor, full reference | broken DOI, repeated source, print/export |
| Download | file format, size estimate where known, exact filtered scope | active state, failed export, provenance |

## Standard component names / proposed props

These names map to **Tailwind utility-class + Astro component** patterns, not traditional React component APIs. The production site uses Astro `.astro` components with Tailwind classes; prop signatures below are conceptual contracts for content handoff, not literal framework bindings. [VERIFIED architecture]

- `ToolPageShell({eyebrow,title,description,breadcrumbs,metadata,children,attribution})`
- `ToolCard({type,title,description,href,paper?,sourceLinks?})`
- `ResearchMetadata({lastReviewed?,datasetVersion?,methodVersion?,companionPaper?})`
- `InputPanel({heading,description,children,onReset?,busy?})`
- `ChartPanel({figureNumber?,title,description,legend,footnotes,source,table,export})`
- `GeoPanel({title,layers,legend,scale,attribution,table,export})`
- `MediaFigure({src,alt,caption,credit,license,sourceUrl})`
- `ResearchAttribution({paper?,datasets?,method?,code?,images?,maps?,videos?,funding?,acknowledgements?,footnotes?})`
- `DataStatus({state,updatedAt?,message?,retry?})`

Naming should be reconciled with the actual project's Astro component conventions, not imposed verbatim.

## Responsive composition

- [VERIFIED] **Desktop:** 1200px max container (`.container-content` computed maxWidth). Tools grid uses 2-column card layout with image + text cards. 1-column on mobile.
- [VERIFIED] **Tool detail:** full-viewport app frame below header: `height: calc(100dvh - 57px)` (also `calc(100vh - 56px)` fallback). Internal tool controls not inspectable from catalog page.
- **Narrow:** content in one vertical reading order; controls first, summary next, visualization, table, methods, credits. Primary CTA within reach and no crucial sidebar-only information.
- **Medium:** allow two columns only if labels/inputs retain clarity; map width > 100% of available grid must not produce viewport overflow.
- **Wide:** optionally sticky parameters panel and spacious map/chart canvas; provide keyboard focus flow that still matches reading order.
- [INFERRED] Breakpoints use Tailwind v4 defaults; no custom `--breakpoint-*` vars found in production CSS.
- Interactive targets need comfortable tap area; WCAG 2.2 target rules, documented exceptions and focus-not-obscured requirements apply.
- Never hide data sources, limits or controls on mobile. Don't require drag gestures to complete a task.

## Copy tone

- Write plain English, research-first, precise, neutral and never promotional. Distinguish observed facts from projections. Avoid implying causation without supporting design; differentiate simulations and measured data.
- Use descriptive labels: "Compare scenarios," "Download plotted data (CSV)," "Show uncertainty interval" instead of "Go," "Learn more," "Data."
- Use honest status: "Estimated," "Modelled," "Observed," "Updated [date]," "Not available," "Outside study area."
- Use en dash for ranges; specify units (e.g. ug/m3, t CO2e/yr); define acronyms at first mention and attach accessible units to controls.
- Errors explain what happened and what remains safe to do. Example: "Map tiles are unavailable. Your scenario results are still accessible in the table below."

## Page content handoff contract

Title, category, canonical path, scope, audience, scientific claim(s), study status, DOI, lead researchers, methodology URL, data/algorithm version, code URL, changelog, generated date, terms, license, geographic boundaries, measurement units, uncertainty convention, privacy, map provider attribution, imagery source, contributor credits and contact owner. Use explicit `null` for unknown rather than fabricated defaults.

### Verified token variable names [VERIFIED]

Design tokens use **bare CSS custom property names** (no `--ssl-` prefix). The following are the verified production variables that should be referenced in any handoff or implementation:

**Core surfaces and ink:**
`--paper` (`#f8f8e8`), `--paper-2` (`#f1f1df`), `--paper-3` (`#e8e8d4`), `--ink` (`#181838`), `--ink-2` (`#3a3a5a`), `--ink-3` (`#6b6b80`), `--ink-4` (`#9a9aae`)

**Brand colors:**
`--cardinal` (`#8c1515` light / `#e04545` dark), `--accent-brand` (aliases cardinal), `--brand-navy` (`#181838`), `--brand-green` (`#48a848`), `--brand-teal` (`#78c8d8`), `--brand-orange` (`#e87828`), `--brand-cream` (`#f8f8e8`)

**Semantic roles:**
`--link` (`var(--ink)`), `--link-rule`, `--focus` (`var(--accent-brand)`), `--rule` (ink at 14% alpha), `--rule-strong` (ink at 28% alpha), `--highlight` (teal at 35% alpha)

**Typography:**
`--font-sans` (Inter stack), `--font-serif` (Tiempos Headline stack), `--font-mono` (Inter stack), `--text-xs` through `--text-4xl` (11/13/16/23/28/34/41/56 px), `--font-weight-*` (400/500/600/700)

**Layout:**
`--spacing` (4px base), `.container-content` (1200px max), header height 57px, tool frame `calc(100dvh - 57px)`

**Domain system colors:**
`--system-energy-text` (`#c2440e`), `--system-food-text` (`#2e7b3f`), `--system-water-text` (`#1f5e8c`), `--system-materials-text` (`#5e4fa2`), `--system-climate-text` (`#1f6b82`), `--system-health-text` (`#9e0142`)

**Data-viz spectral palette:**
`--spectral-1` through `--spectral-11` (11-stop diverging: `#9e0142` to `#5e4fa2`)

**Dark mode:**
Applied via `[data-theme="dark"]` on `<html>`. Dark `--paper`: `#0c0c1c`, dark `--ink`: `#f8f8e8`, dark `--cardinal`: `#e04545`. Persisted to `localStorage('ssl-theme')`.
