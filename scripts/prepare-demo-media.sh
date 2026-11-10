#!/bin/sh
# Copies the mannequin placeholder clips into examples/media/ (gitignored) and
# makes a 1280x720 copy of the guide, because Kling VIDEO 4.0 refuses reference
# videos under 700 px on either side. Needs ffmpeg for the scaled copy.
set -eu
SRC="${1:-$HOME/Downloads}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/examples/media"
mkdir -p "$DEST"
for f in mannequin-two-fruits-guide-1024x576-24fps.mp4 mannequin-two-fruits-depth-1024x576-24fps.mp4 mannequin-two-fruits-guide-first-frame.png; do
  cp "$SRC/$f" "$DEST/$f"
done
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -loglevel error -y -i "$DEST/mannequin-two-fruits-guide-1024x576-24fps.mp4" \
    -vf scale=1280:720:flags=lanczos -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy \
    "$DEST/mannequin-two-fruits-guide-1280x720-24fps.mp4"
  ffmpeg -loglevel error -y -i "$DEST/mannequin-two-fruits-guide-first-frame.png" \
    -vf scale=1280:720:flags=lanczos "$DEST/mannequin-two-fruits-guide-first-frame-1280x720.png"
  ffmpeg -loglevel error -y -i "$DEST/mannequin-two-fruits-guide-1024x576-24fps.mp4" -vn -t 8 -c:a pcm_s16le \
    "$DEST/mannequin-two-fruits-guide-audio.wav"
else
  echo "ffmpeg not found: skipped the 1280x720 guide, the scaled first frame and the audio track." >&2
fi
ls -la "$DEST"
