# Contracts — READ ONLY

These files define the shared interfaces for the entire application.
They are written by the orchestrator in Phase 0 and must not be modified
by any agent after that point.

If you believe a contract needs to change, stop and raise it with the
orchestrator. Changing a contract mid-project requires re-briefing every
agent that depends on it.

## Files in this directory

- `project-config.js` — the schema every project config must satisfy
- `events.js`         — the AppState shape and action types shared across components

## Who reads these

Every agent reads these. No agent writes these.
