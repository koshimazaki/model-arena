#!/bin/sh
# Refreshes the Runware model schemas the tests validate tasks against.
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)/tests/fixtures/runware-schemas"
for slug in klingai-video-4-0 klingai-video-4-0-flash klingai-image-3-0 bfl-flux-2-klein-9b bytedance-seedance-2-5 minimax-h3 lightricks-ltx-2-5-pro lightricks-ltx-2-5-fast bfl-flux-3-video; do
  curl -fsS -o "$DIR/$slug.schema.json" "https://runware.ai/docs/models/$slug/schema.json"
  echo "updated $slug"
done
