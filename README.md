# Sustainable Solutions Lab

Website for the Sustainable Solutions Lab at Stanford's Doerr School of Sustainability.
See `CLAUDE.md` for the full project brief — stack decisions, content model, and development sequence.

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
```

## Common scripts

```bash
npm run dev              # Astro dev server
npm run build            # runs `prebuild` (CSV fetch) then `astro build`
npm run preview          # serve the built site locally
npm run fetch:sheets     # refresh Google Sheets data into src/data/ without rebuilding
npm run build:materials  # rebuild the materials-explorer data layers
npm run refresh-scholar  # refresh publications from Google Scholar
```

The `prebuild` step fetches Google Sheets data via published-CSV URLs and writes JSON to `src/data/` (gitignored). If the env vars aren't set locally, the build still runs — it just produces empty data files.

## Environment

Copy `.env.example` to `.env` and fill in the published-CSV URLs from the Google Sheet.

## Repository layout

- `src/pages/`, `src/components/`, `src/content/` — the Astro site (see `CLAUDE.md` for the page-by-page guidance).
- `src/tools/` — interactive tools. See `src/tools/README.md` for what lives where: `_engine/` (reusable config-driven data explorer), `materials/` (thin config that drives `_engine`), `magnets/` and `firemap/` (bespoke standalone tools).
- `scripts/` — build-time data fetchers and `*.command` helpers.
- `templates/` — working data files (sheet CSVs, Scholar exports).
- `docs/planning/` — planning notes.
- `dist/` (Astro) and `build/` (everything else) — generated outputs; gitignored.
