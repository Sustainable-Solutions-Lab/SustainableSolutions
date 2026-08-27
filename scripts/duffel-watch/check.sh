#!/bin/zsh
# Daily Duffel watchdog: our tool only ever searches (free); charges come
# only from ORDERS. If any order ever exists on the account, something is
# using the token to book — alert loudly.
TOKEN_FILE="$HOME/.config/duffel/token"
LOG="$HOME/.config/duffel/watch.log"
[ -s "$TOKEN_FILE" ] || { echo "$(date) no token file, skipping" >> "$LOG"; exit 0; }
TOKEN=$(cat "$TOKEN_FILE")
RESP=$(curl -s --max-time 60 -H "Authorization: Bearer $TOKEN" -H "Duffel-Version: v2" \
  "https://api.duffel.com/air/orders?limit=5")
COUNT=$(echo "$RESP" | /usr/bin/python3 -c "import json,sys
try:
    d=json.load(sys.stdin); print(len(d.get('data',[])))
except Exception: print('ERR')")
echo "$(date) orders=$COUNT" >> "$LOG"
if [ "$COUNT" = "ERR" ]; then
  osascript -e 'display notification "Duffel watchdog could not check orders (API error) — check log" with title "Duffel watchdog"'
elif [ "$COUNT" != "0" ]; then
  osascript -e 'display alert "DUFFEL CHARGES ALERT" message "Bookable ORDERS exist on your Duffel account — these incur charges on the Stanford card. Our tool never books; investigate at app.duffel.com immediately and consider revoking the live token." as critical'
  open "https://app.duffel.com/"
fi
