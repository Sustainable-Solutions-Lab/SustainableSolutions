# Sustainable Solutions Lab

Website for the Sustainable Solutions Lab at Stanford's Doerr School of Sustainability.

See `CLAUDE.md` for the full project brief — stack decisions, content model, and development sequence.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # runs `prebuild` (CSV fetch) then `astro build`
```

The `prebuild` step fetches Google Sheets data via published-CSV URLs and writes JSON to `src/data/` (gitignored). If the env vars aren't set locally, the build still runs — it just produces empty data files.

## Environment

Copy `.env.example` to `.env` and fill in the published-CSV URLs from the Google Sheet.
