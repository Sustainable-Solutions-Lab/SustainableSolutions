#!/bin/bash
set -e

# Sustainable Solutions Lab — Scholar refresh
# ------------------------------------------------------------
# Double-click this file in Finder to run. It will:
#   1. Walk Steve's Google Scholar profile
#   2. Fetch any new paper detail pages
#   3. Merge everything into templates/publications-from-scholar.csv
#   4. Tell you what to do next

cd "$HOME/Claude Projects/SustainableSolutions"

clear
echo
echo "════════════════════════════════════════════════════════════"
echo "  Sustainable Solutions Lab — Scholar refresh"
echo "  $(date '+%A, %B %d, %Y · %H:%M')"
echo "════════════════════════════════════════════════════════════"
echo

npm run refresh-scholar

echo
echo "────────────────────────────────────────────────────────────"
echo "  Next steps"
echo "────────────────────────────────────────────────────────────"
echo
echo "  1. Open templates/publications-from-scholar.csv"
echo "  2. Paste the rows into the Publications sheet"
echo "     (Vercel will redeploy when the Apps Script edit"
echo "      trigger fires — usually within ~60 seconds)"
echo
echo "  Many HTTP 429 errors above? Scholar is rate-limiting"
echo "  your current IP. Try again later from a different"
echo "  network (mobile hotspot, VPN, or just wait a few hours)."
echo
echo "  Press any key to close this window."
read -n 1 -s
