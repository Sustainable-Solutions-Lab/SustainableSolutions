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

## Zips (two of them)

- `extension/gf-contrails.zip` — Chrome Web Store upload (gitignored).
- `public/tools/gf-contrails-extension.zip` — served from the site for
  manual load-unpacked installs (linked from the tool rail until the
  store listing is live). Rebuild BOTH after editing the extension:
  `cd extension && zip -qr gf-contrails.zip gf-contrails -x "*/README.md" && zip -qr ../public/tools/gf-contrails-extension.zip gf-contrails -x "*/README.md"`

## Source of truth

`gf-bookmarklet.js` here is a copy of
`src/tools/contrails/gf-bookmarklet.js` (the bookmarklet on the booking
tool page). After editing the original, re-copy it here. `auto.js` just
sets `window.__sslContrailAuto` so the shared script runs in silent
auto-refresh mode.

## Publishing to the Chrome Web Store (the low-friction path for users)

Sideloaded installers are blocked by Chromium policy, so the Store is how
average users get one-click install (works in Chrome, Arc, Edge, Brave).

1. Create a developer account at https://chrome.google.com/webstore/devconsole
   ($5 one-time fee, any Google account).
2. Build the upload: `cd extension && zip -r gf-contrails.zip gf-contrails`
3. New item → upload the zip.
4. Listing fields:
   - Name: Contrail check for Google Flights
   - Summary: Predicted contrail warming on every Google Flights result.
   - Description: Contrails (condensation trails) can warm the climate as
     much as aviation's CO2 — but their warming varies enormously between
     flights and is largely predictable from schedule information alone.
     This extension adds a "+x% contrail warming" line beside Google's
     emissions estimate on every search result, predicted by a machine
     learning model trained on 22 million simulated flights (Sustainable
     Solutions Lab, Stanford University). Click the info icon on any
     result for details, or open our companion tool to compare
     lower-warming alternatives.
   - Category: Tools. Language: English.
   - Privacy policy URL:
     https://sustainablesolutions.vercel.app/tools/contrails-extension-privacy
   - Single purpose: annotate Google Flights results with contrail
     warming predictions.
   - Data use disclosures: check "website content" → sent to developer's
     service for the item's single purpose; no other data collected.
5. Review typically takes a few days; updates re-use the same listing.

Safari needs a separate App Store submission (Xcode wrapper, $99/yr
Apple developer) — defer until the Chrome listing proves demand.
