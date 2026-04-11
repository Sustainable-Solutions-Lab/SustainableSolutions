# Data Pipeline

Converts the fuel treatment CSV into web-ready map tiles.

## Prerequisites

```bash
# Python dependencies
pip install -r requirements.txt

# tippecanoe (tile generation binary)
brew install tippecanoe
```

## Step 1 — Development: GeoJSON (small areas or testing)

```bash
python build_geojson.py \
  --input /path/to/your/data.csv \
  --output ../public/fuel-treatment.geojson
```

This produces a GeoJSON file you can load locally in the browser for fast iteration.
Not suitable for the full California dataset (~420k features would be too slow).

## Step 2 — Production: PMTiles

```bash
python build_tiles.py \
  --input /path/to/your/data.csv \
  --output fuel-treatment.pmtiles
```

This calls tippecanoe to produce a single `.pmtiles` file — a compact binary tile
archive that the browser loads on demand.

## Step 3 — Upload to Cloudflare R2

1. Log in at https://dash.cloudflare.com
2. Open **R2 Object Storage** → your bucket (or create one)
3. Upload `fuel-treatment.pmtiles`
4. Enable public access on the bucket
5. Copy the public URL, e.g.:
   `https://pub-XXXX.r2.dev/fuel-treatment.pmtiles`

## Step 4 — Update the config

Open `projects/fuel-treatment/config.js` and replace:
```js
tilesUrl: 'REPLACE_WITH_R2_URL',
```
with:
```js
tilesUrl: 'https://pub-XXXX.r2.dev/fuel-treatment.pmtiles',
```

## Step 5 — Fetch California county boundaries (one-time)

The map always shows county borders. Download the simplified GeoJSON and place it in `public/`:

```bash
curl -o public/counties-ca.geojson \
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/california-counties.geojson"
```

Or use any Census TIGER simplified county file clipped to California.
The file should be under 500 KB. Commit it to the repo (it never changes).

---

## Column names

The pipeline assumes these CSV column names. Update `PROPERTY_COLUMNS` in each
script if your actual columns differ:

| Expected column    | Description                  |
|--------------------|------------------------------|
| `lat`              | Cell center latitude         |
| `lon`              | Cell center longitude        |
| `net_benefit`      | Net benefit ($/km²)          |
| `total_benefit`    | Total benefit ($/km²)        |
| `property_benefit` | Property damage avoided ($/km²) |
| `health_benefit`   | Health benefit from smoke reduction ($/km²) |
| `treatment_cost`   | Treatment cost ($/km²)       |
| `bcr`              | Benefit-cost ratio           |
