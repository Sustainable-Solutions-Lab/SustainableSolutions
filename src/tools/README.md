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
