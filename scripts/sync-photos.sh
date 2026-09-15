#!/bin/bash
# Sync photos from a source folder into the dashboard's photos directory.
#
# Usage:
#   ./scripts/sync-photos.sh ~/Pictures/KitchenDashboard
#
# Tip: create a Photos album in Apple Photos, drag its contents into a folder
# (or use File > Export), then point this script at it. Run it manually or
# schedule with launchd/cron. Photos are copied, never modified or deleted.
#
# For the deployed (Railway) version, photos must be committed to the repo
# (public/photos/) and pushed — Railway rebuilds and serves them.

set -euo pipefail

SRC="${1:?Usage: sync-photos.sh <source-folder>}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/photos"

mkdir -p "$DEST"

copied=0
for f in "$SRC"/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}; do
  [ -e "$f" ] || continue
  cp "$f" "$DEST/"
  copied=$((copied + 1))
done

echo "Copied $copied photo(s) to $DEST"
echo "Commit and push to deploy: git add public/photos && git commit -m 'photos' && git push"