#!/bin/sh
# Makes labelled placeholder clips and inputs for the demo records in
# examples/records/blog/, so both blog panels play without a key or a paid
# run. Output goes to examples/media/placeholder/ (gitignored). Needs ffmpeg.
# If scripts/prepare-demo-media.sh has copied the mannequin guide in, that
# guide and its first frame are used; otherwise test patterns stand in.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIA="$ROOT/examples/media"
OUT="$MEDIA/placeholder"
mkdir -p "$OUT/inputs"
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is needed for the placeholder clips." >&2; exit 1; }

clip() { # name label hue
  ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=480x270:rate=24:duration=8" \
    -vf "hue=h=$3,drawtext=text='$2':fontcolor=white:fontsize=20:box=1:boxcolor=black@0.65:boxborderw=6:x=(w-text_w)/2:y=h-44" \
    -c:v libx264 -crf 32 -pix_fmt yuv420p -an "$OUT/$1.mp4"
}

hue=0
for test in camera audio-sync character guidance; do
  for model in kling-4:Kling_VIDEO_4.0 kling-4-flash:Kling_4.0_Flash seedance-2.5:Seedance_2.5 h3:MiniMax_H3 ltx-2.5:LTX-2.5_Pro flux-3-video:FLUX_3_Video; do
    id="${model%%:*}"; name="$(echo "${model#*:}" | tr '_' ' ')"
    clip "$test-$id" "$name · placeholder" "$hue"
    hue=$(( (hue + 47) % 360 ))
  done
done

GUIDE="$MEDIA/mannequin-two-fruits-guide-1280x720-24fps.mp4"
FRAME="$MEDIA/mannequin-two-fruits-guide-first-frame-1280x720.png"
if [ -f "$GUIDE" ]; then
  ffmpeg -loglevel error -y -i "$GUIDE" -t 8 -vf scale=640:360 -c:v libx264 -crf 26 -pix_fmt yuv420p -an "$OUT/guide.mp4"
else
  clip guide "Motion Studio guide · placeholder" 200
fi
if [ -f "$FRAME" ]; then
  ffmpeg -loglevel error -y -i "$FRAME" -vf scale=640:360 "$OUT/inputs/first-frame.png"
else
  ffmpeg -loglevel error -y -i "$OUT/guide.mp4" -frames:v 1 "$OUT/inputs/first-frame.png"
fi
ffmpeg -loglevel error -y -f lavfi -i "testsrc=size=640x360" -frames:v 1 \
  -vf "drawtext=text='character still · placeholder':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.65:x=(w-text_w)/2:y=h-50" "$OUT/inputs/character.png"
ffmpeg -loglevel error -y -f lavfi -i "smptebars=size=640x360" -frames:v 1 \
  -vf "drawtext=text='product sheet · placeholder':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.65:x=(w-text_w)/2:y=h-50" "$OUT/inputs/product.png"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=110:duration=8:beep_factor=4" -c:a pcm_s16le "$OUT/inputs/beat.wav"
echo "placeholder media in $OUT"
