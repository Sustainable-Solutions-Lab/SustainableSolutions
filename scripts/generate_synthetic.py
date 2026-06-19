"""
scripts/generate_synthetic.py

Generate synthetic fuel treatment cost-benefit data for California.
Used for developing and testing the web tool before real model results are available.

Spatial patterns are simulated using Gaussian kernels around real California
geographic features (fire risk zones, urban centers, mountain ranges).

Outputs:
  - data/synthetic_ca.csv   (~40k rows, full grid at ~5km resolution)
  - data/synthetic_dev.csv  (~2k rows, random sample for fast local dev)

Usage:
    python generate_synthetic.py

Column names match the variable ids in projects/fuel-treatment/config.js.
Update PROPERTY_COLUMNS in scripts/build_tiles.py to include all columns below.
"""

import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)
rng = np.random.default_rng(42)

# ─── Grid ────────────────────────────────────────────────────────────────────
# 0.05° ≈ 5 km. This gives ~40k points within California's bounding box.
# Change to 0.01° for 1km resolution (produces ~1M points — use build_tiles.py).
GRID_RES = 0.05
LAT_MIN, LAT_MAX = 32.5, 42.1
LON_MIN, LON_MAX = -124.5, -114.1

# ─── Spatial kernels ─────────────────────────────────────────────────────────
# Format: (center_lat, center_lon, amplitude, σ_lat, σ_lon)

FIRE_KERNELS = [
    # Sierra Nevada foothills — highest fire risk in CA
    (38.5, -120.5, 1.0, 2.0, 1.5),
    # Southern CA mountains (Angeles/San Bernardino)
    (34.2, -117.5, 0.9, 1.2, 1.0),
    # Northern Coast Ranges / Mendocino
    (39.5, -122.8, 0.65, 1.2, 0.8),
    # Central Coast Ranges / Bay Area hills
    (37.3, -121.9, 0.55, 0.9, 0.7),
    # Central Sierra (Kings Canyon area)
    (36.8, -118.8, 0.75, 1.0, 0.8),
    # Klamath / Trinity mountains
    (41.2, -123.2, 0.6, 1.0, 0.9),
    # Tehachapi / Transverse ranges
    (34.8, -118.8, 0.6, 0.8, 0.8),
]

# Population / wildland-urban interface centers
WUI_KERNELS = [
    # Bay Area
    (37.7, -122.1, 1.0, 1.0, 1.2),
    # Los Angeles Metro
    (34.1, -118.2, 1.0, 1.2, 1.5),
    # Sacramento
    (38.5, -121.5, 0.8, 0.8, 1.0),
    # San Diego
    (33.0, -117.1, 0.7, 0.7, 0.9),
    # Fresno
    (36.7, -119.8, 0.5, 0.6, 0.8),
    # Santa Barbara
    (34.4, -119.7, 0.5, 0.4, 0.5),
    # Santa Rosa / Sonoma
    (38.4, -122.7, 0.55, 0.5, 0.6),
    # Redding
    (40.6, -122.4, 0.45, 0.5, 0.5),
]

# ─── Helper functions ─────────────────────────────────────────────────────────

def apply_kernels(lats: np.ndarray, lons: np.ndarray, kernels: list) -> np.ndarray:
    result = np.zeros(len(lats))
    for c_lat, c_lon, amp, s_lat, s_lon in kernels:
        result += amp * np.exp(
            -((lats - c_lat) ** 2 / s_lat ** 2 + (lons - c_lon) ** 2 / s_lon ** 2)
        )
    return result


def normalize(x: np.ndarray, lo: float = 0.0, hi: float = 1.0) -> np.ndarray:
    xmin, xmax = x.min(), x.max()
    if xmax == xmin:
        return np.full_like(x, (lo + hi) / 2)
    return lo + (x - xmin) / (xmax - xmin) * (hi - lo)


# ─── Main generator ───────────────────────────────────────────────────────────

def generate() -> pd.DataFrame:
    # Grid
    lats_1d = np.arange(LAT_MIN, LAT_MAX, GRID_RES)
    lons_1d = np.arange(LON_MIN, LON_MAX, GRID_RES)
    lon_grid, lat_grid = np.meshgrid(lons_1d, lats_1d)
    lats = lat_grid.ravel()
    lons = lon_grid.ravel()
    n = len(lats)

    print(f"Grid: {len(lats_1d)} × {len(lons_1d)} = {n:,} points")

    # ── Fire risk kernel ──────────────────────────────────────────────────────
    fire_raw = apply_kernels(lats, lons, FIRE_KERNELS)
    wui_raw = apply_kernels(lats, lons, WUI_KERNELS)

    # ── Spatial inputs ────────────────────────────────────────────────────────
    # Elevation: rises toward east (Sierra Nevada), with noise
    elev_base = (
        200 - 280 * (lons - LON_MIN) / (LON_MAX - LON_MIN)   # west coast → east interior
        + 600 * fire_raw / fire_raw.max()                      # correlated with mountains
    )
    elevation = np.clip(elev_base + rng.normal(0, 150, n), 0, 3000).round(0)

    slope = np.clip(elevation / 60 + rng.normal(0, 4, n), 0, 45).round(1)

    veg_density = normalize(
        fire_raw * 0.6 + (elevation / 3000) * 0.3 + rng.normal(0, 0.04, n),
        lo=0.05, hi=0.95,
    ).round(3)

    fire_prob = normalize(
        fire_raw * 0.7 + veg_density * 0.2 + rng.normal(0, 0.02, n),
        lo=0.02, hi=0.68,
    ).round(3)

    wui_proximity = normalize(wui_raw)
    wui_dist = ((1 - wui_proximity) * 100 + rng.normal(0, 5, n)).clip(0, 200).round(1)

    # ── Treatment costs ($/km²) ───────────────────────────────────────────────
    # Rx burn: cheapest, mainly limited by veg density
    cost_rx_burn = (
        35000 + 70000 * veg_density + 15000 * (slope / 45)
        + rng.normal(0, 8000, n)
    ).clip(15000, 190000).round(0)

    # Mechanical: steep-terrain penalty is large
    cost_mechanical = (
        70000 + 130000 * veg_density + 80000 * (slope / 45)
        + rng.normal(0, 18000, n)
    ).clip(40000, 370000).round(0)

    # Hand: most expensive per area, less slope-sensitive
    cost_hand = (
        110000 + 110000 * veg_density + 35000 * (slope / 45)
        + rng.normal(0, 22000, n)
    ).clip(70000, 430000).round(0)

    # Cheapest treatment at each cell
    cost_stack = np.stack([cost_rx_burn, cost_mechanical, cost_hand], axis=1)
    min_idx = cost_stack.argmin(axis=1)
    min_cost = cost_stack.min(axis=1)
    idx_to_name = {0: 'rx_burn', 1: 'mechanical', 2: 'hand'}
    cheapest = np.array([idx_to_name[i] for i in min_idx])

    # ── Benefits ($/km²) ──────────────────────────────────────────────────────
    # Base benefit: fire probability × proximity to WUI × property density proxy
    benefit_scale = fire_prob * (0.4 * wui_proximity + 0.3) * 1_200_000

    # Current climate
    prop_factor = fire_prob * wui_proximity * 0.65
    hlth_factor = fire_prob * (0.2 + 0.5 * wui_proximity) * 0.35

    prop_c = (benefit_scale * prop_factor + rng.normal(0, 12000, n)).clip(0).round(0)
    hlth_c = (benefit_scale * hlth_factor + rng.normal(0, 6000, n)).clip(0).round(0)
    tot_c = prop_c + hlth_c

    # SSP2-4.5: moderate warming, fire risk increases ~20–40%
    amp_ssp245 = rng.uniform(1.15, 1.40, n)
    prop_245 = (prop_c * amp_ssp245).round(0)
    hlth_245 = (hlth_c * amp_ssp245).round(0)
    tot_245 = prop_245 + hlth_245

    # SSP5-8.5: high warming, fire risk increases further ~50–110% above current
    amp_ssp585 = amp_ssp245 * rng.uniform(1.20, 1.55, n)
    prop_585 = (prop_c * amp_ssp585).round(0)
    hlth_585 = (hlth_c * amp_ssp585).round(0)
    tot_585 = prop_585 + hlth_585

    # ── Net benefits and BCR ──────────────────────────────────────────────────
    def net(benefit, cost):
        return (benefit - cost).round(0)

    def bcr(benefit, cost):
        return np.where(cost > 0, (benefit / cost).round(2), 0.0)

    # ── Assemble DataFrame ────────────────────────────────────────────────────
    df = pd.DataFrame({
        # Location
        'lat': lats,
        'lon': lons,

        # Spatial inputs
        'elevation':    elevation,
        'slope':        slope,
        'veg_density':  veg_density,
        'fire_prob':    fire_prob,
        'wui_dist':     wui_dist,

        # Costs
        'cost_rx_burn':    cost_rx_burn,
        'cost_mechanical': cost_mechanical,
        'cost_hand':       cost_hand,
        'min_cost':        min_cost.round(0),
        'cheapest':        cheapest,

        # Benefits — current
        'prop_benefit_current':   prop_c,
        'health_benefit_current': hlth_c,
        'total_benefit_current':  tot_c,

        # Benefits — 2050
        'prop_benefit_ssp245':   prop_245,
        'health_benefit_ssp245': hlth_245,
        'total_benefit_ssp245':  tot_245,

        # Benefits — 2100
        'prop_benefit_ssp585':   prop_585,
        'health_benefit_ssp585': hlth_585,
        'total_benefit_ssp585':  tot_585,

        # Net benefits
        'net_rx_current':   net(tot_c,   cost_rx_burn),
        'net_mech_current': net(tot_c,   cost_mechanical),
        'net_hand_current': net(tot_c,   cost_hand),
        'net_min_current':  net(tot_c,   min_cost),

        'net_rx_ssp245':      net(tot_245,  cost_rx_burn),
        'net_mech_ssp245':    net(tot_245,  cost_mechanical),
        'net_hand_ssp245':    net(tot_245,  cost_hand),
        'net_min_ssp245':     net(tot_245,  min_cost),

        'net_rx_ssp585':      net(tot_585, cost_rx_burn),
        'net_mech_ssp585':    net(tot_585, cost_mechanical),
        'net_hand_ssp585':    net(tot_585, cost_hand),
        'net_min_ssp585':     net(tot_585, min_cost),

        # BCR (current climate only for now)
        'bcr_rx_current':   bcr(tot_c, cost_rx_burn),
        'bcr_mech_current': bcr(tot_c, cost_mechanical),
        'bcr_hand_current': bcr(tot_c, cost_hand),
    })

    return df


def print_summary(df: pd.DataFrame) -> None:
    print("\n── Summary statistics ──────────────────────────────────────────")
    numeric = df.select_dtypes(include='number')
    for col in numeric.columns:
        s = numeric[col]
        print(f"  {col:<30}  min={s.min():>10.0f}  mean={s.mean():>10.0f}  max={s.max():>10.0f}")
    print()
    if 'cheapest' in df.columns:
        print("  Cheapest treatment distribution:")
        print(df['cheapest'].value_counts().to_string(header=False))
    print()


if __name__ == '__main__':
    out_dir = Path(__file__).parent.parent / 'data'
    out_dir.mkdir(exist_ok=True)

    print("Generating synthetic California fuel treatment data...")
    df = generate()
    print_summary(df)

    # Full grid
    full_path = out_dir / 'synthetic_ca.csv'
    df.to_csv(full_path, index=False)
    print(f"Full dataset ({len(df):,} rows) → {full_path}")

    # Small development sample
    dev_path = out_dir / 'synthetic_dev.csv'
    df.sample(2000, random_state=42).reset_index(drop=True).to_csv(dev_path, index=False)
    print(f"Dev sample   (2,000 rows) → {dev_path}")

    print("\nNext steps:")
    print("  1. Run qa/inspect_data.py to visualize the output")
    print("  2. Run scripts/build_tiles.py --input data/synthetic_ca.csv to build tiles")
