# Design decisions and exceptions log

This document records Architecture Decision Records (ADRs) for the Stanford Sustainable Solutions Lab UI/UX skill. Each entry captures context, the decision made, and its consequences for future work.

---

## ADR-001: Token naming follows production site conventions

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** The site uses bare CSS custom property names (`--paper`, `--ink`, `--cardinal`, etc.) not prefixed names. Early skill drafts used a `--ssl-*` prefix for namespacing, but this diverges from what the production site actually ships.
- **Decision:** Drop `--ssl-*` prefix from v1.0; match production naming exactly.
- **Consequences:** Tokens are directly compatible with Tailwind v4 config. No translation layer is needed between skill tokens and production CSS custom properties.

---

## ADR-002: Font stack uses Inter + Tiempos Headline (not Source Sans/Serif)

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** v1.0 assumed Stanford institutional fonts (Source Sans Pro / Source Serif Pro); the site actually uses Inter (sans-serif) and Tiempos Headline (serif).
- **Decision:** Document actual fonts; note Source Serif 4 is in the fallback chain.
- **Consequences:** Tiempos Headline is a commercial font (Klim Type Foundry); verify license for any new deployment. If font license does not cover new subdomains, fallback to Source Serif 4.

---

## ADR-003: Warm cream/navy color identity (not white/black)

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** v1.0 used white (`#FFFFFF`) background and Stanford Black (`#2E2D29`); the site uses warm cream (`#f8f8e8`) and navy (`#181838`).
- **Decision:** All tokens, examples, and documentation updated to match the production palette.
- **Consequences:** The warm tone is a distinctive lab identity element — do not replace with generic white. Any new page or component must use `--paper` (`#f8f8e8`) as the default background, not white.

---

## ADR-004: Links are ink-colored, not blue

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** Standard web convention is blue links; this site uses ink (`#181838`) for links with underline via `rule-strong`.
- **Decision:** Document this as intentional site behavior, not an accessibility issue. Links use underlines for identification, satisfying WCAG link-distinguishability requirements without relying on color alone.
- **Consequences:** New tools must not introduce blue links; use ink color with underline. Any link styling must preserve the underline convention to maintain accessibility compliance.

---

## ADR-005: Spectral diverging palette for data visualization

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** The site has a built-in 11-stop spectral diverging palette (`--spectral-1` through `--spectral-11`) plus domain-specific colors for research categorization.
- **Decision:** Use the spectral palette for charts and maps; use domain colors for research system categorization.
- **Consequences:** Do not introduce arbitrary chart colors; draw from spectral and `theme-dyn` palettes. This ensures visual consistency across all data visualizations on the site.

---

## ADR-006: Tailwind CSS v4 utility-first approach

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** The site uses Tailwind v4 with Astro, not a traditional component CSS architecture. Tailwind v4 natively consumes CSS custom properties.
- **Decision:** Skill tokens provide CSS custom properties compatible with Tailwind; examples use class-based approach matching site patterns.
- **Consequences:** Component styles are expressed as Tailwind utility classes in production; skill examples use CSS for portability. Developers should prefer Tailwind utility classes when working in the Astro codebase, but reference plain CSS token values for framework-agnostic documentation.

---

## ADR-007: Full-viewport tool frames

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** Tool detail pages use `calc(100dvh - 57px)` to fill the viewport below the header. This creates an app-like experience for interactive tools.
- **Decision:** Document this pattern as the standard tool layout; tools own the full viewport below nav.
- **Consequences:** Tool pages are effectively single-page apps within the site shell. Any new tool must account for the 57px header offset and should not introduce its own scrollable wrapper that conflicts with the viewport calculation.

---

## ADR-008: Theme toggle is attribute-based, not class-based

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** Dark mode uses `data-theme="dark"` attribute on `<html>`, not a `.dark` class. Theme state persists to `localStorage('ssl-theme')`.
- **Decision:** Token CSS uses `[data-theme="dark"]` selector; theme persists to `localStorage('ssl-theme')`.
- **Consequences:** Any new tool must read and respect the `data-theme` attribute. Do not use Tailwind's `dark:` variant (which relies on a class-based approach); instead use CSS custom properties that automatically resolve based on the `[data-theme]` attribute.

---

## ADR-009: WCAG 2.2 AA target vs Stanford 2.0 AA minimum

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** Stanford's documented minimum is WCAG 2.0 AA; this project targets the more recent WCAG 2.2 AA standard.
- **Decision:** Implement and test against WCAG 2.2 AA; document which 2.2-specific criteria are addressed.
- **Consequences:** New success criteria from 2.2 (focus-not-obscured, target size, dragging movements, consistent help, redundant entry, accessible authentication) should be tested. This exceeds the university baseline but provides stronger accessibility guarantees.

---

## ADR-010: Verified vs Proposed distinction

- **Status:** Accepted
- **Date:** 2026-11-09
- **Context:** Some token values are extracted directly from the production site; others are skill recommendations based on analysis or best practices.
- **Decision:** Every value carries explicit status: **VERIFIED** (confirmed in production), **INFERRED** (derived from production evidence), or **PROPOSED** (skill recommendation not yet in production).
- **Consequences:** PROPOSED values require lab owner approval before use in production. VERIFIED values can be used with confidence. INFERRED values should be validated when possible but are considered reliable.
