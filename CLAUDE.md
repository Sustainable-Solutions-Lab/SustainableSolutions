# Firemap — Orchestrator Instructions

This is a multi-agent project. Read `AGENTS.md` for the full coordination plan before
doing anything.

## What this project is

An interactive map showing per-km² costs and benefits of wildfire fuel treatment in
California. Similar look and feel to https://carbonplan.org/research/forest-risks.
Built to be extensible: new projects require only a new config file.

## Your role as orchestrator

- Spawn agents in the correct phase order defined in `AGENTS.md`
- Write/maintain `contracts/`, `package.json`, `next.config.js`
- In Phase 4, wire all components together in `pages/index.js`
- Run `npm run dev` to test; fix interface mismatches

## Do not

- Directly implement component logic — delegate to the appropriate agent
- Modify files owned by an agent once that agent has finished its phase
- Change `contracts/` files after Phase 0 without re-briefing all agents

## Stack

- Next.js 14, Pages Router (not App Router)
- MapLibre GL JS (no token required — open source Mapbox fork)
- PMTiles for vector tiles
- Theme UI 0.15 for styling
- D3 for color scales and charts
- Cloudflare R2 for data hosting (or local files in development)
- Vercel for deployment

## Running locally

```bash
npm install
npm run dev   # http://localhost:3000
```

## Environment variables

```
NEXT_PUBLIC_MAPTILER_KEY=  # optional: for MapTiler basemap tiles
```
No Mapbox token needed.
