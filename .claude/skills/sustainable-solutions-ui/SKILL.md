---
name: sustainable-solutions-ui
version: 2.1.0
description: Maintain the Stanford Sustainable Solutions Lab site's visual and interaction consistency when adding, redesigning, auditing, or embedding research tools, maps, models, datasets, plots, media, citations, or downloadable outputs on /tools.
---

# Sustainable Solutions Lab UI/UX skill

## Activation

Use this skill when a task mentions the Sustainable Solutions Lab site, `/tools` or a nested tool page, a companion research visualization, a new interactive map/model, or a UI design review of the lab's work. Apply to both new and existing tools. For other Stanford sites, use the official identity guidance but do not assume this lab-specific skill applies.

## Mission

**Make every research tool feel like a native part of a single laboratory website while preserving scientific meaning, transparency, accessibility, and performance.** A coherent site is more important than inventing an eye-catching standalone dashboard.

## Source-verified production stack (2026-11-09)

The site runs **Astro** (static site generator with hydration islands) + **Tailwind CSS v4** (utility-first CSS framework using native CSS custom properties) deployed on **Vercel**. Design tokens are bare CSS custom properties on `:root` and `[data-theme="dark"]` — there is no `--ssl-*` prefix in production. Canonical source: `src/styles/colors_and_type.css` + `src/styles/global.css`.

**Font loading:** Google Fonts loads **Inter** (400/500/600/700) and **Source Serif 4** (300–900) via a `<link>` tag in `BaseLayout.astro`. The CSS `--font-serif` stack lists "Tiempos Headline" first, but its `@font-face` is **commented out** — the font is not licensed. The actual rendered serif is **Source Serif 4**.

**Chart/map stack:** D3 (array, contour, geo, hierarchy, scale, chromatic, selection, shape), MapLibre GL, PMTiles, Turf.js, TopoJSON, Zustand (state), Lucide React (icons).

Key verified values:

| Category | Token | Value |
|---|---|---|
| Sans font | `--font-sans` | Inter (via Google Fonts) |
| Serif font | `--font-serif` | Source Serif 4 (rendered) — Tiempos Headline in stack but not licensed |
| Code font | `--font-code` | ui-monospace, SF Mono, Menlo, Consolas |
| Background | `--paper` | `#f8f8e8` (warm cream) |
| Text | `--ink` | `#181838` (dark navy) |
| Accent | `--cardinal` | `#8c1515` (Stanford Cardinal Red) |
| Dark bg | `--paper` (dark) | `#0c0c1c` |
| Dark text | `--ink` (dark) | `#f8f8e8` |
| Dark accent | `--cardinal` (dark) | `#e04545` |
| Container | `--content-max` | 1200px |
| Prose | `--prose-max` | 680px |
| Header | via ToolFrame | 56px (browser measures 57px with border) |
| Type scale | `--t-xs` to `--t-5xl` | 10 steps: 11/13/16/19/23/28/34/41/56/72 px |
| Spacing | `--s-1` to `--s-10` | 4px base: 4/8/12/16/24/32/48/64/96/128 |

Links use `--ink` color (same as body text) with `border-bottom` underline — **not** a separate blue link color.

## Evidence hierarchy (mandatory)

1. **Current live app source and rendered UI** (shared shell, token files, fonts, headers, footer, screenshots, computed styles, route behavior); inspect before editing, and preserve working patterns.
2. **Existing /tools sibling pages** including contrails, mining-water, just-air, firefuels; identify their common components and evidence of divergence.
3. **This skill's browser-verified audit** (`references/site-audit.md`) — extracted via browser automation 2026-11-09.
4. **Stanford official identity/accessibility** as institutional baseline, NOT necessarily the lab's component definitions.
5. **Candidate defaults** from this skill only when a value cannot be confirmed; label as proposal, avoid claiming exact matching.

Never invent the lab's CSS hex codes, font implementation, grid measurements, file paths, institutional endorsements, exact data, source credits or study results. When it matters, ask for or inspect the repo, page screenshot, content management system config, and Figma/design library. Use an explicit `VERIFIED / INFERRED / PROPOSED / TBD` audit table.

## Workflow for every change

1. **Inspect** route, app shell, CSS tokens, controls and sibling patterns; determine framework (Astro + Tailwind v4), existing test/build commands and license/attribution constraints. Capture desktop/mobile/light/dark screenshots if tooling permits. Note exceptions.
2. **Classify** request: index/card, landing page, model/form, map explorer, chart dashboard, dataset detail, downloads, embedded media, bibliographic page or hybrid. Determine user task, dataset versions, publication and owner.
3. **Write a mini spec**: audiences, science question, assumptions and uncertainty, primary CTA, navigation, data scope/units, device constraints, failure modes, privacy and consent, complete credit/provenance requirements.
4. **Use design tokens** not raw invented literals: `--paper`, `--ink`, `--cardinal`, `--rule`, `--spectral-*` series and mode-specific semantic variables. Verify against live site before merging (`references/tokens-and-typography.md`).
5. **Build with shared components** from the repo; propose abstractions only if an existing pattern is repeated. Reuse top navigation, breadcrumbs and footer; add no parallel branding/header. Prefer semantic HTML and progressive enhancement.
6. **Implement complete states**: default, hover, focus-visible, selected, pressed, disabled, loading, empty, no results, invalid input, stale data, timeout, offline, unsupported browser, partial failure, successful export and permissions.
7. **Handle science responsibly**: precise plot axes, units, scales, baselines, uncertainty, scenario caveats, data freshness, geographic assumptions, map legends, legend/data equivalence, accessible tables and faithful export metadata.
8. **Attach attribution**: paper DOI, authors and venue/year; data source, version/date, methods, model/code repo and license, map tiles and imagery, photograph/video credit, alt text, transcript/captions, generated-content disclosure where applicable; footnotes and citation anchors.
9. **Test** WCAG 2.2 AA target, keyboard and screen reader, text zoom/reflow, contrast, mobile, reduced-motion, dark/light, no JS, slow data, invalid inputs, export/copy, attribution persistence; review with a domain scientist.
10. **Report** modified files, screenshot comparisons, component reuse, confirmed/unconfirmed values, test results, risks and follow-ups. Never mark a test passed unless executed.

## Mandatory page skeleton

- Shared site masthead / primary navigation (sticky, 57px height) and optional breadcrumb (only if present in design system).
- Page eyebrow `TOOLS` or tool type in uppercase monospace with tracking (`--font-mono` + `letter-spacing: .1em`), clear `<h1>` in `--font-serif`, one-paragraph explainer of the scientific question.
- Tool metadata strip: method/status, research paper, creators, updated-as-of / data version where provided.
- Main interaction region: inputs with labels, primary action if needed, result summary, chart/map/model and legend, downloadable data.
- Nearby *How to read this*, assumptions/limitations and method/help; a data table or text alternative for every essential plotted value.
- Dedicated **Research & attribution**: companion paper, citation, data, code, authors, media and map credits, footnotes, license, contact; only show fields with real data.
- Shared site footer on `--paper-2` background, not an invented replacement.

## Theme system

The site uses a `data-theme` attribute on `<html>` with values `"dark"` (or absent for light). Theme preference is persisted to `localStorage` under the key `ssl-theme`. The toggle should respect `prefers-color-scheme` as the initial default. Dark mode swaps `--paper`, `--ink`, `--cardinal` and derived tokens.

## Data visualization palette

The site uses an 11-stop spectral diverging palette (`--spectral-1` through `--spectral-11`) for charts and map classes. Use `--spectral-10` (blue) and `--spectral-2` (red) as the default two-series pair. Always provide non-color differentiators (dashes, markers, direct labels) alongside color.

## Normative rules

- No color-only, hover-only or gesture-only meaning. Keyboard access and text equivalents are mandatory.
- No auto-playing sound, inaccessible video, animation without reduced-motion handling, map requiring pinch/drag as the only navigation, or plots without labels/units.
- No decorative Stanford seal/wordmark redraw. Use approved logo files only and follow Stanford logo usage rules.
- No arbitrary font imports; use the verified stack: Inter (sans/mono via Google Fonts), Source Serif 4 (serif via Google Fonts, fallback until Tiempos Headline is licensed), ui-monospace (code).
- No data, coordinates or projection claims derived from example placeholders; all sample data marked synthetic.
- Separate **display rounding** from computation/export precision; label uncertainty intervals and scenario baseline.
- External links should communicate destination; use accurate DOI/source links, secure targets if opening new tab, visible focus and accessible names.
- Track additions through tokens and documentation instead of introducing bespoke one-off styling.

## What to read

- `references/site-audit.md` — browser-verified observations / evidence / unknowns.
- `references/tokens-and-typography.md` — verified semantic tokens, type scale, layout, light/dark, spectral palette.
- `references/page-components-and-copy.md` — cards, navigation, input states, responsive, content tone.
- `references/engineering-architecture.md` — Astro + Tailwind v4 stack, shared shell, tool integration pattern.
- `references/decisions-and-exceptions.md` — architectural decision records for token naming, fonts, colors, theme.
- `references/charts-maps-data.md` — scientific visualization, mapping, exports.
- `references/media-credits-citations.md` — images, video, bibliographic, data attribution.
- `references/accessibility-quality.md` — accessibility, i18n, performance, privacy, QA/release.
- `templates/` — reproducible, labeled example patterns.
- `tokens/` — source-verified machine-readable tokens matching `src/styles/colors_and_type.css`.
- `examples/` — reference markup and TypeScript usage (not exact production components).

## Definition of done

New tool passes the detailed release checklist in `references/accessibility-quality.md`; inherits existing Astro site shell/styles; core workflows are operable by keyboard and on a narrow viewport; scientific labels/caveats and complete research/media/map attribution are present; reviewer can trace every numerical claim to a dataset/method; no placeholders remain in production.
