# Template — New tool pull request and release review

## Basic metadata
Tool / route: [name, canonical slug]. Owner/reviewer: [names]. Research output: [paper/study/dataset]. Data/code version: [source commit/release]. Status: [prototype/beta/release].

## PR summary
What problem does the tool answer? Who is the user? What can they do? What differs from existing tools? Include before/after screenshots in light/dark/mobile **if actually captured**.

## Required checks (tick only after execution)

- [ ] Existing shell, theme and footer reused; no unapproved branding.
- [ ] Computed font, colors, spacing and navigation cross-checked with site.
- [ ] Semantic CSS tokens used; justified exceptions documented.
- [ ] Keyboard-only complete workflow, focus ring, mobile reflow, labels and errors.
- [ ] WCAG 2.2 AA audit target met or documented exceptions/fix plan; at least Stanford's current minimum.
- [ ] Chart legends, axes, units, no-data, uncertainty and data table verified.
- [ ] All chart/table/export values derive from one model state/data source.
- [ ] Map selection alternative, CRS, coverage, resolution, source/license and legend verified.
- [ ] Image alt/extended description, credit/license, responsive sizes and rights verified.
- [ ] Video captions, transcript, fallback, privacy and no autoplay verified.
- [ ] Companion paper, DOI/status, code/data versions, footnotes and credits confirmed.
- [ ] CSV/JSON/GeoJSON export fields/units/version/license tested.
- [ ] Light/dark, 320px/768px/1440px, 200% zoom, reduced-motion and printing checked.
- [ ] Slow/failure/empty/offline/stale data and invalid input states tested.
- [ ] Lint/test/build and accessibility tool results recorded below.
- [ ] Researcher and lab site owner approved scientific interpretation and visual fit.

**Exact commands and results**: [command: PASS/FAIL/NOT RUN with evidence].

**Open risks/decisions**: [owner, severity, remediation, due date].

**Changes to design system**: [new/reused tokens/components/templates, version].
