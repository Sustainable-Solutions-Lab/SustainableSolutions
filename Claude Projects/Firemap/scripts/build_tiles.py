"""
scripts/build_tiles.py

Convert the fuel treatment CSV to a PMTiles vector tile archive via tippecanoe.
Upload the resulting .pmtiles file to Cloudflare R2 and update tilesUrl in
projects/fuel-treatment/config.js.

Prerequisites:
    brew install tippecanoe
    pip install -r requirements.txt

Usage:
    python build_tiles.py --input path/to/data.csv --output fuel-treatment.pmtiles

TODO (Agent H): implement and test against actual data.
"""

import argparse
import os
import subprocess
import sys
import tempfile
import json
import pandas as pd


PROPERTY_COLUMNS = [
    'net_benefit',
    'total_benefit',
    'property_benefit',
    'health_benefit',
    'treatment_cost',
    'bcr',
]

LAT_COL = 'lat'
LON_COL = 'lon'
LAYER_NAME = 'fuel-treatment'  # must match config.id in projects/fuel-treatment/config.js


def build_tiles(input_path: str, output_path: str) -> None:
    # Step 1: Convert CSV to a temporary GeoJSON
    print(f'Reading {input_path}...')
    df = pd.read_csv(input_path)
    print(f'Loaded {len(df):,} rows')

    features = []
    for _, row in df.iterrows():
        props = {}
        for col in PROPERTY_COLUMNS:
            if col in row:
                val = row[col]
                props[col] = round(float(val), 2) if pd.notna(val) else None

        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(row[LON_COL]), float(row[LAT_COL])],
            },
            'properties': props,
        })

    geojson = {'type': 'FeatureCollection', 'features': features}

    # Step 2: Write temp GeoJSON and call tippecanoe
    with tempfile.NamedTemporaryFile(mode='w', suffix='.geojson', delete=False) as tmp:
        json.dump(geojson, tmp)
        tmp_path = tmp.name

    try:
        cmd = [
            'tippecanoe',
            '--output', output_path,
            '--layer', LAYER_NAME,
            '--minimum-zoom', '4',
            '--maximum-zoom', '12',
            '--no-tile-compression',
            '--force',
            tmp_path,
        ]
        print('Running tippecanoe...')
        print(' '.join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print('tippecanoe failed:')
            print(result.stderr)
            sys.exit(1)

        size_mb = os.path.getsize(output_path) / 1e6
        print(f'Done. Output: {output_path} ({size_mb:.1f} MB)')
        print()
        print('Next step: upload to Cloudflare R2 and update tilesUrl in')
        print('  projects/fuel-treatment/config.js')

    finally:
        os.unlink(tmp_path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert fuel treatment CSV to PMTiles')
    parser.add_argument('--input', required=True, help='Path to input CSV file')
    parser.add_argument('--output', required=True, help='Output .pmtiles file path')
    args = parser.parse_args()

    build_tiles(args.input, args.output)
