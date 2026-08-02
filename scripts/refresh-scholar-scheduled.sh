#!/bin/bash
# Monthly Scholar citation refresh (launchd: com.sjdavis.scholar-refresh).
# Non-interactive twin of refresh-scholar.command: runs the refresh, logs to
# ~/Library/Logs/scholar-refresh.log, and surfaces the two outcomes Steve
# needs to hear about as macOS notifications:
#   - refresh FAILED (likely Scholar rate-limiting) → run manually later
#   - new papers found → paste the CSV into the Publications sheet
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$HOME/Library/CloudStorage/Dropbox/Sites/SustainableSolutions" || exit 1
LOG="$HOME/Library/Logs/scholar-refresh.log"

echo "===== $(date '+%Y-%m-%d %H:%M') scholar refresh =====" >> "$LOG"
if OUT=$(npm run refresh-scholar 2>&1); then
  echo "$OUT" >> "$LOG"
  NEW=$(echo "$OUT" | sed -n 's/.*new since last sheet refresh:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
  if [ -n "$NEW" ] && [ "$NEW" -gt 0 ]; then
    osascript -e "display notification \"$NEW paper(s) on Scholar not yet in the Publications sheet — add row(s) manually when ready\" with title \"Scholar refresh\"" >/dev/null 2>&1
  fi
else
  echo "$OUT" >> "$LOG"
  echo "FAILED" >> "$LOG"
  osascript -e 'display notification "Citation refresh FAILED — double-click scripts/refresh-scholar.command to retry (Scholar may be rate-limiting)" with title "Scholar refresh"' >/dev/null 2>&1
  exit 1
fi
