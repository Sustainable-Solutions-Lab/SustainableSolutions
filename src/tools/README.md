# src/tools — interactive tools

Three kinds of thing live here. Each tool is mounted by a page at
`src/pages/tools/<slug>.astro` as a React island.

| Folder | Kind | What it is |
|--------|------|------------|
| `_engine/` | **engine** | Reusable, config-driven data-explorer engine (charts / store / ui / data loader). Not a tool by itself. |
| `materials/` | **config** | Thin config that drives `_engine` — global material flows (Busch et al.). The broad "materials explorer." Future `calue/` (land-use emissions) is added the same way. |
| `magnets/` | **bespoke** | Standalone US rare-earth-magnet supply-chain explorer (its own components + `scenarios.json` from the rare-magnets-cem model). Does not use `_engine`. |
| `firemap/` | **bespoke** | Standalone MapLibre/PMTiles map (Firefuels, Just-Air). Does not use `_engine`. |

Generated tool data (map tiles, materials lazy layers, etc.) is written to the
gitignored `build/` folder by `scripts/build-*`, never committed.
