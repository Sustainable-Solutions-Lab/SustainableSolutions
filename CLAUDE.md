# Sustainable Solutions Lab — Website Rebuild

This file is the project brief for Claude Code. Read it first in every session. Update it as decisions evolve.

## Project goal

Rebuild the Sustainable Solutions Lab website. The current site is hosted on Stanford Sites (Drupal), at `sustainablesolutions.stanford.edu`. The new site will be a custom build deployed to Vercel, eventually accessible at the same `sustainablesolutions.stanford.edu` URL via DNS re-point through Stanford UIT NetDB.

The lab is led by Steve Davis, Professor of Earth System Science at Stanford's Doerr School of Sustainability. The site needs to look modern and distinctive, clearly differentiated from the standard Stanford Doerr Drupal aesthetic, while remaining recognizably part of the Stanford ecosystem.

## Why we're rebuilding

The current Drupal site is constrained in design and functionality. Specifically:
- Limited control over visual design and typography
- No way to surface interactive research outputs (e.g., the lab's existing interactive map)
- Publications page is a flat chronological wall — no filtering by theme, year, or person
- Home page can't lead with interactive content
- "Resources" navigation label is vague and underused

We've already built an interactive research map deployed on Vercel. The new site should make that kind of interactive output a first-class feature, not an afterthought.

## Stack decisions (locked in)

- **Framework**: Astro (static-first, with islands for interactivity). Next.js was considered but Astro is a better fit for a content-heavy site with isolated interactive components.
- **Interactive tools**: React islands via `@astrojs/react`. The Firemap project (currently a separate Next.js app) ports its React + MapLibre + PMTiles + D3 components into this repo as Astro islands. Future tools follow the same pattern: one config file + a React island per tool.
- **Styling**: Tailwind CSS v4 (CSS-first configuration via `@theme`). The design system's `colors_and_type.css` is the single source of truth for tokens; Tailwind utility classes inherit from those CSS variables. No `tailwind.config.js` (deprecated in v4).
- **Theming**: Light + dark mode, both defined by the design system. Toggled via `[data-theme="dark"]` on the root.
- **Icons**: Lucide (1.5px stroke, 24px grid). React variant for islands; SVG sprite or inline for static pages.
- **Hosting**: Vercel. Auto-deploy from a GitHub repo on every commit. Preview deployments per pull request.
- **Domain**: Build and stage at a temporary Vercel URL (e.g., `sustainable-solutions.vercel.app`). Once approved, file a NetDB ticket with Stanford UIT to re-point `sustainablesolutions.stanford.edu` (CNAME to Vercel). SSL handled automatically by Vercel/Let's Encrypt.
- **Content for structured data**: Google Sheets, **published as CSV per tab** (Google Sheets → File → Share → Publish to web → CSV). Fetched at build time via plain HTTP, normalized to JSON in the repo, statically rendered. No service account, no Google Cloud project, no API keys. New row in sheet → deploy hook → site rebuilds in ~30-90 seconds.
- **Content for prose**: Markdown files in the repo (`/content/research/*.md`, `/content/about.md`, etc.).
- **Images**: Public images committed to `/public/` in the repo. People photos and lab images go in `/public/people/` and `/public/images/`. We don't host images in Sheets/Drive in production — too unreliable for a public site.
- **Version control**: Git, GitHub. Commit early and often.

## Out of scope for v1

- Authentication / member-only areas
- Contact form with backend (use `mailto:` links instead)
- Newsletter signup with backend (can use a third-party form service if needed later)
- Full headless CMS (Sanity, Contentful) — sheets + Markdown is sufficient for now
- Migrating historical content beyond what's currently on the live site
- Multi-language support
- Slide-deck design system (the design bundle flagged this as not yet built)

## Design system

The design system was developed in Claude Design and exported as a bundle. **The full reference lives at `design-system/sustainable-solutions-lab-design-system/`** (gitignored — keep locally for reference only). The production token source is `src/styles/colors_and_type.css`, copied from the bundle.

**Synthesis**: CarbonPlan (dark/mono/grid) × NYT graphics (small-caps eyebrows, hairline rules, italic captions) × ColorBrewer Spectral (signature data palette). A whisper of Stanford DNA via Cardinal `#8C1515` accent only — never as a banner.

**Tagline (working)**: *Underexamined questions. Lasting answers.*

### Colors (sampled from the lab logo)

```
Paper / Ink (light, default)
  paper:        #F8F8E8   (cream canvas)
  paper-2:      #F1F1DF   (recessed surface)
  paper-3:      #E8E8D4   (alternate row)
  ink:          #181838   (navy ink, body text)
  ink-2:        #3A3A5A   (secondary text)
  ink-3:        #6B6B80   (tertiary / metadata)
  ink-4:        #9A9AAE   (disabled / hint)
  rule:         rgba(24, 24, 56, 0.14)   (hairline border)
  rule-strong:  rgba(24, 24, 56, 0.28)

Paper / Ink (dark, [data-theme="dark"])
  paper:        #0C0C1C   (deep navy canvas)
  paper-2:      #14142A
  paper-3:      #1C1C36
  ink:          #F8F8E8   (cream foreground)
  ink-2:        #C8C8D8
  ink-3:        #9A9AB0
  ink-4:        #686880
  cardinal:     #E04545   (lifted for dark-mode contrast)

Brand (sampled from logo)
  brand-navy:   #181838
  brand-green:  #48A848
  brand-teal:   #78C8D8
  brand-orange: #E87828
  brand-cream:  #F8F8E8

Cardinal accent (Stanford DNA)
  cardinal:     #8C1515   (light mode)
  Used as: hairline accent, marker dot, focus ring, single emphasized number.
  Never as: a fill, banner, or background.

ColorBrewer Spectral (the lab's signature data palette)
  #9E0142  #D53E4F  #F46D43  #FDAE61  #FEE08B  #FFFFBF
  #E6F598  #ABDDA4  #66C2A5  #3288BD  #5E4FA2
  Used for: all qualitative and diverging chart data by default.
```

### Typography

| Role             | Family                                                   |
|------------------|----------------------------------------------------------|
| Display, headlines | Source Serif 4 *(or Tiempos Headline if licensed)*     |
| UI, body         | Inter                                                    |
| Mono (chart labels, eyebrows, code, metadata) | JetBrains Mono             |

Scale (1.20 minor-third, anchored 16px): 11 / 13 / 16 / 19 / 23 / 28 / 34 / 41 / 56 / 72 px.
Line heights: 1.12 (tight) / 1.28 (snug) / 1.5 (normal) / 1.7 (loose).

### Spacing, radii, shadows

```
Spacing (4px base): 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128
Radii:              2 (sm) / 4 (md) / 8 (lg) — never higher
Shadows:            None on flat surfaces. One pop shadow for floating UI:
                    0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)
Layout:             content-max 1200px, prose-max 680px, 12-col grid, 24px gutter
```

### Voice & content (excerpted from design system)

- **First-person plural ("we"), not "the team" or "researchers."** "Steve" or "Steve Davis" externally — never "Dr. Davis" or "Professor Davis."
- **No emoji. No exclamation marks. No hype.** Avoid: "unlock," "leverage," "harness," "empower," "sustainability journey," "net-zero future."
- **Sentence case** for everything except proper nouns and journal titles. Headlines included.
- **Small caps** (mono, tracked) for eyebrows: `NATURE SUSTAINABILITY · DEC 11 2025`.
- **Real Unicode** for units: `1.5 °C`, `0.8 g CO₂-eq/kcal`. Never `^2` or `--`. En-dash for ranges: `2020–2050`.
- **Italic** for journal names where space allows.

### Iconography

Lucide (1.5px stroke, 24px grid). Sizes: 16px inline / 20px in buttons / 24px standalone. `currentColor` only — no multicolor icons. Never emoji except `↗` for external links.

### Charts (the lab's signature surface — first-class component family)

- 16:10 or 4:3 aspect ratios; rectangular (no rounding).
- Eyebrow above title (mono small-caps, 11px). Title in serif 18px. Italic serif caption below, max 680px.
- Spectral palette by default. Single-series uses ink line + Cardinal for the highlighted point.
- Direct annotations on the chart (NYT-style) for ≤ 5 series, not legends.
- No chart junk: no gridlines unless they aid reading; no 3D; no drop shadows.

### Coordinate readout (CarbonPlan move)

A fixed monospaced `X,Y: 0427,1284` readout in the bottom-left, tracking scroll. Optional, off by default, on for the home and research index pages.

### Apply via Tailwind v4

`src/styles/colors_and_type.css` contains the canonical CSS variables. Tailwind v4's `@theme` directive in `src/styles/global.css` exposes those variables as utility classes (e.g., `bg-paper`, `text-ink-2`, `border-rule`, `font-serif`, `text-2xl`). All components use tokens; no hard-coded hex values.

## Information architecture

```
/                              Home
/research                      Research overview
/research/energy-systems       Theme page
/research/land-use             Theme page
/research/trade                Theme page
/research/impacts              Theme page
/research/solutions            Theme page
/people                        Current + Alumni grid (with CIU as filter)
/publications                  Filterable list
/tools                         Interactive tools, datasets, code releases
/tools/[slug]                  Individual tool pages (e.g., the existing map)
/news                          News + announcements
/news/[slug]                   Individual posts (when long-form)
/contact                       Contact info
```

**Renames from the current site:**
- "Resources" → "Tools" (more concrete, signals the lab ships things)
- "Conceptual Investigations Unit" drops out of top nav and becomes a filter on the People page and a tag on Publications

**Top nav (in order)**: Research · People · Publications · Tools · News · About/Contact

## Page-by-page guidance

### Home
- Lead with an interactive component (the map, or a featured visualization) above the fold, full-width
- Below: ~2 sentences on what the lab does
- Then: 4–6 featured items (a "Featured" sheet drives this — see below)
- Footer: contact, Stanford branding, social

### Research
- Overview page: a 2–3 paragraph synthesis of what the lab studies, then cards linking to each theme page
- Theme pages: prose Markdown, with embedded figures, callouts, and an auto-generated list of papers tagged to that theme (filtered from the publications data)

### People
- Grid of cards: photo, name, role, current affiliation (for alumni)
- Filters: Current / Alumni / Conceptual Investigations Unit
- Click → individual person page (optional in v1) or external link to their site

### Publications
- Reverse chronological by default
- Filters: theme tag, year, person, featured
- Each entry: full citation, link to DOI, link to PDF if available, link to replication code if available
- Search box (client-side, since data is static at build time)

### Tools
- Cards for each tool/dataset/code release
- Tool pages can either embed an interactive component (the map) or link out
- Should feel like a real "products" page, not a links dump

### News
- Reverse chronological list
- Two types: short announcements (one-liner with link) vs. long-form posts (Markdown file with `/news/[slug]` route)
- Sheet drives the announcement type; Markdown drives the long-form

## Content model

| Content type      | Storage              | Update mechanism                       |
|-------------------|----------------------|----------------------------------------|
| Publications      | Google Sheet         | Add row, trigger rebuild               |
| People            | Google Sheet         | Add/edit row, trigger rebuild          |
| News (short)      | Google Sheet         | Add row, trigger rebuild               |
| News (long-form)  | Markdown in repo     | Commit a `/content/news/[slug].md`     |
| Featured items    | Google Sheet         | Edit rows to swap home page features   |
| Research themes   | Markdown in repo     | Commit a `/content/research/[slug].md` |
| About / Contact   | Markdown in repo     | Edit and commit                        |
| Tools             | Markdown + code      | Commit                                 |
| People photos     | `/public/people/`    | Commit image files                     |

## Google Sheets schemas

All sheets live in a single Google Spreadsheet titled "SSL Site Content" with one tab per content type. Each tab is **published as CSV** via Google Sheets' "Publish to web" feature. The published CSV URLs live in Vercel environment variables (never committed). No service account or API key is required because the data is public anyway (it goes on a public website).

### Tab: `Publications`

Most columns are auto-populated by `scripts/scholar-to-csv.js` from Google
Scholar — the user maintains only the manual columns (featured, ignore,
brief_url, ppt_url, press_url, image_filename, pdf_url, code_url) and may
override auto-guessed themes. The script preserves these by DOI on every
refresh, so paste-the-whole-CSV-into-the-sheet is a safe workflow.

`abstract` is intentionally rightmost — long prose pushes other columns
off-screen otherwise.

| Column | Name              | Type / Format                                  | Notes                                          |
|--------|-------------------|------------------------------------------------|------------------------------------------------|
| A      | authors           | Text, semicolon-separated                      | Auto from Scholar. "Davis, Steven J.; …"       |
| B      | title             | Text                                           | Auto from Scholar                              |
| C      | journal           | Text                                           | Auto from Scholar                              |
| D      | year              | Integer                                        | Auto from Scholar                              |
| E      | month             | Integer (1–12)                                 | Auto from Scholar; optional                    |
| F      | volume_issue      | Text                                           | Auto. "16(1)" or blank                         |
| G      | pages             | Text                                           | Auto from Scholar                              |
| H      | doi               | Text                                           | Auto. Just the DOI, not full URL               |
| I      | url               | Text                                           | Auto. Journal-page URL, falls back to doi.org  |
| J      | featured          | Boolean (TRUE/FALSE)                           | Manual                                         |
| K      | ignore            | Boolean (TRUE/FALSE) or "IGNORE"               | Manual. Hides the row from the site.           |
| L      | themes            | Text, comma-separated                          | Auto-guessed if blank; user override preserved |
| M      | lab_authors       | Text, comma-separated                          | Manual; slugs matching People sheet            |
| N      | pdf_url           | Text                                           | Manual                                         |
| O      | code_url          | Text                                           | Manual; replication code link                  |
| P      | brief_url         | Text                                           | Manual; research brief link                    |
| Q      | ppt_url           | Text                                           | Manual; slides link                            |
| R      | press_url         | Text                                           | Manual; press coverage link                    |
| S      | image_filename    | Text                                           | Manual; hero image in `/public/publications/`  |
| T      | abstract          | Text                                           | Auto from Scholar; rightmost (bulky)           |

### Tab: `People`

| Column | Name              | Type / Format                                  | Notes                                          |
|--------|-------------------|------------------------------------------------|------------------------------------------------|
| A      | slug              | Text, lowercase-hyphenated                     | "steve-davis" — used for matching              |
| B      | name              | Text                                           |                                                |
| C      | role              | Text                                           | "Postdoctoral Scholar", "PhD Student"          |
| D      | unit              | Text                                           | "main" or "ciu"                                |
| E      | status            | Text                                           | "current" or "alumni"                          |
| F      | photo_filename    | Text                                           | Just filename, e.g., "davis.jpg"; in `/public/people/` |
| G      | current_position  | Text                                           | For alumni: "Assistant Professor, MIT"         |
| H      | personal_url      | Text                                           | Optional                                       |
| I      | bio_short         | Text                                           | One sentence, optional                         |
| J      | joined_date       | Date (YYYY-MM)                                 |                                                |
| K      | left_date         | Date (YYYY-MM)                                 | Empty for current                              |
| L      | order             | Integer                                        | Sort order within their section; lower = first |
| M      | email             | Text                                           | Optional. Becomes a `mailto:` link             |
| N      | scholar_url       | Text                                           | Optional. Google Scholar profile URL           |
| O      | orcid             | Text                                           | Optional. ORCID iD (`0000-0002-…` form)        |
| P      | cv_url            | Text                                           | Optional. CV link (Google Drive, etc.)         |

### Tab: `News`

| Column | Name              | Type / Format                                  | Notes                                          |
|--------|-------------------|------------------------------------------------|------------------------------------------------|
| A      | date              | Date (YYYY-MM-DD)                              |                                                |
| B      | title             | Text                                           |                                                |
| C      | summary           | Text                                           | 1–2 sentences                                  |
| D      | type              | Text                                           | "paper" / "press" / "talk" / "award" / "other" |
| E      | link              | Text                                           | URL                                            |
| F      | image_filename    | Text                                           | Optional, in `/public/news/`                   |
| G      | featured          | Boolean (TRUE/FALSE)                           | Show on home page                              |
| H      | long_form_slug    | Text                                           | If set, links to `/news/[slug]` Markdown post  |

### Tab: `Featured`

A small tab (4–6 rows) controlling what appears in the home page "Featured" section. Lets non-developers swap the home page in 30 seconds.

| Column | Name              | Type / Format                                  | Notes                                          |
|--------|-------------------|------------------------------------------------|------------------------------------------------|
| A      | order             | Integer                                        |                                                |
| B      | title             | Text                                           |                                                |
| C      | blurb             | Text                                           | 1–2 sentences                                  |
| D      | image_filename    | Text                                           | In `/public/featured/`                         |
| E      | link              | Text                                           | Internal or external                           |
| F      | type              | Text                                           | "research" / "tool" / "publication" / "news"   |

## Build pipeline

**At build time, Astro runs a script that:**
1. Fetches each published-CSV URL (one per Sheet tab) over plain HTTP
2. Parses CSV, normalizing rows into typed objects (handling booleans, dates, comma-separated lists, etc.)
3. Validates the schema (fails the build loudly if a required column is missing or a row is malformed — better than producing silently-wrong JSON)
4. Writes JSON files to `src/data/` (e.g., `src/data/publications.json`) — gitignored
5. Astro pages import these JSON files and render statically

**To update the site after editing a sheet:**
- A small Google Apps Script attached to the spreadsheet pings a Vercel deploy hook on edit (debounced to avoid hammering)
- Vercel rebuilds, pulls the latest sheet data, deploys
- Total time from edit to live: ~30–90 seconds

The deploy hook URL is a Vercel secret. The Apps Script lives in the spreadsheet's bound script editor.

**Fallback**: a "Rebuild site" button can also be embedded in the spreadsheet (custom menu item via Apps Script) for manual triggering.

## File structure (proposed)

```
/
├── CLAUDE.md                       # this file
├── README.md                       # human-facing readme
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── .env.example                    # template for env vars
├── .gitignore
│
├── public/
│   ├── people/                     # photos
│   ├── featured/                   # home page featured images
│   ├── news/                       # news images
│   ├── images/                     # everything else
│   └── favicon.svg
│
├── src/
│   ├── data/                       # generated at build time — gitignored
│   │   ├── publications.json
│   │   ├── people.json
│   │   ├── news.json
│   │   └── featured.json
│   │
│   ├── content/                    # Markdown content
│   │   ├── research/
│   │   │   ├── energy-systems.md
│   │   │   ├── land-use.md
│   │   │   └── ...
│   │   ├── news/                   # long-form posts
│   │   ├── tools/
│   │   ├── about.md
│   │   └── contact.md
│   │
│   ├── components/                 # Astro components
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── PersonCard.astro
│   │   ├── PublicationItem.astro
│   │   ├── NewsItem.astro
│   │   ├── FeaturedGrid.astro
│   │   └── Map.astro               # the interactive map (or wrapper around it)
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── ResearchLayout.astro
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── research/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── people.astro
│   │   ├── publications.astro
│   │   ├── tools/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── news/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   └── contact.astro
│   │
│   ├── styles/
│   │   ├── colors_and_type.css     # canonical design tokens (from design system)
│   │   └── global.css              # Tailwind v4 @theme + base styles
│   │
│   └── tools/                      # interactive tool islands (React)
│       └── firemap/                # ported from Firemap repo: map components, configs
│
└── scripts/
    ├── fetch-sheets.js             # the build-time CSV-fetching + validating script
    └── apps-script-deploy-hook.js  # for reference; lives in Google's editor
```

## Environment variables (Vercel)

```
SHEET_PUBLICATIONS_CSV=https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&single=true&output=csv
SHEET_PEOPLE_CSV=...
SHEET_NEWS_CSV=...
SHEET_FEATURED_CSV=...
VERCEL_DEPLOY_HOOK_URL=...           # for the Apps Script edit trigger
```

`.env.example` should list the variable names with placeholder values; never commit real values. The CSV URLs are technically public (anyone with the URL can read them) but treating them as secrets keeps the Sheet URL out of public version control and lets us rotate by republishing.

## Development sequence (recommended)

Build in this order so each layer can be verified before the next:

1. **Scaffold**: Initialize Astro project, install Tailwind, commit. Add `.gitignore` for `node_modules`, `.env`, `dist`, `src/data`.
2. **Design tokens**: Translate the design system into `tailwind.config.js`. Verify with a sandbox page that uses every color/font/scale value.
3. **Layout & navigation**: Build `BaseLayout`, `Nav`, `Footer` with placeholder pages for every route. Site should be fully navigable, even if pages are empty.
4. **Sheets pipeline**: Set up the Google Sheet with the schemas above. Set up service account credentials. Write `scripts/fetch-sheets.js`. Verify it produces correct JSON. Wire it into the Astro build (`prebuild` script in `package.json`).
5. **People page**: Smallest, simplest data model. Build the page using the fetched data. This validates the whole pipeline end-to-end.
6. **Publications page**: Build with filters (theme, year, person, featured). This is the highest-value page for site visitors.
7. **News page**: Both list view and Markdown-driven detail pages.
8. **Research theme pages**: Migrate existing prose into Markdown. Each page auto-pulls related publications by tag.
9. **Tools page**: Embed or fold in the existing interactive map. Decide upfront whether to copy the map's code into this repo or keep it separate and iframe.
10. **Home page**: Built last, because it pulls from everything else (Featured sheet, recent news, possibly the map as hero).
11. **Apps Script deploy hook**: Wire it up so editors see live updates without developer involvement.
12. **Stage and review**: Share the temporary Vercel URL with the lab. Iterate.
13. **DNS cutover**: File NetDB ticket. Verify SSL. Sunset the old Drupal site.

## Constraints & considerations

- **Accessibility**: Stanford requires WCAG-compliant sites. Use semantic HTML, real headings, alt text on every image, keyboard-navigable interactive components, sufficient color contrast in the design system.
- **Performance**: Astro is fast by default. Keep it that way: optimize images (`astro:assets`), avoid client-side JS where unnecessary, lazy-load below-the-fold content.
- **Maintainability by non-developers**: The whole point of the sheets-based approach. Lab members should be able to add a publication, person, or news item without touching code or Git. Document the workflow in a separate `docs/editing-content.md` once the system is working.
- **No vendor lock-in**: Astro builds to static HTML/CSS/JS. If Vercel ever becomes problematic, the same build deploys to Netlify, Cloudflare Pages, or any static host without changes.

## Resolved decisions

- [x] **Design system**: Claude Design bundle, see Design system section above. Tokens in `src/styles/colors_and_type.css`.
- [x] **Map fold-in**: yes — Firemap's React + MapLibre + PMTiles + D3 components port into this repo as Astro islands. Future tools follow the same pattern.
- [x] **Individual people pages**: yes for v1.
- [x] **Contact form**: skip. `mailto:` links only.
- [x] **Research themes**: keep current 5 (energy-systems, land-use, trade, impacts, solutions) for v1; revisit once content is in.
- [x] **Sheets data access**: published-CSV (no service account).
- [x] **Tailwind version**: v4 (CSS-first, no `tailwind.config.js`).
- [x] **Dark mode**: in scope (defined by the design system).

## First task for Claude Code

When ready to start coding, first task:

> Initialize a new Astro project with Tailwind in this directory. Create `tailwind.config.js` with placeholder design tokens (the actual values will be filled in from the Design System section of CLAUDE.md). Set up a clean file structure matching the proposed layout in CLAUDE.md. Create empty placeholder pages for every route listed in the Information Architecture section. Initialize git and make a first commit. Don't add real content yet — we'll do that in subsequent steps.
