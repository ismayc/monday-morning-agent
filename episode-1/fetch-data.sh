#!/usr/bin/env bash
# fetch-data.sh: download the play-by-play seasons from nflverse and rebuild the slim file.
#
#   ./fetch-data.sh          all six seasons (about 500 MB unpacked, under a minute)
#   ./fetch-data.sh 2026     only the current season, the one that changes week to week
#
# The 2021 to 2025 files are complete seasons and do not change in any way that matters
# here. The 2026 file grows after every game, so run `./fetch-data.sh 2026` on the
# morning of a show. This and fetch-espn.mjs are the only scripts in the kit that touch
# the network, and the agent's allowlist includes neither.
#
# The fallback: when nflverse has not yet published a game that has been played,
# fetch-espn.mjs fills it from ESPN's game summaries and slim-data.mjs appends it.
# NO_ESPN_FILL=1 skips that step; the daily GitHub Action sets it, so the committed
# file is nflverse only.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$DIR/data"
cd "$DIR/data"

CURRENT=2026
SEASONS=("$@")
[ ${#SEASONS[@]} -eq 0 ] && SEASONS=(2021 2022 2023 2024 2025 "$CURRENT")

for y in "${SEASONS[@]}"; do
  echo "fetch-data: $y"
  curl -fsSL -o "pbp$y.csv.gz" \
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_$y.csv.gz"
  gunzip -f "pbp$y.csv.gz"
done

cd "$DIR"
if [[ " ${SEASONS[*]} " == *" $CURRENT "* && -z "${NO_ESPN_FILL:-}" ]]; then
  node ./fetch-espn.mjs --season "$CURRENT"
fi
node ./slim-data.mjs
