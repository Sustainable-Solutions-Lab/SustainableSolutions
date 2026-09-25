# src/tools — interactive tools

Three kinds of thing live here. Each tool is mounted by a page at
`src/pages/tools/<slug>.astro` as a React island.

| Folder | Kind | What it is |
|--------|------|------------|
| `_engine/` | **engine** | Reusable, config-driven data-explorer engine (charts / store / ui / data loader). Not a tool by itself. |
| `_map/` | **engine** | Reusable, config-driven MapLibre/PMTiles map engine (components / lib / contracts / `MapTool.jsx` / `registry.js`). Not a tool by itself. Grew inside the original Firemap project and was extracted 2026-09; every map tool is a sibling leaf that registers a config here. |
| `firemap/` | **config** | Thin config that drives `_map` — Firefuels (fuel-treatment cost/benefit). |
| `just-air/` | **config** | Thin config that drives `_map` — Just Air (net-zero air quality / mortality). |
| `food-emissions/` | **config** | Thin config that drives `_map` — Food Emissions (global cropland-management GHGs). |
| `materials/` | **config** | Thin config that drives `_engine` — global material flows (Busch et al.). The broad "materials explorer." Future `calue/` (land-use emissions) is added the same way. |
| `magnets/` | **bespoke** | Standalone US rare-earth-magnet supply-chain explorer (its own components + `scenarios.json` from the rare-magnets-cem model). Does not use `_engine`. |
| `contrails/` | **bespoke** | Booking-time contrail predictor (SVG great-circle map + Duffel flight search via `api/contrails.py`). Does not use `_engine`. |
| `_shell/` | **shell** | `ToolShell.tsx` — the standard chrome every full-viewport tool wraps itself in. Not a tool by itself. |

Generated tool data (map tiles, materials lazy layers, etc.) is written to the
gitignored `build/` folder by `scripts/build-*`, never committed.

## The tool shell — standard chrome, not copied chrome

Full-viewport tools share two pieces; new tools use them rather than
copying layout from an existing tool:

- **`src/layouts/ToolFrame.astro`** (page frame): hides the footer,
  disables body scroll, sizes the frame to `100dvh` minus the 56px nav
  (dvh so iOS Safari's collapsing URL bar doesn't hide bottom-anchored
  UI), and gives the astro-island wrapper a height.

  ```astro
  <ToolFrame title="…" description="…" noindex background="var(--paper-2)">
    <MyTool client:only="react" />
  </ToolFrame>
  ```

- **`src/tools/_shell/ToolShell.tsx`** (in-tool chrome): desktop left
  rail beside the main area; below 768px, a compact header (eyebrow ·
  title · Show/Hide Controls) with the controls in a slide-down drawer
  over a tap-to-dismiss scrim. The drawer's top edge is measured from
  the header (never hardcode offsets); z-stack is header 30 > drawer 21
  > scrim 20 > in-map overlays 10.

  Key props: `rail` (controls; with `railChrome` the shell styles the
  300px column and title block, `railChrome={false}` for tools with
  their own sidebar component like firemap), `drawer` (optional reduced
  mobile control set; defaults to `rail`), `mainScroll` (results pages
  scroll; map pages clip), and controlled `drawerOpen`/
  `onDrawerOpenChange` when the tool closes the drawer itself (e.g.
  contrails closes it when an assessment starts).

  `busy` veils the main area with the animated lab mark while something
  slow runs — a laggy paint, a heavy dataset, a model run. Use it rather
  than inventing a spinner; a tool needing to place the overlay itself
  (the map tunes its z-order against other in-map overlays) imports
  `BusyOverlay` from `_shell/busy-overlay.jsx` directly. It is drawn in a
  single ink off `currentColor`/`var(--ink)`, so it takes no theme prop.

Both firemap (firefuels, just-air) and contrails render through the
shell.

Conventions the shell can't enforce, but every tool must follow:

- Anything hover-driven needs a tap equivalent (hover never fires on
  touch) — firemap selects by click; contrails toggles highlights on tap.
- Absolutely-positioned overlays near the bottom of the main area sit
  ~55px up on mobile to clear the in-map attribution and iOS Safari's
  URL bar (see firemap's mobile legend).
- Headings inside tools need explicit inline font sizes: the design
  system styles bare `h1` outside any cascade layer, which beats
  Tailwind's layered utilities. ToolShell's own headings already do this.
- Default state should put the visualization front and center — load a
  representative example rather than an empty pane, and keep the mobile
  drawer closed unless the tool is unusable without input.

---

# Building a new tool — start here

Written for lab members adding their first tool. Ask Steve anything this
doesn't cover; gaps here are bugs.

## The loop

`main` is protected: it deploys to the live lab site on every merge, so
nothing lands on it directly. Everything goes through a branch and a pull
request.

```bash
git checkout main && git pull
git checkout -b <yourname>/<tool-slug>      # e.g. jdeangelo/land-carbon
# ...work, commit as you go...
git push -u origin <yourname>/<tool-slug>
gh pr create --draft --title "New tool: land carbon" --body "Early WIP"
```

**Open the pull request as a draft on day one, before anything works.**
Vercel builds a preview deployment for every PR and comments the URL on
it — a live copy of the whole site with your tool in it, rebuilt on each
push. That URL is how Steve follows the work, so an early draft PR costs
you nothing and replaces a lot of screenshots and status updates.

Push small and often. A branch that lives for three weeks without a PR is
invisible and painful to merge; the same work as a draft PR is neither.

When it's ready, mark the PR "Ready for review". Steve is the code owner
on everything, so review is requested automatically and one approval is
needed to merge. If that ever becomes a bottleneck, say so — it is a
setting, not a principle.

**Work in a branch of this repo, not a fork.** Vercel does not give fork
PRs the environment variables, so a fork's preview builds without any
sheet data and looks broken for reasons that have nothing to do with your
work.

## Getting it running locally

```bash
npm install
cp .env.example .env     # ask Steve for the sheet URLs
npm run dev
```

The six `SHEET_*` values are required — the build fails loudly without
them rather than rendering empty pages. Everything else in `.env.example`
is optional and only matters if you are touching that specific thing.

## What a new tool actually is

Three files, and usually no changes to anything shared:

1. **`src/tools/<slug>/`** — your tool. Either a thin config that drives
   `_engine` or `_map` (read the table at the top of this file and copy
   the closest sibling), or a bespoke component tree if neither engine
   fits.
2. **`src/pages/tools/<slug>.astro`** — the page, wrapping your tool in
   `ToolFrame` and mounting it with `client:only="react"`.
3. **A row in the Tools sheet** — so it appears on `/tools`. Set
   `unlisted` TRUE while you're still building; the page stays live at
   its URL so you can share it, but it doesn't show up in the index.

Because a tool is an additive leaf, two people building different tools
almost never touch the same files. If you find yourself editing `_map/`,
`_engine/` or `_shell/`, pause — you're changing something every tool
depends on, and that's worth a sentence in the PR explaining why.

## Style: the short version

The full design system is in the root `CLAUDE.md`. The parts that come up
constantly:

- **Tokens, never hex.** `var(--ink)`, `var(--paper-2)`, `border-rule`.
  Hard-coded colours break dark mode silently, which is easy to miss
  because most of us develop in one theme.
- **Wrap in `ToolShell`** rather than rebuilding the rail-and-drawer
  layout. Use its `busy` prop for anything slow instead of adding a
  spinner — see the shell section above.
- **Anything over a second gets the lab mark.** `ToolShell`'s `busy` prop,
  or `BusyOverlay` from `_shell/busy-overlay.jsx` for tools that place it
  themselves (a bespoke tool outside the shell, or one that needs to tune
  z-order against its own overlays — the map and the magnet explorer both
  do this). Never add a second spinner: one animated mark across every
  tool is the point, and a lazy import or a solve that shows nothing reads
  as a broken tool rather than a busy one.
- **Spectral for data**, the lab's signature palette. Cardinal is a
  hairline accent only, never a fill.
- **Lucide icons**, `currentColor`, 1.5px stroke. No emoji.
- **Sentence case everywhere**, including headings. Real Unicode for
  units: `1.5 °C`, `t CO₂e/km²`. En-dash for ranges: `2000–2024`.
- **No hype.** Say what the tool shows. The voice notes in `CLAUDE.md`
  list the words to avoid.
- Everything hover-driven needs a tap equivalent, and it must work on a
  phone. Check the preview URL on your actual phone before review — it
  is the single most common thing to get caught in review.

## If your tool needs heavy data

Generated and source data **never goes in git**. The repo holds code; the
data lives in Dropbox and the build reads it from there.

- Ask Steve for a **shared Dropbox folder** for your project — this is
  how the existing tools work, and several postdocs already have one.
- Point your build script at it through an environment variable with a
  sensible default, the way `build-materials.js` does with
  `MATERIALS_PROCESSED_DIR`. Add the variable to `.env.example` with a
  comment. Never commit an absolute path to your own machine.
- Write generated artifacts to `build/`, which is gitignored, and a local
  dev copy into `public/tools/<slug>/` if the dev server needs it.
- Keep the generating script in `scripts/` and committed, even though its
  inputs aren't. Someone has to be able to regenerate your data in two
  years.

A good test: a colleague with the Dropbox folder and your `.env` should be
able to rebuild your data from a clean clone. If that needs a file only
you have, it isn't done yet.

## If your tool needs PMTiles on R2

Large tilesets are served from Cloudflare R2, not from the repo — the
food-emissions tiles alone are ~490 MB. Uploading needs credentials that
aren't distributed.

**Build the tiles locally, confirm the tool works against the local copy,
then ask Steve to do the R2 upload.** Include in the request: the built
file's path and size, the tool slug, and what `tilesUrl` should point to
afterwards. Until the upload happens the production site serves whatever
tiles are already there, so your feature can look like it silently did
nothing — mention the pending upload in your PR so nobody debugs a
non-problem.
