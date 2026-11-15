#!/bin/sh
# Makes a Beat Path-style guide bundle for examples/embed.html and the smoke
# test: a 5 s 1280x720 24 fps guide (an orange dot on a drawn path), its
# audio, frame 0 and the JSON files, in examples/media/embed-bundle/
# (gitignored), two placeholder reference images in examples/media/embed-refs/,
# and a labelled clip the fake provider returns as the result.
# Needs ffmpeg. Nothing here sends a request.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/examples/media/embed-bundle"
mkdir -p "$OUT"
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is needed for the embed bundle." >&2; exit 1; }

ffmpeg -loglevel error -y -f lavfi -i "color=c=0x141414:size=1280x720:rate=24:duration=5" \
  -vf "drawbox=x=100:y=356:w=1080:h=8:color=0x555555:t=fill,drawbox=x='100+t*200':y=330:w=60:h=60:color=0xff8a00:t=fill,drawtext=text='guide · placeholder':fontcolor=white:fontsize=28:x=40:y=40" \
  -c:v libx264 -crf 30 -pix_fmt yuv420p -an "$OUT/guide.mp4"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=220:duration=5" -ar 22050 -ac 1 "$OUT/audio.wav"
ffmpeg -loglevel error -y -i "$OUT/guide.mp4" -frames:v 1 "$OUT/frame0.png"
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=24:duration=5" \
  -vf "drawtext=text='fake provider result':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.6:x=(w-text_w)/2:y=h-80" \
  -c:v libx264 -crf 32 -pix_fmt yuv420p -an "$ROOT/examples/media/embed-result.mp4"

REFS="$ROOT/examples/media/embed-refs"
mkdir -p "$REFS"
ffmpeg -loglevel error -y -f lavfi -i "color=c=0xffd23f:size=768x1024" -frames:v 1 \
  -vf "drawtext=text='character sheet · placeholder':fontcolor=black:fontsize=32:x=(w-text_w)/2:y=h/2" "$REFS/character.png"
ffmpeg -loglevel error -y -f lavfi -i "color=c=0x24476b:size=1280x720" -frames:v 1 \
  -vf "drawtext=text='environment · placeholder':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h/2" "$REFS/environment.png"

cat > "$OUT/bundle.json" <<'JSON'
{ "schemaVersion": "0.5.0", "video": "guide.mp4", "audio": "audio.wav", "firstFrame": "frame0.png", "beats": "beats.json", "recipe": "recipe.json", "meta": "meta.json" }
JSON
cat > "$OUT/meta.json" <<'JSON'
{
  "schemaVersion": "0.5.0", "width": 1280, "height": 720, "fps": 24, "frames": 120, "durationSeconds": 5,
  "view": "top", "character": { "kind": "glider", "name": "Path glider" },
  "generator": { "name": "beat-path", "version": "0.1.0", "motion": "path" }, "audioInVideo": false,
  "assets": [
    { "role": "video", "name": "Rendered guide", "licence": "MIT (placeholder)", "file": "guide.mp4" },
    { "role": "audio", "name": "Sine test tone", "licence": "MIT (placeholder)", "file": "audio.wav" }
  ]
}
JSON
cat > "$OUT/beats.json" <<'JSON'
{ "bpm": 120, "offsetSeconds": 0, "beatsPerBar": 4, "source": "analysis", "beats": [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5], "downbeats": [0, 2, 4] }
JSON
cat > "$OUT/recipe.json" <<'JSON'
{
  "tool": "beat-path",
  "shot": {
    "subject": "A courier in a yellow raincoat",
    "environment": "a rain-soaked city crossing at dusk",
    "action": "runs along the drawn path and leaps on the downbeat",
    "legend": "The orange figure is the character"
  }
}
JSON
echo "Embed bundle written to examples/media/embed-bundle/"
