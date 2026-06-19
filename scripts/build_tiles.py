"""
scripts/build_tiles.py

Convert fuel treatment data to a multi-resolution PMTiles vector tile archive.

Three zoom-level bands are generated automatically:
  Zoom  4–6:  8×8 block averages  (~2k features)   — state/region scale
  Zoom  7–9:  3×3 block averages  (~20k features)  — county scale
  Zoom 10–14: original resolution (~293k features) — local scale

Each band is tagged with tippecanoe per-feature minzoom/maxzoom so the tile
loader sends only the right resolution to the browser at each zoom level.
A _scale property (8, 3, or 1) is added to each feature so MapLibre can
size circles correctly for the cell resolution being rendered.

Upload the resulting .pmtiles file to Cloudflare R2, then set tilesUrl in
projects/fuel-treatment/config.js.

Prerequisites:
    brew install tippecanoe
    pip install -r requirements.txt

Usage:
    python build_tiles.py \\
        --input data/Net_benefit_current.nc \\
        --rename Net_benefit:net_min_current \\
        --output fuel-treatment.pmtiles
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import pandas as pd

# Reuse helpers from build_geojson
from build_geojson import (
    read_csv, read_netcdf, netcdf_to_df, parse_rename, LAT_COL, LON_COL
)

LAYER_NAME = 'fuel-treatment'

# (coarsen_factor, tippecanoe_minzoom, tippecanoe_maxzoom)
# _scale values must match the MapLibre layer filters in lib/use-map-layer.js:
#   COARSE: _scale ≥ 10  (MapLibre maxzoom=5.5) — big circles at default zoom
#   MED:    _scale 3–9   (MapLibre zoom 5.5–8)  — smaller circles on zoom-in
#   AGG:    _scale < 3   (MapLibre minzoom=8)   — full res at high zoom
#
# COARSE maxzoom=7 gives tippecanoe plenty of buffer above the MapLibre LOD
# switch at 5.5 — ensures COARSE features land in zoom 4–7 tiles and are
# available at the default desktop zoom (5.0).  MapLibre still hides them
# above zoom 5.5 via the layer maxzoom setting.
RESOLUTION_LEVELS = [
    (10, 4, 7),   # 0.1° grid,  _scale=10 → COARSE layer (MapLibre zoom 5.3–6)
    (3,  5, 9),   # 0.03° grid, _scale=3  → MED layer   (MapLibre zoom 6–7)
    (1,  7, 14),  # 0.01° grid, _scale=1  → AGG layer   (MapLibre minzoom=7)
]


def build_features(df, rename, min_zoom, max_zoom, scale):
    """Return a list of GeoJSON features with tippecanoe zoom control."""
    if rename:
        df = df.rename(columns=rename)

    prop_cols = [c for c in df.columns if c not in (LAT_COL, LON_COL)]

    features = []
    for _, row in df.iterrows():
        props = {}
        for col in prop_cols:
            val = row[col]
            if pd.isna(val):
                props[col] = None
            elif isinstance(val, float):
                props[col] = round(val, 4)
            else:
                props[col] = val
        props['_scale'] = scale

        features.append({
            'type': 'Feature',
            'tippecanoe': {'minzoom': min_zoom, 'maxzoom': max_zoom},
            'geometry': {
                'type': 'Point',
                'coordinates': [float(row[LON_COL]), float(row[LAT_COL])],
            },
            'properties': props,
        })
    return features


def build_tiles(input_path, output_path, rename):
    ext = os.path.splitext(input_path)[1].lower()

    if ext == '.nc':
        lats, lons, grids = read_netcdf(input_path)
        is_nc = True
    elif ext == '.csv':
        df_orig, _ = read_csv(input_path)
        is_nc = False
    else:
        print(f'ERROR: unsupported file extension "{ext}". Use .nc or .csv')
        sys.exit(1)

    all_features = []
    total_by_level = {}

    for (coarsen, min_z, max_z) in RESOLUTION_LEVELS:
        label = f'{coarsen}×{coarsen}' if coarsen > 1 else '1×1 (original)'
        print(f'\n── Level: {label}, zoom {min_z}–{max_z} ──')

        if is_nc:
            df = netcdf_to_df(lats, lons, grids, coarsen=coarsen, scale_value=coarsen)
        else:
            # CSV: no coarsening — use original for all levels (user can pre-aggregate)
            df = df_orig.copy()
            df['_scale'] = coarsen

        feats = build_features(df, rename, min_z, max_z, coarsen)
        all_features.extend(feats)
        total_by_level[label] = len(feats)
        print(f'  → {len(feats):,} features')

    print(f'\nTotal features across all levels: {len(all_features):,}')
    for label, n in total_by_level.items():
        print(f'  {label}: {n:,}')

    geojson = {'type': 'FeatureCollection', 'features': all_features}

    with tempfile.NamedTemporaryFile(mode='w', suffix='.geojson', delete=False) as tmp:
        json.dump(geojson, tmp)
        tmp_path = tmp.name

    print(f'\nWrote temp GeoJSON: {tmp_path}')

    try:
        cmd = [
            'tippecanoe',
            '--output', output_path,
            '--layer', LAYER_NAME,
            '--minimum-zoom', '4',
            '--maximum-zoom', '14',
            '--no-tile-compression',
            '--no-tile-size-limit',   # tiles may exceed 500KB; fine for R2/PMTiles
            '--no-feature-limit',     # never drop features to meet tile size budget
            '--force',
            tmp_path,
        ]
        print('\nRunning tippecanoe...')
        print(' '.join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print('tippecanoe failed:')
            print(result.stderr)
            sys.exit(1)

        size_mb = os.path.getsize(output_path) / 1e6
        print(f'\nDone. Output: {output_path} ({size_mb:.1f} MB)')
        print('\nNext steps:')
        print('  1. Upload to Cloudflare R2 (see scripts/README.md)')
        print('  2. Set tilesUrl in projects/fuel-treatment/config.js')

    finally:
        os.unlink(tmp_path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Convert fuel treatment CSV or NetCDF to multi-resolution PMTiles',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--input',  required=True, help='Path to input .csv or .nc file')
    parser.add_argument('--output', required=True, help='Output .pmtiles file path')
    parser.add_argument('--rename', metavar='SRC:DST', action='append',
                        help='Rename a variable. E.g. --rename Net_benefit:net_min_current')
    args = parser.parse_args()

    build_tiles(args.input, args.output, parse_rename(args.rename))
