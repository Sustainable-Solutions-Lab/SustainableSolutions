# Expected CSV Column Names

This file defines the exact column names the web tool expects.
When the real model results are ready, conform the output CSV to these names
(or update the `id` fields in `projects/fuel-treatment/config.js` to match
whatever names the model uses — either approach works).

---

## Location

| Column | Type   | Description |
|--------|--------|-------------|
| `lat`  | float  | Cell center latitude (decimal degrees, WGS84) |
| `lon`  | float  | Cell center longitude (decimal degrees, WGS84) |

---

## Spatial Inputs

| Column         | Type  | Unit  | Description |
|----------------|-------|-------|-------------|
| `elevation`    | float | m     | Terrain elevation |
| `slope`        | float | °     | Terrain slope in degrees |
| `veg_density`  | float | 0–1   | Vegetation density / fuel load proxy (e.g. NDVI) |
| `fire_prob`    | float | 0–1   | Annual fire probability |
| `wui_dist`     | float | km    | Distance to nearest wildland-urban interface |

---

## Treatment Costs

All costs in **$/km²** (annualized).

| Column            | Description |
|-------------------|-------------|
| `cost_rx_burn`    | Prescribed burn |
| `cost_mechanical` | Mechanical thinning |
| `cost_hand`       | Hand crew treatment |
| `min_cost`        | Minimum cost across all three treatment types |
| `cheapest`        | String: which treatment is cheapest — `'rx_burn'`, `'mechanical'`, or `'hand'` |

---

## Benefits — Current Climate

All values in **$/km²**.

| Column                   | Description |
|--------------------------|-------------|
| `prop_benefit_current`   | Property damage avoided |
| `health_benefit_current` | Smoke-related health benefit (mortality + morbidity) |
| `total_benefit_current`  | `prop_benefit_current + health_benefit_current` |

---

## Benefits — SSP2-4.5

| Column                  | Description |
|-------------------------|-------------|
| `prop_benefit_ssp245`   | Property benefit under SSP2-4.5 |
| `health_benefit_ssp245` | Health benefit under SSP2-4.5 |
| `total_benefit_ssp245`  | Total benefit under SSP2-4.5 |

---

## Benefits — SSP5-8.5

| Column                  | Description |
|-------------------------|-------------|
| `prop_benefit_ssp585`   | Property benefit under SSP5-8.5 |
| `health_benefit_ssp585` | Health benefit under SSP5-8.5 |
| `total_benefit_ssp585`  | Total benefit under SSP5-8.5 |

---

## Net Benefits

`net_{treatment}_{scenario}` = `total_benefit_{scenario}` − `cost_{treatment}`

All values in **$/km²** (can be negative).

| Column              | Treatment      | Climate    |
|---------------------|----------------|------------|
| `net_rx_current`    | Prescribed burn | Current   |
| `net_rx_ssp245`     | Prescribed burn | SSP2-4.5  |
| `net_rx_ssp585`     | Prescribed burn | SSP5-8.5  |
| `net_mech_current`  | Mechanical      | Current   |
| `net_mech_ssp245`   | Mechanical      | SSP2-4.5  |
| `net_mech_ssp585`   | Mechanical      | SSP5-8.5  |
| `net_hand_current`  | Hand            | Current   |
| `net_hand_ssp245`   | Hand            | SSP2-4.5  |
| `net_hand_ssp585`   | Hand            | SSP5-8.5  |
| `net_min_current`   | Lowest cost     | Current   |
| `net_min_ssp245`    | Lowest cost     | SSP2-4.5  |
| `net_min_ssp585`    | Lowest cost     | SSP5-8.5  |

---

## Benefit-Cost Ratio

`bcr_{treatment}_current` = `total_benefit_current` / `cost_{treatment}`

(Dimensionless. Values > 1 = cost-effective.)

| Column               | Treatment       |
|----------------------|-----------------|
| `bcr_rx_current`     | Prescribed burn |
| `bcr_mech_current`   | Mechanical      |
| `bcr_hand_current`   | Hand            |

---

## Notes

- **Total columns**: ~40
- **Null handling**: use `NaN` or leave blank for cells with no data
- **Coordinate system**: WGS84 (EPSG:4326)
- **Spatial resolution**: 1 km² grid cells
- The synthetic data (`data/synthetic_ca.csv`) uses all of these names exactly
  and can serve as a template for the real data format
