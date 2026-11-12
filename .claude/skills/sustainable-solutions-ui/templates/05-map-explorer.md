# Template — Geospatial map explorer

```text
MAP 1 · [region + measure]
[What the map answers]
[Region/search] [Layer] [Scenario] [Year] [Reset view]
[Map panel and keyboard-compatible controls]
[Legend: exact classes/units, no data, projection + coverage]
Selected region: [name/code] [metric] [uncertainty]
[Data table view] [Download GeoJSON/CSV] [Methodology]
Sources: [data and version]; Map tiles: [provider/licensed contributors]
```

## Geographic trust

Document CRS and display projection, boundary level, selection/aggregation, shape resolution, raster cell size, geocoder, filtering, no-data semantics and any political-boundary interpretation. Clearly label synthetic samples. Avoid false point precision from aggregated cells. Data should remain available when basemap tiles fail.

## Keyboard / nonvisual alternative

Search/place selector and table list must support all key selection/inspection tasks without dragging. `aria-label` for map region; keyboard reset and zoom; selected area should be reflected in an accessible result table; legend in HTML; avoid canvas-only critical text.

## Failure modes
No tiles; invalid bounding box; missing CRS; slow raster; data layer loads but attribution missing; mobile map consumed by scroll; region too small to select; mouse-free user; legend truncation; no WebGL; data suppressed. Each must degrade safely.
