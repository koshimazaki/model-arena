#!/bin/sh
# Uploads site-media/ (web copies, posters, originals, reference images) to an R2 bucket.
#
#   CLOUDFLARE_ACCOUNT_ID=<account id> sh scripts/site-upload-r2.sh <bucket> [prefix]
#
# Needs wrangler logged in (npx wrangler login). Every file goes up with its
# content type; an object at the same key is replaced. Prints each command
# first; set DRY_RUN=1 to print only.
set -eu

BUCKET="${1:-${R2_BUCKET:-}}"
PREFIX="${2:-${R2_PREFIX:-}}"
DIR="${SITE_MEDIA_DIR:-site-media}"

if [ -z "$BUCKET" ]; then
  echo "usage: CLOUDFLARE_ACCOUNT_ID=<id> sh scripts/site-upload-r2.sh <bucket> [prefix]" >&2
  exit 2
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Set CLOUDFLARE_ACCOUNT_ID (wrangler reads it to pick the account)." >&2
  exit 2
fi
if [ ! -d "$DIR" ]; then
  echo "$DIR/ is missing: run npm run site:media first." >&2
  exit 2
fi
case "$PREFIX" in ""|*/) ;; *) PREFIX="$PREFIX/" ;; esac

for f in "$DIR"/*; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  case "$name" in
    *.mp4) type="video/mp4" ;;
    *.jpg|*.jpeg) type="image/jpeg" ;;
    *.png) type="image/png" ;;
    *.webp) type="image/webp" ;;
    *) echo "skip $name (unknown type)"; continue ;;
  esac
  echo "wrangler r2 object put $BUCKET/$PREFIX$name --file $f --content-type $type --remote"
  if [ "${DRY_RUN:-}" != "1" ]; then
    npx wrangler r2 object put "$BUCKET/$PREFIX$name" --file "$f" --content-type "$type" \
      --cache-control "public, max-age=31536000, immutable" --remote
  fi
done
echo "Done. Media base for the build: <bucket public URL>/$PREFIX"
