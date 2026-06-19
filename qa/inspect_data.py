"""
qa/inspect_data.py

Load the synthetic (or real) fuel treatment CSV and generate QA visualizations.
Outputs PNG files to qa/output/ and a summary_stats.csv.

Usage:
    python qa/inspect_data.py
    python qa/inspect_data.py --input data/synthetic_ca.csv --output qa/output/

Requirements: pandas, numpy, matplotlib
    pip install pandas numpy matplotlib
"""

import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')  # non-interactive backend — works in any environment
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.cm import ScalarMappable
from matplotlib.colors import Normalize
import numpy as np
import pandas as pd

# ─── Configuration ────────────────────────────────────────────────────────────

# Variables to map geographically (lat/lon scatter colored by value)
MAP_VARIABLES = [
    ('fire_prob',           'Fire Probability',      'YlOrRd',  None),
    ('veg_density',         'Vegetation Density',    'Greens',  None),
    ('elevation',           'Elevation (m)',         'terrain', None),
    ('min_cost',            'Lowest Treatment Cost', 'Oranges', None),
    ('total_benefit_current','Total Benefit (Current)','Greens', None),
    ('net_rx_current',      'Net Benefit — Rx Burn (Current)', 'RdBu_r', 0),
    ('net_min_current',     'Net Benefit — Lowest Cost (Current)',  'RdBu_r', 0),
    ('net_min_ssp245',      'Net Benefit — Lowest Cost (SSP2-4.5)', 'RdBu_r', 0),
    ('net_min_ssp585',      'Net Benefit — Lowest Cost (SSP5-8.5)', 'RdBu_r', 0),
    ('net_min_ssp245',        'Net Benefit — Lowest Cost (2050)',    'RdBu_r', 0),
    ('net_min_ssp585',        'Net Benefit — Lowest Cost (2100)',    'RdBu_r', 0),
]

# Variables to histogram
HIST_GROUPS = {
    'costs':        ['cost_rx_burn', 'cost_mechanical', 'cost_hand', 'min_cost'],
    'benefits':     ['total_benefit_current', 'total_benefit_ssp245', 'total_benefit_ssp585'],
    'net_benefits_current': ['net_rx_current', 'net_mech_current', 'net_hand_current', 'net_min_current'],
    'net_benefits_ssp':     ['net_min_current', 'net_min_ssp245', 'net_min_ssp585'],
    'inputs':       ['fire_prob', 'veg_density', 'slope', 'wui_dist'],
}

LABEL_MAP = {
    'cost_rx_burn': 'Rx Burn', 'cost_mechanical': 'Mechanical', 'cost_hand': 'Hand',
    'min_cost': 'Lowest', 'total_benefit_current': 'Current', 'total_benefit_ssp245': '2050',
    'total_benefit_ssp585': '2100', 'net_rx_current': 'Rx Burn', 'net_mech_current': 'Mechanical',
    'net_hand_current': 'Hand', 'net_min_current': 'Lowest (Current)',
    'net_min_ssp245': 'Lowest (SSP2-4.5)', 'net_min_ssp585': 'Lowest (SSP5-8.5)',
    'fire_prob': 'Fire Prob.', 'veg_density': 'Veg. Density', 'slope': 'Slope', 'wui_dist': 'WUI Dist.',
}


# ─── Plot helpers ─────────────────────────────────────────────────────────────

def map_plot(ax, df, col, title, cmap='viridis', vcenter=None):
    """Geographic scatter colored by a numeric column."""
    if col not in df.columns:
        ax.set_title(f'{title}\n(column not found)', fontsize=9)
        ax.axis('off')
        return

    vals = df[col].dropna()
    vmin, vmax = vals.quantile(0.01), vals.quantile(0.99)

    if vcenter is not None:
        norm = mcolors.TwoSlopeNorm(vmin=vmin, vcenter=vcenter, vmax=vmax)
    else:
        norm = Normalize(vmin=vmin, vmax=vmax)

    sc = ax.scatter(
        df['lon'], df['lat'],
        c=df[col], cmap=cmap, norm=norm,
        s=2, linewidths=0, alpha=0.7,
    )
    ax.set_title(title, fontsize=9, pad=4)
    ax.set_xlabel('Longitude', fontsize=7)
    ax.set_ylabel('Latitude', fontsize=7)
    ax.tick_params(labelsize=6)
    ax.set_facecolor('#2a2a2a')
    plt.colorbar(sc, ax=ax, shrink=0.8, pad=0.02)


def categorical_map_plot(ax, df, col, categories, title):
    """Geographic scatter for a categorical column."""
    if col not in df.columns:
        ax.set_title(f'{title}\n(column not found)', fontsize=9)
        ax.axis('off')
        return

    color_map = {c['id']: c['color'] for c in categories}
    colors = df[col].map(color_map).fillna('#888888')

    ax.scatter(df['lon'], df['lat'], c=colors, s=2, linewidths=0, alpha=0.8)
    ax.set_title(title, fontsize=9, pad=4)
    ax.set_facecolor('#2a2a2a')

    # Legend
    for cat in categories:
        ax.scatter([], [], c=cat['color'], label=cat['label'], s=20)
    ax.legend(loc='lower left', fontsize=7, framealpha=0.5)


def hist_group(ax, df, cols, title, bins=60):
    """Overlaid histograms for a group of related columns."""
    colors = ['#E55C2F', '#5B8A4E', '#4A90D9', '#9B59B6', '#F1C40F']
    for i, col in enumerate(cols):
        if col not in df.columns:
            continue
        vals = df[col].dropna()
        label = LABEL_MAP.get(col, col)
        ax.hist(vals, bins=bins, alpha=0.6, color=colors[i % len(colors)], label=label, density=True)
    ax.set_title(title, fontsize=9)
    ax.legend(fontsize=7)
    ax.tick_params(labelsize=7)
    ax.set_ylabel('Density', fontsize=7)


# ─── Main ──────────────────────────────────────────────────────────────────────

def run(input_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {input_path}...")
    df = pd.read_csv(input_path)
    print(f"  {len(df):,} rows, {len(df.columns)} columns")
    print(f"  Columns: {list(df.columns)}\n")

    # ── Summary stats CSV ──────────────────────────────────────────────────────
    numeric = df.select_dtypes(include='number')
    stats = numeric.describe(percentiles=[0.1, 0.25, 0.5, 0.75, 0.9]).T
    stats.to_csv(output_dir / 'summary_stats.csv')
    print("Summary stats:")
    print(stats[['mean', '50%', 'min', 'max']].to_string())
    print()

    if 'cheapest' in df.columns:
        print("Cheapest treatment distribution:")
        print(df['cheapest'].value_counts().to_string())
        print()

    # ── Geographic maps ────────────────────────────────────────────────────────
    print("Generating geographic maps...")
    n_maps = len(MAP_VARIABLES)
    n_cols = 3
    n_rows = (n_maps + n_cols - 1) // n_cols

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(15, 5 * n_rows))
    fig.patch.set_facecolor('#1a1a1a')
    axes_flat = axes.ravel() if n_rows > 1 else axes

    for i, (col, title, cmap, vcenter) in enumerate(MAP_VARIABLES):
        map_plot(axes_flat[i], df, col, title, cmap=cmap, vcenter=vcenter)

    # Hide unused axes
    for j in range(i + 1, len(axes_flat)):
        axes_flat[j].axis('off')

    plt.tight_layout(pad=1.0)
    path = output_dir / 'maps_continuous.png'
    plt.savefig(path, dpi=120, bbox_inches='tight', facecolor='#1a1a1a')
    plt.close()
    print(f"  → {path}")

    # ── Categorical map (cheapest treatment) ───────────────────────────────────
    if 'cheapest' in df.columns:
        fig, ax = plt.subplots(1, 1, figsize=(8, 7))
        fig.patch.set_facecolor('#1a1a1a')
        categorical_map_plot(ax, df, 'cheapest',
            categories=[
                {'id': 'rx_burn',    'label': 'Prescribed Burn', 'color': '#E55C2F'},
                {'id': 'mechanical', 'label': 'Mechanical',       'color': '#5B8A4E'},
                {'id': 'hand',       'label': 'Hand',             'color': '#4A90D9'},
            ],
            title='Cheapest Treatment Type',
        )
        plt.tight_layout()
        path = output_dir / 'map_cheapest.png'
        plt.savefig(path, dpi=120, bbox_inches='tight', facecolor='#1a1a1a')
        plt.close()
        print(f"  → {path}")

    # ── Histograms ─────────────────────────────────────────────────────────────
    print("Generating histograms...")
    for group_name, cols in HIST_GROUPS.items():
        valid = [c for c in cols if c in df.columns]
        if not valid:
            continue

        fig, ax = plt.subplots(figsize=(8, 4))
        hist_group(ax, df, valid, title=group_name.replace('_', ' ').title())
        plt.tight_layout()
        path = output_dir / f'hist_{group_name}.png'
        plt.savefig(path, dpi=120, bbox_inches='tight')
        plt.close()
        print(f"  → {path}")

    # ── Correlation matrix ─────────────────────────────────────────────────────
    print("Generating correlation matrix...")
    corr_cols = [
        'fire_prob', 'veg_density', 'slope', 'wui_dist',
        'cost_rx_burn', 'min_cost',
        'total_benefit_current', 'total_benefit_ssp245',
        'net_rx_current', 'net_min_current',
    ]
    corr_cols = [c for c in corr_cols if c in df.columns]
    corr = df[corr_cols].corr()

    fig, ax = plt.subplots(figsize=(10, 9))
    im = ax.imshow(corr, cmap='RdBu_r', vmin=-1, vmax=1)
    ax.set_xticks(range(len(corr_cols)))
    ax.set_yticks(range(len(corr_cols)))
    labels = [c.replace('_', '\n') for c in corr_cols]
    ax.set_xticklabels(labels, fontsize=7, rotation=45, ha='right')
    ax.set_yticklabels(labels, fontsize=7)
    plt.colorbar(im, ax=ax, shrink=0.8)
    ax.set_title('Correlation Matrix', fontsize=11)
    plt.tight_layout()
    path = output_dir / 'correlation.png'
    plt.savefig(path, dpi=120, bbox_inches='tight')
    plt.close()
    print(f"  → {path}")

    # ── BCR percentile distribution ─────────────────────────────────────────
    if 'bcr_rx_current' in df.columns:
        print("Generating BCR percentile plot...")
        bcr = df['bcr_rx_current'].sort_values(ascending=False).reset_index(drop=True)
        pct = (np.arange(len(bcr)) / len(bcr)) * 100

        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(pct, bcr.values, color='#E55C2F', lw=1.5)
        ax.axhline(1.0, color='white', lw=0.8, ls='--', label='BCR = 1 (breakeven)')
        ax.axvline(11, color='#5B8A4E', lw=0.8, ls='--', label='Top 11%')
        ax.set_xlabel('Percentile (best → worst)', fontsize=9)
        ax.set_ylabel('Benefit-Cost Ratio (Rx Burn, Current)', fontsize=9)
        ax.set_title('BCR Distribution by Percentile', fontsize=11)
        ax.legend(fontsize=8)
        ax.set_xlim(0, 100)
        plt.tight_layout()
        path = output_dir / 'bcr_percentile.png'
        plt.savefig(path, dpi=120, bbox_inches='tight')
        plt.close()
        print(f"  → {path}")

    print(f"\nAll QA outputs saved to {output_dir}")
    print("Open qa/output/ in any image viewer to review.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate QA visualizations for fuel treatment data')
    parser.add_argument('--input',  default='data/synthetic_ca.csv', help='Input CSV path')
    parser.add_argument('--output', default='qa/output/',            help='Output directory')
    args = parser.parse_args()

    run(Path(args.input), Path(args.output))
