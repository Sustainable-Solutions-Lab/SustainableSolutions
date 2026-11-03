# The NCS technoeconomics tool

`/tools/ncs-tea` (unlisted) is the technoeconomic assessment tool for
nature-based climate solutions. Its source lives in the private repository
`Sustainable-Solutions-Lab/ncs-tea` (Dropbox: `Papers/Active Prep/TEA of
NCS/TEA-tool`); `src/tools/ncs-tea/` here is a verbatim copy made by that
repository's `scripts/sync-to-site.mjs`. Edit there, sync, commit here.

## The grid pack

The tool evaluates everything in the browser from a small pack of global
0.5° rasters (about 9 MB: cropland, soil carbon, climate, country codes),
built by the tool repository's `pipeline/build_grid.py` from the Gridded LM
inputs.

| What | Where |
|---|---|
| The pack | `Dropbox/Sites/SustainableSolutions-data/ncs-tea/grid/` |
| What browsers load | `https://pub-4152429430274d988725593fd52db3ae.r2.dev/ncs-tea/grid/` (bucket `r2:ssl-data`) |
| Dev copy | `public/tools/ncs-tea/grid/` (gitignored); the page uses it when `import.meta.env.DEV` |

## After rebuilding the pack

```bash
GRID="$HOME/Library/CloudStorage/Dropbox/Sites/SustainableSolutions-data/ncs-tea/grid"
rclone copy "$GRID" r2:ssl-data/ncs-tea/grid/ --transfers 8
rclone ls r2:ssl-data/ncs-tea/grid/        # 11 files
cp -R "$GRID" public/tools/ncs-tea/grid     # local dev copy
```

The pack carries a `version` in `manifest.json`; bump it in the pipeline
when layers change and upload to a new folder if old pages must keep
working during a deploy.
