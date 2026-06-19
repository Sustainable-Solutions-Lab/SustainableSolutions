"""
scripts/build_geojson.py

Convert fuel treatment data to a GeoJSON file for development and testing.
For production, use build_tiles.py to generate multi-resolution PMTiles.

Supports two input formats, auto-detected by file extension:
  .csv  — flat table with lat, lon, and variable columns
  .nc   — NetCDF4 (CF-convention) lat/lon grid

Use --coarsen N to block-average the grid into N×N cells before outputting.
Recommended for dev GeoJSON: --coarsen 5 reduces ~293k features to ~10k,
loads in <1s, and looks good at state scale.

Use --lod-scales N1,N2,... to generate multiple LOD layers in one file.
Each LOD gets _scale=N as a property, enabling MapLibre to show different
resolutions at different zoom levels. Recommended for dev:
  --lod-scales 40,5  → scale=40 (~730 cells) + scale=5 (~11.7k cells)

Optional --rename SRC:DST maps raw variable names to app config IDs.

Usage:
    # Dev (multi-LOD, recommended):
    python build_geojson.py \\
        --input data/Net_benefit_current.nc \\
        --rename Net_benefit:net_min_current \\
        --lod-scales 40,5 \\
        --output public/fuel-treatment.geojson

    # Dev (single coarsen factor):
    python build_geojson.py \\
        --input data/Net_benefit_current.nc \\
        --rename Net_benefit:net_min_current \\
        --coarsen 5 \\
        --output public/fuel-treatment.geojson

    # Full resolution (slow to load in browser, use for spot-checking only):
    python build_geojson.py \\
        --input data/Net_benefit_current.nc \\
        --rename Net_benefit:net_min_current \\
        --output public/fuel-treatment.geojson
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd


LAT_COL = 'lat'
LON_COL = 'lon'


# ── Grid block-averaging ──────────────────────────────────────────────────────

def block_average_2d(lats_1d, lons_1d, data_2d, n):
    """
    Average a 2D lat×lon grid into N×N blocks.

    Cells that are entirely NaN (no valid data in the block) are discarded.
    Returns (lats_out_1d, lons_out_1d, data_out_2d).
    """
    nlat, nlon = data_2d.shape

    # Trim to exact multiples of n to enable clean reshape
    nlat_trim = (nlat // n) * n
    nlon_trim = (nlon // n) * n
    data_trim = data_2d[:nlat_trim, :nlon_trim]
    lats_trim = lats_1d[:nlat_trim]
    lons_trim = lons_1d[:nlon_trim]

    n_blat = nlat_trim // n
    n_blon = nlon_trim // n

    # Reshape into blocks, then nanmean over the block axes
    data_blocks = data_trim.reshape(n_blat, n, n_blon, n)
    with np.errstate(all='ignore'):
        data_avg = np.nanmean(data_blocks, axis=(1, 3))  # (n_blat, n_blon)

    # Block-centre lat/lon
    lats_out = lats_trim.reshape(n_blat, n).mean(axis=1)
    lons_out = lons_trim.reshape(n_blon, n).mean(axis=1)

    return lats_out, lons_out, data_avg


# ── Readers ───────────────────────────────────────────────────────────────────

def read_csv(path):
    """Load a flat CSV. Returns DataFrame with lat/lon columns."""
    print(f'Reading CSV: {path}')
    df = pd.read_csv(path)
    missing = [c for c in [LAT_COL, LON_COL] if c not in df.columns]
    if missing:
        print(f'ERROR: required columns not found: {missing}')
        sys.exit(1)
    print(f'Loaded {len(df):,} rows, {len(df.columns)} columns')
    return df, None   # (df, grid_meta) — no grid meta for CSV


def read_netcdf(path):
    """
    Load a NetCDF4 lat/lon grid.
    Returns (lats_1d, lons_1d, {var_name: data_2d}).
    """
    try:
        import netCDF4 as nc
    except ImportError:
        print('ERROR: netCDF4 is not installed. Run: pip install netCDF4')
        sys.exit(1)

    print(f'Reading NetCDF: {path}')
    ds = nc.Dataset(path)

    coord_names = set()
    lat_var = lon_var = None
    for name in ds.variables:
        lower = name.lower()
        if lower in ('lat', 'latitude'):
            lat_var = name; coord_names.add(name)
        elif lower in ('lon', 'longitude'):
            lon_var = name; coord_names.add(name)

    if lat_var is None or lon_var is None:
        print(f'ERROR: could not find lat/lon variables in {path}')
        print(f'Variables: {list(ds.variables.keys())}')
        ds.close(); sys.exit(1)

    lats = np.array(ds.variables[lat_var][:].flatten(), dtype=float)
    lons = np.array(ds.variables[lon_var][:].flatten(), dtype=float)

    data_vars = [n for n in ds.variables if n not in coord_names]
    print(f'Data variables: {data_vars}')

    grids = {}
    for name in data_vars:
        arr = ds.variables[name][:]
        if hasattr(arr, 'filled'):
            arr = arr.filled(np.nan)
        arr = np.array(arr, dtype=float)
        if arr.ndim != 2 or arr.shape != (len(lats), len(lons)):
            print(f'WARNING: unexpected shape {arr.shape} for {name}, skipping')
            continue
        finite = arr[np.isfinite(arr)]
        units = getattr(ds.variables[name], 'units', '')
        long_name = getattr(ds.variables[name], 'long_name', '')
        print(f'  {name} ({long_name}): range {finite.min():.2f}–{finite.max():.2f}'
              f'{" " + units if units else ""}, {finite.size:,} valid cells')
        grids[name] = arr

    ds.close()
    return lats, lons, grids


def netcdf_to_df(lats, lons, grids, coarsen=1, scale_value=None):
    """
    Flatten a (optionally block-averaged) NC grid to a DataFrame.
    Adds _scale property when scale_value is provided.
    """
    if coarsen > 1:
        new_grids = {}
        for name, arr in grids.items():
            lats_c, lons_c, arr_c = block_average_2d(lats, lons, arr, coarsen)
            new_grids[name] = arr_c
        lats, lons, grids = lats_c, lons_c, new_grids
        print(f'  Block-averaged {coarsen}×{coarsen}: grid now {lats.shape[0]}×{lons.shape[0]}')

    lon_grid, lat_grid = np.meshgrid(lons, lats)
    df = pd.DataFrame({LAT_COL: lat_grid.flatten(), LON_COL: lon_grid.flatten()})
    for name, arr in grids.items():
        df[name] = arr.flatten()

    data_cols = list(grids.keys())
    before = len(df)
    df = df.dropna(subset=data_cols, how='all')
    print(f'  Kept {len(df):,} of {before:,} cells (dropped all-NaN rows)')

    if scale_value is not None:
        df['_scale'] = scale_value

    return df


# ── Writer ────────────────────────────────────────────────────────────────────

def df_to_features(df, rename):
    """Convert a DataFrame to a list of GeoJSON Feature dicts."""
    if rename:
        missing = [k for k in rename if k not in df.columns]
        if missing:
            avail = [c for c in df.columns if c not in (LAT_COL, LON_COL)]
            print(f'WARNING: rename source columns not found: {missing}')
            print(f'Available: {avail}')
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
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point',
                         'coordinates': [round(float(row[LON_COL]), 5),
                                         round(float(row[LAT_COL]), 5)]},
            'properties': props,
        })
    return features


def write_geojson(features, output_path, summary_df=None):
    """Write a list of GeoJSON Feature dicts to a file."""
    geojson = {'type': 'FeatureCollection', 'features': features}
    with open(output_path, 'w') as f:
        json.dump(geojson, f)

    size_mb = os.path.getsize(output_path) / 1e6
    print(f'\nWritten {len(features):,} features → {output_path} ({size_mb:.1f} MB)')

    if summary_df is not None:
        lons_col = summary_df[LON_COL]; lats_col = summary_df[LAT_COL]
        print(f'Bounding box: [{lons_col.min():.3f}, {lats_col.min():.3f},'
              f' {lons_col.max():.3f}, {lats_col.max():.3f}]')

        out_prop_cols = [c for c in summary_df.columns if c not in (LAT_COL, LON_COL)]
        for col in out_prop_cols:
            if col == '_scale':
                continue
            series = pd.to_numeric(summary_df[col], errors='coerce').dropna()
            if len(series) > 0:
                print(f'  {col}: {series.min():,.2f}–{series.max():,.2f}  (mean {series.mean():,.2f})')


def df_to_geojson(df, output_path, rename):
    features = df_to_features(df, rename)
    write_geojson(features, output_path, summary_df=df)


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_rename(values):
    result = {}
    for item in (values or []):
        if ':' not in item:
            print(f'WARNING: --rename "{item}" has no colon separator, skipping')
            continue
        src, dst = item.split(':', 1)
        result[src.strip()] = dst.strip()
    return result


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Convert fuel treatment CSV or NetCDF to GeoJSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('--input',      required=True, help='Path to input .csv or .nc file')
    parser.add_argument('--output',     required=True, help='Path for output .geojson file')
    parser.add_argument('--rename',     metavar='SRC:DST', action='append',
                        help='Rename a variable. E.g. --rename Net_benefit:net_min_current')
    parser.add_argument('--coarsen',    type=int, default=1, metavar='N',
                        help='Block-average the grid into N×N cells before output. '
                             'Only applies to NetCDF input. Default: 1 (no coarsening).')
    parser.add_argument('--lod-scales', metavar='N1,N2,...',
                        help='Generate multiple LOD layers in one file. Comma-separated '
                             'coarsen factors, largest first. E.g. --lod-scales 40,5 '
                             'produces _scale=40 (~730 cells) + _scale=5 (~11.7k cells). '
                             'Only applies to NetCDF input. Overrides --coarsen.')
    args = parser.parse_args()

    rename_map = parse_rename(args.rename)
    ext = os.path.splitext(args.input)[1].lower()

    if ext == '.nc':
        lats, lons, grids = read_netcdf(args.input)

        if args.lod_scales:
            # Multi-LOD mode: generate multiple coarsen levels and merge
            scales = [int(s.strip()) for s in args.lod_scales.split(',')]
            print(f'\nGenerating {len(scales)} LOD levels: {scales}')
            all_features = []
            finest_df = None
            for n in scales:
                print(f'\n── LOD scale={n} (coarsen {n}×{n}) ──')
                df_lod = netcdf_to_df(lats, lons, grids, coarsen=n, scale_value=n)
                features_lod = df_to_features(df_lod, rename_map)
                print(f'  → {len(features_lod):,} features at _scale={n}')
                all_features.extend(features_lod)
                if finest_df is None:
                    finest_df = df_lod
            print(f'\nTotal: {len(all_features):,} features across {len(scales)} LOD levels')
            write_geojson(all_features, args.output, summary_df=finest_df)
        else:
            scale_val = args.coarsen if args.coarsen > 1 else None
            df = netcdf_to_df(lats, lons, grids, coarsen=args.coarsen, scale_value=scale_val)
            df_to_geojson(df, args.output, rename_map)

    elif ext == '.csv':
        df, _ = read_csv(args.input)
        df_to_geojson(df, args.output, rename_map)
    else:
        print(f'ERROR: unsupported file extension "{ext}". Use .nc or .csv')
        sys.exit(1)
