> # ⚠️ ARCHIVED — superseded, do not deploy or edit
>
> This standalone app is an **earlier prototype**. The current, maintained
> "Fire Fuels" tool now lives **inside the SustainableSolutions site** at
> `src/tools/firemap/` and is served at
> **https://sustainablesolutions.stanford.edu/tools/firefuels**
> (repo: `Sustainable-Solutions-Lab/SustainableSolutions`).
>
> This repo is kept for reference only. _Archived 2026-06-19._

---

# Prioritizing Wildfire Fuel Management — Firemap

Interactive per-km² map of wildfire fuel treatment costs and benefits across California.  
Built with Next.js 14, MapLibre GL JS, and PMTiles.

**Live site:** [deployed on Vercel — update this link once confirmed]

---

## Table of Contents

1. [Running locally](#1-running-locally)
2. [Updating the data](#2-updating-the-data)
3. [Redeploying to Vercel](#3-redeploying-to-vercel)
4. [Adding to the Stanford / SDSS website](#4-adding-to-the-stanford--sdss-website)
5. [Adding a new project / scenario](#5-adding-a-new-project--scenario)

---

## 1. Running locally

```bash
# Clone and install
git clone https://github.com/ProfFate/FireMap.git
cd FireMap
npm install

# Start dev server
npm run dev
# → open http://localhost:3000
```

The dev build uses synthetic placeholder data from `public/fuel-treatment.geojson`.
No API keys are required.

---

## 2. Updating the data

When real model results are ready, follow these steps to replace the synthetic
placeholder data with the full California dataset.

### 2a. Prepare your CSV

Your CSV must have the columns listed in `data/COLUMN_NAMES.md`.  
The synthetic file `public/fuel-treatment.geojson` (and `data/synthetic_ca.csv` if
present) can serve as a format reference.

Key columns:
- `lat`, `lon` — cell center in WGS84 decimal degrees
- One column per variable (costs, benefits, net benefits, inputs)
- `cheapest` — string: `'rx_burn'`, `'mechanical'`, `'hand'`, or `'herbicide'`

### 2b. Install pipeline dependencies (one-time)

```bash
# Python packages
pip install -r scripts/requirements.txt

# tippecanoe — tile generator (Mac)
brew install tippecanoe
```

### 2c. Build the PMTiles file

Both scripts accept **NetCDF (`.nc`) or CSV (`.csv`)** input, auto-detected by
extension. Use `--rename SRC:DST` to map the variable name in the file to the
column ID expected by the app config.

**Current dataset** — `Net_benefit_current.nc` (lowest-cost treatment, current climate):

```bash
# Quick local preview (GeoJSON, ~38 MB — fine for dev):
python scripts/build_geojson.py \
  --input data/Net_benefit_current.nc \
  --rename Net_benefit:net_min_current \
  --output public/fuel-treatment.geojson

# Production tiles:
python scripts/build_tiles.py \
  --input data/Net_benefit_current.nc \
  --rename Net_benefit:net_min_current \
  --output fuel-treatment.pmtiles
```

**Adding more scenarios** — repeat for each new `.nc` file, then merge all columns
into one GeoJSON/PMTiles before uploading:

| File | `--rename` target |
|------|-------------------|
| `Net_benefit_current.nc` | `net_min_current` |
| `Net_benefit_ssp245.nc`  | `net_min_ssp245`  |
| `Net_benefit_ssp585.nc`  | `net_min_ssp585`  |
| `Net_benefit_rx_current.nc` | `net_rx_current` |
| *(etc.)* | *(see config variable ids)* |

For a merged multi-variable build, convert each file to a flat CSV first (one
column per variable, shared `lat`/`lon`), then pass the merged CSV to
`build_tiles.py`.

This produces a single binary file (`fuel-treatment.pmtiles`) that the browser
streams on demand — efficient for the full ~293k-cell California dataset.

Then run `npm run dev` to check the data looks right before building tiles.

### 2d. Upload to Cloudflare R2

1. Log in at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **R2 Object Storage** → open your bucket (or create one — free tier is generous)
3. Click **Upload** → select `fuel-treatment.pmtiles`
4. In bucket **Settings** → enable **Public Access**
5. Copy the public URL — it will look like:
   ```
   https://pub-XXXXXXXXXXXX.r2.dev/fuel-treatment.pmtiles
   ```

### 2e. Update the config

Open `projects/fuel-treatment/config.js` and replace the placeholder URL:

```js
// Before:
tilesUrl: 'REPLACE_WITH_R2_URL',

// After:
tilesUrl: 'https://pub-XXXXXXXXXXXX.r2.dev/fuel-treatment.pmtiles',
```

Also update the `domain` and `unit` for each variable to match the real data.
The `net_min_current` variable is already set to the real data range:

```js
// Already configured for the current dataset:
unit: '$k/km²',
domain: { min: -1000, max: 12500, zero: 0 },
```

Update the remaining variables (other treatments, SSP scenarios) once those
datasets are available. The map uses dynamic domain detection from rendered
features, so values only need to be roughly correct — they only affect the
initial render before tiles load.

### 2f. Test locally, then push

```bash
npm run dev        # verify the real data looks right
npm run build      # confirm no build errors
git add projects/fuel-treatment/config.js
git commit -m "Switch to real data on R2"
git push
```

Vercel will automatically redeploy within ~1 minute of the push.

---

## 3. Redeploying to Vercel

After any code or config change:

```bash
git add <changed files>
git commit -m "Description of change"
git push
```

Vercel watches the `main` branch and redeploys automatically.

To deploy immediately from the command line without a git push (useful for quick
iteration):

```bash
vercel --prod
```

---

## 4. Adding to the Stanford / SDSS website

There are two approaches depending on how much control you have over the Stanford
web page.

---

### Option A — iframe embed (easiest, works anywhere)

Paste this HTML snippet into any web page — a WordPress post, a lab page, an
HTML file, anywhere:

```html
<iframe
  src="https://YOUR-VERCEL-URL.vercel.app"
  width="100%"
  height="700"
  style="border: none; border-radius: 6px;"
  title="Prioritizing Wildfire Fuel Management"
  loading="lazy"
  allowfullscreen>
</iframe>
```

Replace `YOUR-VERCEL-URL` with your actual Vercel deployment URL.

**In WordPress (AEM or WordPress sites Stanford uses):**
1. Edit the page
2. Add an **HTML block** (or "Custom HTML" widget)
3. Paste the snippet above
4. Publish

Adjust `height` to taste — `600`–`800px` works well for a full-page embed.

---

### Option B — Custom subdomain (cleanest, looks most professional)

This makes the tool available at a URL like:
```
https://firemap.sustainablesolutions.stanford.edu
```

**Step 1 — Add the domain in Vercel:**
1. Go to your project on [vercel.com](https://vercel.com)
2. Click **Settings** → **Domains**
3. Type `firemap.sustainablesolutions.stanford.edu` and click **Add**
4. Vercel will show you a CNAME record to add — something like:
   ```
   Type:  CNAME
   Name:  firemap
   Value: cname.vercel-dns.com
   ```

**Step 2 — Ask Stanford IT to add the DNS record:**

Email [ithelp@stanford.edu](mailto:ithelp@stanford.edu) or your department's IT
contact. Include:

> Subject: DNS CNAME record request for sustainablesolutions.stanford.edu
>
> Please add the following DNS record to the sustainablesolutions.stanford.edu zone:
>
> Type:  CNAME  
> Name:  firemap  
> Value: cname.vercel-dns.com  
>
> This will point firemap.sustainablesolutions.stanford.edu to our research tool
> hosted on Vercel.

Stanford IT typically turns these around within 1–3 business days.

**Step 3 — Verify in Vercel:**

Once IT confirms the record is live, go back to Vercel **Settings → Domains** —
it will show a green checkmark and issue an SSL certificate automatically.

---

### Which option to use?

| | iframe | Subdomain |
|---|---|---|
| Requires IT help | No | Yes (DNS change) |
| URL looks like | sustainablesolutions.stanford.edu/research/firemap (page with embed) | firemap.sustainablesolutions.stanford.edu |
| Stanford branding | Inherits the surrounding page | Standalone app only |
| Setup time | Minutes | 1–3 days |

The iframe is the fastest path. The subdomain is better if the tool will be a
primary research output you want to cite.

---

## 5. Adding a new project / scenario

The tool is designed to be extensible — each project is a single config file.

1. Create a new folder: `projects/your-project-id/`
2. Copy `projects/fuel-treatment/config.js` as a starting point
3. Update `id`, `title`, `description`, `layers`, `dimensions`, `variables`, and `tilesUrl`
4. Create `projects/your-project-id/methods.mdx` (placeholder text is fine)
5. Register the project in `projects/index.js`:
   ```js
   import yourProject from './your-project-id/config.js'
   export const projects = {
     'fuel-treatment': fuelTreatment,
     'your-project-id': yourProject,
   }
   ```
6. Add a project selector to the sidebar or use a URL query param to switch projects

No other files need to change — the map, sidebar, and area tool all drive off the config.
