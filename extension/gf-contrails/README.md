# Contrail check — Google Flights extension (unpacked)

Auto-badges every Google Flights result with predicted contrail warming
(kg CO2e per passenger), using the lab's schedule-only model via the
`?batch=1` API.

## Install (Arc or Chrome)

1. Go to `arc://extensions` (Arc) or `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. **Load unpacked** → select this folder.
4. Open any Google Flights search — badges appear automatically and
   refresh when the list re-renders.

## Source of truth

`gf-bookmarklet.js` here is a copy of
`src/tools/contrails/gf-bookmarklet.js` (the bookmarklet on the booking
tool page). After editing the original, re-copy it here. `auto.js` just
sets `window.__sslContrailAuto` so the shared script runs in silent
auto-refresh mode.
