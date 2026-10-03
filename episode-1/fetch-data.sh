#!/usr/bin/env bash
# fetch-data.sh: download the play-by-play seasons from nflverse and rebuild the slim file.
#
#   ./fetch-data.sh          all six seasons (about 500 MB unpacked, under a minute)
#   ./fetch-data.sh 2026     only the current season, the one that changes week to week
#
# The 2021 to 2025 files are complete seasons and do not change in any way that matters
# here. The 2026 file grows after every game, so run `./fetch-data.sh 2026` on the
# morning of a show. This is the only script in the kit that touches the network, and
# the agent's allowlist does not include it.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$DIR/data"
cd "$DIR/data"

SEASONS=("$@")
[ ${#SEASONS[@]} -eq 0 ] && SEASONS=(2021 2022 2023 2024 2025 2026)

for y in "${SEASONS[@]}"; do
  echo "fetch-data: $y"
  curl -fsSL -o "pbp$y.csv.gz" \
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_$y.csv.gz"
  gunzip -f "pbp$y.csv.gz"
done

cd "$DIR"
node ./slim-data.mjs
