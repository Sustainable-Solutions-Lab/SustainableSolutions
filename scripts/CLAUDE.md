# Agent H — Data Pipeline Agent

## Role
Write the Python scripts that convert the source CSV into map-ready PMTiles and a
development GeoJSON. This agent works entirely in Python and has no JavaScript dependencies.

## Reads (do not modify)
- `projects/fuel-treatment/config.js`  — read for context (variable names, domain values)
  Note: this is a JS file; read it as documentation, do not import it in Python.

## Writes (owns these files)
- `scripts/build_tiles.py`
- `scripts/build_geojson.py`
- `scripts/requirements.txt`
- `scripts/README.md`

## Must NOT touch
Everything outside `scripts/`.

---

## Input data format (assumed)

CSV with at minimum these columns (verify against actual file):
- `lat`              float, cell center latitude
- `lon`              float, cell center longitude
- `net_benefit`      float, $/km²
- `total_benefit`    float, $/km²
- `property_benefit` float, $/km²
- `health_benefit`   float, $/km²
- `treatment_cost`   float, $/km²
- `bcr`              float, benefit-cost ratio

---

## scripts/build_geojson.py

Convert CSV → GeoJSON FeatureCollection (for development and small-scale testing).

```
Usage: python build_geojson.py --input data.csv --output public/fuel-treatment.geojson
```

- Each row becomes a GeoJSON Point feature
- All numeric columns become feature properties
- Round floats to 2 decimal places to keep file size reasonable
- Print row count, bounding box, and min/max of net_benefit on completion

---

## scripts/build_tiles.py

Convert CSV → PMTiles vector tile archive via tippecanoe (must be installed separately).

```
Usage: python build_tiles.py --input data.csv --output fuel-treatment.pmtiles
```

Steps:
1. Convert CSV to a temp GeoJSON (same logic as build_geojson.py)
2. Call tippecanoe via subprocess:
   tippecanoe \
     --output fuel-treatment.pmtiles \
     --layer fuel-treatment \
     --minimum-zoom 4 \
     --maximum-zoom 12 \
     --no-tile-compression \
     --force \
     temp.geojson
3. Report output file size

## scripts/requirements.txt

```
pandas
geopandas
shapely
```
tippecanoe is a separate binary (install via Homebrew: `brew install tippecanoe`).

## scripts/README.md

Document:
1. Prerequisites (Python env, tippecanoe)
2. How to run build_geojson.py for development
3. How to run build_tiles.py to produce the PMTiles file
4. How to upload the PMTiles file to Cloudflare R2
5. How to update the tilesUrl in projects/fuel-treatment/config.js

---

## Done when
- [ ] `build_geojson.py` runs on a sample CSV and produces valid GeoJSON
- [ ] `build_tiles.py` calls tippecanoe with correct flags
- [ ] `requirements.txt` lists all Python deps
- [ ] `README.md` documents the full data pipeline workflow
