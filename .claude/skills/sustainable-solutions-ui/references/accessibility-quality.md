# Accessibility, quality gates, performance, privacy & release

## Compliance bar

University minimum documented as WCAG **2.0 AA**; new skill target **WCAG 2.2 AA** with manual assistive-technology testing. Do not imply automated checks prove compliance. Stanford policy: https://uit.stanford.edu/accessibility/policy-standard ; WCAG 2.2: https://www.w3.org/TR/WCAG22/ .

## Must-pass checks

### Semantic structure

- [ ] Single meaningful H1, correct heading order, clear landmark hierarchy, existing skip navigation, full keyboard-operable routing.
- [ ] Form fields labeled and associated with hint/error; required and invalid announced; units and boundaries visible.
- [ ] Focus visible, logical order, not obscured by sticky elements; dialog focus trap/return; escape for dismissible overlays.
- [ ] Components use native semantics first and proven ARIA patterns only where needed; no hidden essential facts in hover.
- [ ] User can identify links without color alone, and distinct controls have discernible labels.

### Perception and content

- [ ] Contrast normal text >=4.5:1, large text >=3:1, critical UI nontext contrast >=3:1 where applicable.
- [ ] 200% text resize and 400% zoom/reflow at narrow width without lost workflow/content or unintended horizontal page scroll; data tables can scroll within labeled region.
- [ ] Important visuals have alt/long description or directly adjacent accessible data table, plot summaries, keyboard feature exploration if useful.
- [ ] Maps have equivalent list/table/search for every key task; pan/zoom gesture not mandatory; visible legend and required tile/source credits.
- [ ] Video has accurate captions, transcript and audio descriptions where applicable; animation reduced-motion and pause/static path.
- [ ] Language metadata, date/number formatting, Unicode subscripts/superscripts explained as needed, screen-reader-readable abbreviations.

### Interaction / resilience

- [ ] Keyboard-only end-to-end, screen reader at least VoiceOver/Safari and NVDA/Firefox or the team's supported matrix.
- [ ] Pointer targets conform to applicable WCAG 2.2 Target Size criteria, exceptions documented; focus not obscured.
- [ ] Query handling cancels or ignores stale results; spinner/busy state and live announcements do not overwhelm.
- [ ] Loading, empty, invalid, no service, timeout, partial data, stale data and retry are distinct; fallback table retains access where possible.
- [ ] Error messages provide recovery; no raw stack traces, secrets, precise user-location leaks or unapproved analytics.
- [ ] Print layout, copy link, share/export and accessible downloadable formats work.

### Science and evidence

- [ ] Scientist verifies units, denominators, rounding, labels, scenarios, baselines, temporal/geographic scope, error intervals, limitations and no false precision.
- [ ] Data and code versions visible; every result can be reproduced from parameter values; citation/provenance survives exports.
- [ ] Data categories, missingness and suppression are not misrepresented; legends distinguish all relevant classes.
- [ ] Research, basemap, imagery, music/video and code license/credit requirements met; no placeholder citations remain.

### Responsive, performance, privacy and security

- [ ] Layout reviewed at 320, 375, 768, 1024, 1440 CSS px widths (or adopted project breakpoints), portrait/landscape; light/dark; high contrast.
- [ ] Initial payload budget established (do not impose arbitrary numbers), avoid loading all geospatial data before needed, lazy-load panels and optimize raster assets.
- [ ] Test with slow network, long-running model, offline, empty data, large datasets, high latency, aborted requests, browser no-webgl or low-memory fallback.
- [ ] No credentials/tokens in browser, no arbitrary HTML injection, sanitize tooltips and user-generated text, protect API calls, validate inputs server-side, privacy statement/consent if collecting data.
- [ ] Safe external links (`rel="noopener noreferrer"` when target blank), dependency/license/security checks, scoped and reversible analytics.

## Test matrix / reporting

| Group | Method | Artifact | Gate |
|---|---|---|---|
| Structure | DOM/axe + manual headings | annotated results | No blocking issues |
| Keyboard | Tab/Shift+Tab/Enter/Space/arrows/Esc | walk-through | All key tasks complete |
| SR | VoiceOver + NVDA coverage | review notes | Critical output comprehensible |
| Responsive | screenshot at approved breakpoints | baseline diffs | No unexpected divergence |
| Theme | screenshot + contrast script | token/plot comparison | Legibility in both themes |
| Visualization | scientist peer review | signed accuracy checklist | No wrong units/legend |
| Attribution | link/DOI/license checks | provenance audit | All required sources present |
| Integration | app test/build/lint/type-check | logs | Passing |
| Data robustness | network/error/staleness simulations | test records | Recovery is clear |
| Performance | Lighthouse/Web Vitals/memory budget | measurements | Meets site-agreed budgets |

## Release process

1. Collect browser/repo evidence; identify verified values, differences and nonconforming legacy patterns.
2. Write change scope and acceptance criteria in tool brief.
3. Implement with shared shell and tokens; cover all required states and credits.
4. Run targeted tests, screenshot comparisons and peer science/accessibility review.
5. Approve variants and document exceptions with named owner and remediation date.
6. Record deployment, last content/data review, rollback procedure and post-launch monitoring.

## Definition of done (hard blockers)

No missing units, inaccessible critical tasks, uncredited third-party media, unsourced research claims, unverified publication metadata, invented geospatial precision, inaccessible essential plot values, duplicated masthead, or major screen-reader/keyboard regression. Mark untested as **NOT RUN** and unresolved as **OPEN**, never **PASS**.
