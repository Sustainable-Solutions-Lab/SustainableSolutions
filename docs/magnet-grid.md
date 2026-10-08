# The magnet explorer's scenario grid

The explorer at `/tools/magnets` reads a precomputed grid of model runs:
`scenarios.json` and its companions, dozens of files and several hundred
megabytes. They are model output, replaced whole at every regrid, so they are
not kept in git. They live in Dropbox, and a copy of each version sits in
Cloudflare R2, where browsers load the slices from.

## Where things are

| What | Where |
|---|---|
| The grid | `Dropbox/Sites/SustainableSolutions-data/magnets-grid/` |
| Which grid the site wants | `src/tools/magnets/grid-manifest.json` (committed) |
| The copy the build reads | `src/tools/magnets/scenarios*.json` (git-ignored, kept out of Dropbox sync) |
| The script | `scripts/fetch-magnet-grid.js`, run before `dev` and `build` |
| What browsers load | `https://pub-4152429430274d988725593fd52db3ae.r2.dev/magnets-grid/<version>/` (bucket `r2:ssl-data`; `GRID_BASE` in `src/tools/magnets/interp.ts`) |

On a laptop the script copies from the Dropbox folder. On Vercel it fetches
the core file from R2 (falling back to the Dropbox shared link), checks it
against the manifest, and fails the build if it is missing or the wrong size.
The page itself loads every slice from R2 at `<version>/`, so a version that is
in the manifest but not in R2 deploys cleanly and then shows no Sankey.

## Vercel setup, once

1. In Dropbox, share the `magnets-grid` folder and copy its **link for
   viewing**, set to "anyone with link". Do not use the link for editing:
   whoever holds it can change the files. (The build would refuse them, since
   every file is checked against the SHA-256 in the manifest, but the site
   could then not be deployed until the folder was restored.)
2. Set it as `MAGNET_GRID_URL` in the Vercel project, for production and
   preview: `vercel env add MAGNET_GRID_URL`.

The link stays the same when the folder's contents change.

## After a regrid

```bash
GRID="$HOME/Library/CloudStorage/Dropbox/Sites/SustainableSolutions-data/magnets-grid"
rm -f "$GRID"/scenarios*.json
cp <model repo>/outputs/explorer/scenarios*.json "$GRID/"
node scripts/fetch-magnet-grid.js --write-manifest
V=$(node -p "require('./src/tools/magnets/grid-manifest.json').version")
rclone copy "$GRID" "r2:ssl-data/magnets-grid/$V/" --include "scenarios*.json" --transfers 8
rclone ls "r2:ssl-data/magnets-grid/$V/" | wc -l   # should equal the file count
git add src/tools/magnets/grid-manifest.json
git commit -m "Magnets: new grid" && git push
```

Upload to R2 before the push: skip it and the explorer loads but never draws the
Sankey (every slice request returns 404). Keep older version folders in R2 until
the new deploy is live. Let Dropbox finish uploading before the push too. If the build fails with "the
Dropbox folder is not grid ...", the upload had not finished; redeploy.

## Working with a grid that is somewhere else

`MAGNET_GRID_DIR=/path/to/folder npm run dev` reads a different folder. The
script warns when the grid it copied is not the one in the manifest, since the
manifest's is what gets deployed.
