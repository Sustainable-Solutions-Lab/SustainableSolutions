# Maintenance & content updates

This doc tells you how to update each part of the site. For one-time setup of the Google Sheet and Vercel env vars, see `docs/sheet-setup.md`. For the project's overall design and stack decisions, see `CLAUDE.md`.

## How a change reaches the live site

| Source of change | What triggers a rebuild | Time to live |
|---|---|---|
| Edit a row in the Google Sheet | Apps Script edit trigger pings Vercel deploy hook (debounced 30 s) | ~60–90 s |
| Edit a Markdown file in the repo | Push to `main` on GitHub → Vercel auto-deploy | ~60–90 s |
| Add or replace an image in `/public/` | Push to `main` | ~60–90 s |
| Edit code (components, pages, styles) | Push to `main` | ~60–90 s |
| Manual rebuild (Sheet) | Sheet menu → SSL site → Rebuild now | ~60–90 s |

You never need to log into Vercel for content changes. Editors with access to the Sheet can update Publications / People / News / Featured without touching code.

---

## Home (`/`)

| What you want to change | How |
|---|---|
| The featured items below the hero | Edit rows in the **Featured** tab of the Sheet. Up to 4–6 rows recommended. Set `order` to control sequence. |
| The hero tagline | `src/pages/index.astro`, the `<h1 class="display">` line. The tagline is also referenced in `src/layouts/BaseLayout.astro` (default meta description) and in `CLAUDE.md`. Update all three. |
| Hero photography | Drop the image into `/public/featured/` and reference it from a Featured row's `image_filename` column. |
| Hero interactive component | Currently a placeholder. Will pull from a Featured row tagged `type=tool` once wired. |

---

## Research (`/research` and `/research/[theme]`)

The 5 theme pages (`energy-systems`, `land-use`, `trade`, `impacts`, `solutions`) are Markdown files. The overview page lists them as cards.

| What you want to change | How |
|---|---|
| Theme prose | Edit `src/content/research/<theme>.md`. Frontmatter has `title` and `order`. |
| Add a new theme | Create `src/content/research/<new-slug>.md` (with frontmatter), then add `<new-slug>` to the `themes` array in `src/pages/research/index.astro` and the `getStaticPaths` in `src/pages/research/[slug].astro`. |
| Rename a theme slug | Rename the `.md` file and update the two `.astro` files above. **Also rename the slug in every Publication row's `themes` column** (Sheet) — they must match. |
| Embed a figure inside a theme page | Drop the image into `/public/images/`, reference as `![caption](/images/filename.jpg)` in the `.md` file. |
| Auto-generated paper list per theme | Already wired (in spirit): each theme page filters publications by tag once the data is in the Sheet. Tag papers by setting `themes` to a comma-separated list of slugs. |

---

## People (`/people` and `/people/[slug]`)

Sheet-driven. Each row in the **People** tab generates one entry on the grid plus a detail page.

| What you want to change | How |
|---|---|
| Add a new lab member | Add a row to the People tab. Required: `slug`, `name`, `role`, `unit` (`main` or `ciu`), `status` (`current` or `alumni`). |
| Photo | Save a square image (256×256+) to `/public/people/`. **If you name the file `<slug>.jpg` (or `.png` / `.webp` / `.avif`), it's auto-detected — no Sheet edit needed.** If you use a different filename, put it in the `photo_filename` column. If neither is set, the card shows a Spectral-colored letter avatar. |
| Audit photos | `node scripts/audit-people-photos.js` cross-references the People sheet against `/public/people/`. Reports missing files, orphan files (uploaded but unused), case mismatches, and rows still on the letter-avatar fallback. Run after editing the Sheet or uploading photos. |
| Person moves to alumni | Set `status` to `alumni`, add `current_position`, fill in `left_date` (YYYY-MM). |
| Reorder the grid | Set `order` (lower = earlier) in the row. Sorting is by `order` within each section. |
| Tag a person to the CIU | Set `unit` to `ciu`. They'll appear in the "Conceptual Investigations Unit" section. |
| Long-form bio | The `bio_short` column is one sentence. For a richer bio, drop a `src/content/people/<slug>.md` file. The frontmatter takes optional `title` and `role` (otherwise pulled from the Sheet). The Markdown body renders above the metadata grid on `/people/<slug>`. See `steve-davis.md` for a template. |
| Contact / profile links on the active-member card | Three optional Sheet columns: `email`, `scholar_url`, `orcid` (the iD only — the URL prefix is added at render). The active-member card on `/people` renders an action row with Profile / Email / Website / Scholar / ORCID links — only the ones with values appear. |
| Generate stubs for new people | After adding rows to the People Sheet, run `npm run prebuild && node scripts/generate-people-stubs.js`. The script writes a placeholder `<slug>.md` for any person who doesn't have one yet. Existing files are never overwritten. |
| Per-person publications list | Automatic. The detail page filters `publications.json` by the `lab_authors` column matching the person's slug, sorted reverse-chronologically. To add a paper to someone's page, add their slug to that paper's `lab_authors` cell in the Publications Sheet. |

---

## Publications (`/publications`)

Sheet-driven. Each row in the **Publications** tab is one citation. Filtered by year, theme, and featured status; client-side search hits title, authors, and journal.

| What you want to change | How |
|---|---|
| Add a paper | Add a row. Required: `authors`, `title`, `journal`, `year`, `doi`. The DOI is the canonical identifier — without it, the citation can't link to the paper. |
| Author format | `Davis, S.J.; Caldeira, K.; Field, C.` Last name comma initials, semicolons between authors. The build coerces this verbatim. |
| Themes | Comma-separated slugs in the `themes` column, e.g. `energy-systems, trade`. Slugs must exactly match the research theme `.md` filenames. |
| Lab authors | Comma-separated `slug` values from the People tab, e.g. `steve-davis, sample-postdoc`. Used by per-person publication lists (when wired). |
| Feature on the home page | Set `featured` to `TRUE`. |
| Add replication code or a PDF link | `code_url` and `pdf_url` columns. Both render as small mono action links next to the DOI. |
| Add a research brief or slides link | `brief_url` and `ppt_url` columns. Render as additional small mono action links. |
| Make a paper richer / hero | Set `featured = TRUE` and (optionally) fill in `abstract` (2–3 sentences) and `image_filename` (drop image into `/public/publications/`). Featured papers get a wider card with hero block + abstract + Altmetric/Dimensions badges. If `image_filename` is blank, a typographic placeholder uses the journal name on a Spectral-accented panel. |

### Refreshing rich metadata from Google Scholar

When new papers appear on Steve's Scholar profile or you want to refresh authors / abstracts / DOIs / citation charts:

```
node scripts/scrape-scholar.js master    # quick — just the profile listing
node scripts/scrape-scholar.js details   # ~6 minutes for 100 papers; resumable
node scripts/scholar-to-csv.js           # merge → templates/publications-from-scholar.csv
```

The `details` stage hits Scholar at most once per paper (3-second polite delay). Scholar **will rate-limit** if you fire too fast or run repeatedly in a short window — when that happens you'll see HTTP 429 errors. The script is resumable: rerun a few hours later and it skips IDs already saved in `templates/scholar-details.json`.

`scholar-to-csv.js` writes `templates/publications-from-scholar.csv`. Open it, copy the rows you want, paste into the Publications Sheet. Authors get reformatted from full-name style to `Last, F.M.` to match the schema; chemical formulas (CO₂, CH₄, etc.) get Unicode subscripts.

The scraped citation chart per paper is stored in `templates/scholar-details.json`. It's loaded at build time and renders as a small SVG sparkline below the badges on featured publication cards (when the DOI matches).

### Filling missing metadata from a DOI (Crossref)

For a row that has a `doi` but is missing other fields (authors, journal, year, volume_issue, pages, month), run:

```
node scripts/enrich-from-crossref.js
```

This reads `templates/publications-from-scholar.csv` by default (override with `INPUT=path/to/your.csv`), hits the Crossref REST API for each row that has a DOI, and writes an enriched copy to `templates/publications-enriched.csv`. The script is **additive only** — non-empty cells are never overwritten. Open the output, copy the columns you want, paste back into the Sheet.

Crossref is free, no auth needed, but be polite — the script throttles to 100ms between requests. A 100-row batch takes ~10 seconds.

### Importing many papers at once (Google Scholar)

For bulk imports — e.g., the initial backfill, or after a long publishing streak — there's a pipeline that pulls from a Scholar profile.

1. **Refresh the source data**: I can re-fetch the Scholar profile and update `templates/scholar-raw.json`. Just ask. (Scholar blocks programmatic auth-required actions, but the public profile list page works.)
2. **Convert to CSV**: `node scripts/scholar-to-csv.js` reads `templates/scholar-raw.json` and writes `templates/publications-from-scholar.csv`. Authors get reformatted to the schema's `Last, F.M.` style. Venue strings get parsed into `journal`, `volume_issue`, `pages` where possible.
3. **Import into the Sheet**: open the generated CSV, copy rows 2–N (skip the header), paste below the existing rows in the Publications tab.

What Scholar gives us: authors, title, journal, year, volume_issue, pages.

What it doesn't (and you'll need to fill in by hand):
- **DOI** — not in Scholar's list view
- **url, pdf_url, code_url, press_url** — not on Scholar
- **themes** — manual tagging
- **lab_authors** beyond `steve-davis` — depends on which lab members co-authored

Spot-check before importing — Scholar occasionally produces glitches that ride through the parser:
- Stray initial-only "tokens" in the authors line that look like garbled names (e.g. one row in the last batch had an `al., B.G.` entry — drop it)
- Article numbers landing in `volume_issue` instead of `pages` for journals like Nature Communications that use article-number-only citations
- Entries that aren't actually papers — Scholar sometimes lists reports, standards, or chapters; delete rows that don't belong on the publications page

---

## News (`/news` and `/news/[slug]`)

Two flavors: short announcements (Sheet) and long-form posts (Markdown).

| What you want to change | How |
|---|---|
| One-line announcement | Add a row to the **News** tab. Required: `date` (YYYY-MM-DD), `title`, `type` (`paper` / `press` / `talk` / `award` / `other`). Optional: `summary`, `link`, `image_filename`. |
| Long-form post | Create `src/content/news/<slug>.md` with frontmatter (`title`, `date`, optionally `summary`). Then add a corresponding row in the News Sheet with `long_form_slug` set to `<slug>`. The list view shows the row; the row links to `/news/<slug>`. |
| Feature on the home page | Set `featured` to `TRUE` in the News row. |

---

## Tools (`/tools` and `/tools/<tool>`)

Each tool is its own React island. Currently: **Firefuels** (`/tools/firefuels`).

| What you want to change | How |
|---|---|
| Tool description on the index page | `src/pages/tools/index.astro`. The card shows the tool name and a one-line blurb. |
| Firefuels content / behavior | `src/tools/firefuels/`. Map components in `components/`, libraries in `lib/`, project config in `projects/fuel-treatment/config.js`. |
| Firefuels data layer | The PMTiles / GeoJSON the map renders. Small files (≤2 MB) live in `/public/`; large datasets live on Cloudflare R2 and are referenced by URL in the project config. See `CLAUDE.md` § "Vercel data-hosting" notes. |
| Methods text in Firefuels | `src/tools/firefuels/projects/fuel-treatment/methods.mdx`. (The Methods button is currently stubbed; rendering wires up in a future pass.) |
| Add a new tool | Create `src/tools/<new-tool>/` and a `src/pages/tools/<new-tool>.astro` that mounts the React island with `client:only="react"`. Add a card on the tools index page. Follow Firefuels' structure as a template. |

---

## About / Contact (`/contact`)

| What you want to change | How |
|---|---|
| Contact email or affiliations | `src/pages/contact.astro`. Edit the `<a href="mailto:...">` and the prose. |
| Lab affiliation links in footer | `src/components/Footer.astro`. |
| About page (separate from contact) | Doesn't exist yet. Add `src/pages/about.astro` and a nav link to `src/components/Nav.astro` if you want one. |

---

## Site-wide updates

| What you want to change | How |
|---|---|
| Top nav links or order | `src/components/Nav.astro`, the `links` array. The mobile drawer reads from the same array. |
| Footer text or links | `src/components/Footer.astro`. |
| Brand colors, fonts, spacing, radii | `src/styles/colors_and_type.css`. CSS variables there are the single source of truth — Tailwind utilities pick them up via `@theme inline` in `src/styles/global.css`. |
| Add a new color or text size to Tailwind utilities | `src/styles/global.css`, the `@theme inline` block (for theme-tracked tokens) or the static `@theme` block (for fixed sizes). |
| Dark mode tokens | Same `colors_and_type.css`, in the `[data-theme="dark"]` block. |
| Favicon / lab mark | Drop new SVGs into `/public/` and reference from `src/layouts/BaseLayout.astro`. |
| Site title / default meta description | `src/layouts/BaseLayout.astro`, the `Props` defaults. |

---

## Triggering rebuilds

| Situation | What to do |
|---|---|
| You edited a Sheet cell | Wait ~60 s. Apps Script debounces and pings Vercel's deploy hook. |
| You want to rebuild without editing | Sheet → menu **SSL site** → **Rebuild now**. Or press the same button if you embedded one. |
| You need to verify what data the live build pulled | Vercel → Project → Deployments → latest → Build Logs → search `[fetch-sheets]`. Each tab logs `[sheet]` (real data), `[template]` (fell back to `templates/*.csv`), or `[empty]` (no data, env vars unset). |
| The build failed | The fetcher fails loudly when a required column is missing. Check the build log for `[fetch-sheets]` — the error message names the missing column. Restore the column header in the Sheet and rebuild. |

---

## Things this doc doesn't cover

- One-time setup of the Sheet and Vercel env vars: `docs/sheet-setup.md`
- The full design system rationale: `CLAUDE.md` § "Design system" plus the bundled docs under `design-system/sustainable-solutions-lab-design-system/` (gitignored, kept locally for reference)
- Local development setup: `README.md`
