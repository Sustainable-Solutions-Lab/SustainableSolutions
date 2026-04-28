#!/bin/bash
set -e

# Sustainable Solutions Lab — Sync images
# ------------------------------------------------------------
# Double-click this file after dropping new images into
# /public/images. It will:
#   1. Resize any image larger than 2 MB to max 1800 px wide,
#      JPEG quality 85 (web-friendly, visually identical at
#      sizes the site renders).
#   2. Git-add, commit, and push any /public/images/ changes
#      (additions, modifications, or deletions).
#   3. Vercel auto-rebuilds on the resulting GitHub push,
#      same path the Apps Script edit trigger uses for sheet
#      changes — so an image upload now reaches the live site
#      with no further action.

cd "$HOME/Claude Projects/SustainableSolutions"

clear
echo
echo "════════════════════════════════════════════════════════════"
echo "  Sustainable Solutions Lab — Sync images"
echo "  $(date '+%A, %B %d, %Y · %H:%M')"
echo "════════════════════════════════════════════════════════════"
echo

# 1. Optimize oversize images
echo "→ Checking for oversize images (>2 MB)…"
optimized=0
shopt -s nullglob nocaseglob
for f in public/images/*.jpg public/images/*.jpeg public/images/*.png; do
  [ -f "$f" ] || continue
  sz=$(stat -f%z "$f")
  if [ "$sz" -gt 2097152 ]; then
    tmp=$(mktemp /tmp/sync-img.XXXXXX.jpg)
    if sips -s format jpeg -s formatOptions 85 -Z 1800 "$f" --out "$tmp" >/dev/null 2>&1; then
      mv "$tmp" "$f"
      newsz=$(stat -f%z "$f")
      printf "  ✓ %-40s %5d KB → %5d KB\n" "$(basename "$f")" $((sz / 1024)) $((newsz / 1024))
      optimized=$((optimized + 1))
    else
      rm -f "$tmp"
      echo "  ! sips failed on $(basename "$f") — leaving as-is"
    fi
  fi
done
shopt -u nullglob nocaseglob
[ "$optimized" -eq 0 ] && echo "  All images already web-sized."
echo

# 2. Stage, commit, push if there's anything to push
echo "→ Checking git status…"
git add public/images/

if git diff --cached --quiet public/images/; then
  echo "  No image changes — nothing to commit."
  echo
  echo "  Press any key to close."
  read -n 1 -s
  exit 0
fi

echo
git diff --cached --stat public/images/
echo

git commit -m "Sync /public/images" >/dev/null
echo "→ Pushing…"
git push

echo
echo "════════════════════════════════════════════════════════════"
echo "  ✓ Pushed. Vercel will rebuild in ~30–60 seconds."
echo "════════════════════════════════════════════════════════════"
echo
echo "  Press any key to close."
read -n 1 -s
