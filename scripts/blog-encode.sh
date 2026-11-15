#!/usr/bin/env bash
# Web copies of Genobi Studio runs for the blog page (blog/).
#
#   GENOBI_LOCAL=<studio .local folder> scripts/blog-encode.sh 813f9416 26875b74@4.2 8de579ee ...
#
# Each argument is a job id (or its first 8 characters), optionally with
# @seconds for the poster frame (default 3). For every id this writes
#   blog/media/<id8>.mp4  H.264 High, yuv420p, ~3 Mbps, +faststart, exactly 10.00 s,
#                         AAC 48 kHz stereo loudness-normalised to -16 LUFS
#                         (gitignored: upload it to R2, see docs/deploy.md)
#   blog/media/<id8>.jpg  poster frame (committed, served with the page)
# and prints one CLIPS line per run (model, prompt, facts from jobs.json) to
# paste into the CLIPS list at the top of blog/scenes.js.
#
# Read-only on the source: it never writes inside the studio folder.
set -euo pipefail

SRC="${GENOBI_LOCAL:?Set GENOBI_LOCAL to the studio .local folder (it holds jobs.json and media/)}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/blog/media"
SECONDS_OUT="${CLIP_SECONDS:-10}"
mkdir -p "$OUT"

[ $# -gt 0 ] || { sed -n '2,15p' "$0"; exit 1; }

for arg in "$@"; do
  id="${arg%@*}"; poster=3
  [ "$arg" != "$id" ] && poster="${arg#*@}"
  short="${id:0:8}"
  matches=("$SRC"/media/"$short"*.mp4)
  [ -f "${matches[0]}" ] || { echo "no media for $short in $SRC/media" >&2; exit 1; }
  [ "${#matches[@]}" -eq 1 ] || { echo "more than one file matches $short" >&2; exit 1; }
  in="${matches[0]}"

  ffmpeg -nostdin -v error -y -i "$in" -t "$SECONDS_OUT" \
    -map 0:v:0 -map 0:a:0? \
    -c:v libx264 -preset slow -profile:v high -level 4.0 -pix_fmt yuv420p \
    -b:v 3M -maxrate 4M -bufsize 6M -r 24 \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -c:a aac -b:a 128k -ar 48000 -ac 2 \
    -movflags +faststart "$OUT/$short.mp4"

  ffmpeg -nostdin -v error -y -ss "$poster" -i "$in" -frames:v 1 -q:v 3 "$OUT/$short.jpg"

  python3 -I - "$SRC/jobs.json" "$short" "$OUT/$short.mp4" <<'PY'
import json, subprocess, sys, datetime as d
from fractions import Fraction
jobs_path, short, out = sys.argv[1:4]
data = json.load(open(jobs_path))
jobs = data if isinstance(data, list) else data.get("jobs", list(data.values()))
job = next(j for j in jobs if j["id"].startswith(short))
probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", out]))
v = next(s for s in probe["streams"] if s["codec_type"] == "video")
iso = lambda s: d.datetime.fromisoformat(s.replace("Z", "+00:00"))
row = {
  "id": short,
  "model": job["model"],
  "prompt": job["description"],
  "refs": job.get("imageReferenceCount", 0),
  "w": v["width"], "h": v["height"],
  "fps": round(float(Fraction(v["r_frame_rate"])), 3),
  "cost": job.get("costActualUsd"),
  "secs": round((iso(job["updatedAt"]) - iso(job["createdAt"])).total_seconds()),
  "dur": round(float(probe["format"]["duration"]), 2),
  "audio": any(s["codec_type"] == "audio" for s in probe["streams"]),
}
print(json.dumps(row, ensure_ascii=False))
PY
done

du -h "$OUT"/*.mp4 "$OUT"/*.jpg | sort -k2 >&2
