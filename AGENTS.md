# Firemap — Multi-Agent Coordination Guide

This document is the master reference for orchestrating Claude Code subagents on this
project. Read this before spawning any agent.

---

## Project Summary

An interactive Next.js web application that maps the per-km² costs and benefits of
wildfire fuel treatment across California. Built to be extensible: adding a new project
requires only a new `projects/<name>/config.js` file.

**Stack**: Next.js 14 (Pages Router) · MapLibre GL JS · PMTiles · Theme UI · D3 · Cloudflare R2

---

## Agent Roster

| ID | Name              | Owns                          | Depends on         |
|----|-------------------|-------------------------------|--------------------|
| A  | Config Agent      | `projects/`                   | `contracts/`       |
| B  | Theme Agent       | `theme/`                      | nothing            |
| C  | Utilities Agent   | `lib/`                        | `contracts/`, `theme/` |
| D  | Map Agent         | `components/map/`             | `lib/`, `theme/`   |
| E  | Sidebar Agent     | `components/sidebar/`         | `lib/`, `theme/`   |
| F  | Detail Panel Agent| `components/detail-panel/`    | `lib/`, `theme/`   |
| G  | Pages Agent       | `pages/`                      | all components     |
| H  | Data Pipeline Agent| `scripts/`                   | nothing (Python)   |

---

## Execution Phases

### Phase 0 — Contracts (orchestrator writes, no agent needed)
Lock the interface files in `contracts/` before any agent starts.
- `contracts/project-config.js`
- `contracts/events.js`

These files define the shape every part of the app depends on. They must not change
after Phase 0 without coordinating all downstream agents.

### Phase 1 — Parallel (agents A, B, H simultaneously)
```
Agent A → projects/
Agent B → theme/
Agent H → scripts/
```
All three are independent. Spawn them in parallel.

### Phase 2 — Parallel (agents C, G simultaneously, after Phase 1)
```
Agent C → lib/
Agent G → pages/  (scaffold only: _app.js, _document.js, index.js shell)
```

### Phase 3 — Parallel (agents D, E, F simultaneously, after Phase 2)
```
Agent D → components/map/
Agent E → components/sidebar/
Agent F → components/detail-panel/
```

### Phase 4 — Integration (orchestrator)
Wire everything together in `pages/index.js`. Fix any interface mismatches.
Run `npm run dev` and validate visually.

---

## Spawning an Agent

When spawning an agent, always include in the prompt:
1. The agent's letter ID and name
2. "Read AGENTS.md and your folder's CLAUDE.md before writing any code."
3. The specific phase you are in
4. Which phases are already complete and what they produced

Example prompt for Agent D (Map Agent):
```
You are Agent D (Map Agent) working on the Firemap project.
Read AGENTS.md and components/map/CLAUDE.md before writing any code.
Phase 0, 1, and 2 are complete. Your job is Phase 3.
Do not read or modify any files outside components/map/.
```

---

## Shared State Model

App state lives in a single React context in `pages/index.js` (wired by the orchestrator
in Phase 4). Agents should NOT implement context themselves — they export pure components
that accept props. The shape of those props is defined in `contracts/events.js`.

```
AppState {
  projectId: string           // which project is active
  activeVariable: string      // e.g. 'net_benefit'
  activeDimensions: object    // e.g. { treatment: 'rx_burn' }
  selectedCell: CellData|null // null when no cell is clicked
  colorScheme: 'dark'|'light'
}
```

---

## Files No Agent Should Touch

- `contracts/*`        — written by orchestrator in Phase 0, read-only thereafter
- `AGENTS.md`          — this file
- `CLAUDE.md`          — root orchestrator instructions
- `package.json`       — orchestrator only
- `next.config.js`     — orchestrator only

---

## Adding a Future Project

1. Create `projects/<new-project>/config.js` implementing the `ProjectConfig` schema
   in `contracts/project-config.js`
2. Create `projects/<new-project>/methods.mdx` with methodology text
3. Register it in `projects/index.js`
4. No other files need to change.

### Known future projects (design with these in mind)

| Project | Geography | Resolution | Notes |
|---------|-----------|------------|-------|
| US air pollution | Contiguous US | 8 km | Different region bounds; otherwise same architecture |
| Global improved grazing | Global | ~50–100 km | Will need world-extent map bounds; may need different basemap zoom range |

The `ProjectConfig.region` object already handles arbitrary bounds and zoom.
The PMTiles pipeline works identically at any scale.
Agents should avoid hardcoding California-specific assumptions (e.g., don't
hardcode `bounds: [-124.5, 32.5, ...]` anywhere except in the fuel-treatment config).

---

## Deployment

- **App hosting**: Vercel (free tier, auto-deploy from GitHub)
- **Data hosting**: Cloudflare R2 (free egress, upload .pmtiles files there)
- **Target domain**: Stanford subdomain, e.g. `firemap.sustainablesolutions.stanford.edu`
  - For now: use the Vercel default URL during development
  - When ready: add a CNAME in Stanford DNS → `cname.vercel-dns.com`
  - `next.config.js` iframe headers already allow `*.stanford.edu` framing

---

## Notes on Data Format

Source data is CSV with lat/lon columns plus per-km² variables. The data pipeline
(Agent H / `scripts/`) converts this to:
- **PMTiles** vector tile archive for the map (via tippecanoe)
- Optional: **GeoJSON** for development/testing with small subsets

PMTiles files are hosted on Cloudflare R2 and referenced via URL in each project config.
