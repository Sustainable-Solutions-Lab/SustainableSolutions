# The magnet explorer's scenario grid

The explorer at `/tools/magnets` reads a precomputed grid of model runs:
`scenarios.json` and its companions, dozens of files and several hundred
megabytes. They are model output, replaced whole at every regrid, so they are
not kept in git. They live in Dropbox and are fetched when the site is built.

## Where things are

| What | Where |
|---|---|
| The grid | `Dropbox/Sites/SustainableSolutions-data/magnets-grid/` |
| Which grid the site wants | `src/tools/magnets/grid-manifest.json` (committed) |
| The copy the build reads | `src/tools/magnets/scenarios*.json` (git-ignored, kept out of Dropbox sync) |
| The script | `scripts/fetch-magnet-grid.js`, run before `dev` and `build` |

On a laptop the script copies from the Dropbox folder. On Vercel it downloads
the folder from a Dropbox shared link, checks every file against the manifest,
and fails the build if one is missing or the wrong size.

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
git add src/tools/magnets/grid-manifest.json
git commit -m "Magnets: new grid" && git push
```

Let Dropbox finish uploading before the push. If the build fails with "the
Dropbox folder is not grid ...", the upload had not finished; redeploy.

## Working with a grid that is somewhere else

`MAGNET_GRID_DIR=/path/to/folder npm run dev` reads a different folder. The
script warns when the grid it copied is not the one in the manifest, since the
manifest's is what gets deployed.
