"""
scripts/build_geojson.py

Convert the fuel treatment CSV to a GeoJSON file for development and testing.
For production, use build_tiles.py to generate PMTiles.

Usage:
    python build_geojson.py --input path/to/data.csv --output public/fuel-treatment.geojson

TODO (Agent H): verify column names against the actual CSV, then implement.
"""

import argparse
import json
import sys
import pandas as pd


# Column names to include as feature properties.
# Update these to match the actual CSV column names.
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


def csv_to_geojson(input_path: str, output_path: str) -> None:
    print(f'Reading {input_path}...')
    df = pd.read_csv(input_path)

    # Validate expected columns
    missing = [c for c in [LAT_COL, LON_COL] + PROPERTY_COLUMNS if c not in df.columns]
    if missing:
        print(f'WARNING: expected columns not found: {missing}')
        print(f'Available columns: {list(df.columns)}')

    features = []
    for _, row in df.iterrows():
        props = {}
        for col in PROPERTY_COLUMNS:
            if col in row:
                val = row[col]
                props[col] = round(float(val), 2) if pd.notna(val) else None

        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [round(float(row[LON_COL]), 5), round(float(row[LAT_COL]), 5)],
            },
            'properties': props,
        }
        features.append(feature)

    geojson = {'type': 'FeatureCollection', 'features': features}

    with open(output_path, 'w') as f:
        json.dump(geojson, f)

    # Summary stats
    lats = df[LAT_COL]
    lons = df[LON_COL]
    print(f'Written {len(features):,} features to {output_path}')
    print(f'Bounding box: [{lons.min():.3f}, {lats.min():.3f}, {lons.max():.3f}, {lats.max():.3f}]')
    if 'net_benefit' in df.columns:
        nb = df['net_benefit'].dropna()
        print(f'net_benefit range: {nb.min():,.0f} to {nb.max():,.0f} $/km²')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert fuel treatment CSV to GeoJSON')
    parser.add_argument('--input', required=True, help='Path to input CSV file')
    parser.add_argument('--output', required=True, help='Path for output GeoJSON file')
    args = parser.parse_args()

    csv_to_geojson(args.input, args.output)
