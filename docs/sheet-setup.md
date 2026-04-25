# Sheet setup

The site reads structured data (publications, people, news, featured items) from a single Google Sheet. Each tab is published as CSV and fetched at build time. No service account, no API keys.

## One-time setup

1. **Create a new Google Sheet** named `SSL Site Content`.
2. **Add four tabs**: `Publications`, `People`, `News`, `Featured`. Tab name casing matters for clarity but doesn't affect the build (the build reads the published-CSV URL, not the tab name).
3. **Paste the column headers** from each template CSV in this directory's sibling `templates/` folder into row 1 of the matching tab. The headers must match exactly — see `CLAUDE.md` § "Google Sheets schemas" for the canonical list.
4. **Copy the sample rows** if you want a starting point; otherwise just leave row 1 and add real data below.

## Publish each tab as CSV

For each tab:

1. **File** → **Share** → **Publish to web**.
2. **Link** tab → in the dropdowns, choose the specific tab name (not "Entire Document"), and choose **Comma-separated values (.csv)**.
3. Click **Publish**, confirm. Copy the URL it gives you. It looks like:
   ```
   https://docs.google.com/spreadsheets/d/e/<long-id>/pub?gid=<tab-id>&single=true&output=csv
   ```
4. Paste each URL into Vercel as an environment variable:

   | Tab           | Env var                     |
   |---------------|-----------------------------|
   | Publications  | `SHEET_PUBLICATIONS_CSV`    |
   | People        | `SHEET_PEOPLE_CSV`          |
   | News          | `SHEET_NEWS_CSV`            |
   | Featured      | `SHEET_FEATURED_CSV`        |

   Set them in Vercel → Project → Settings → Environment Variables, scoped to **Production**, **Preview**, and **Development** if you want them available in `vercel dev`.

## Local development

Copy `.env.example` to `.env` and paste the same URLs in. Or — leave `.env` empty and the build will fall back to the sample CSVs in `templates/`.

## Edit-triggered rebuilds

Once the site is wired:

1. **Vercel** → Project → Settings → Git → **Deploy Hooks** → create one named `apps-script-edit-trigger`. Copy its URL.
2. **Google Sheet** → Extensions → Apps Script. Paste in the contents of `scripts/apps-script-deploy-hook.js`.
3. In Apps Script → Project Settings → Script Properties, set `DEPLOY_HOOK_URL` to the URL from step 1.
4. Run the `setUp` function once (it requests permissions and registers the on-edit trigger plus a "SSL site → Rebuild now" menu in the Sheet).

After that, any cell edit will trigger a rebuild ~30 seconds later (debounced so a flurry of edits only kicks one build).

## Data quality

- The build **fails loudly** if a required column is missing from a tab. See `scripts/fetch-sheets.js` for which columns are required per tab.
- Booleans (`featured`, etc.) accept `TRUE`/`FALSE` (case-insensitive) and become real JSON booleans.
- Comma-separated columns (`themes`, `lab_authors`) become arrays. Don't quote-wrap individual items.
- Empty cells become `null` in the JSON.
