#!/usr/bin/env bash
# fetch-data.sh: download the play-by-play seasons and rebuild this episode's file.
#
#   ./fetch-data.sh          all six seasons (about 500 MB unpacked, under a minute)
#   ./fetch-data.sh 2026     only the current season, the one that changes week to week
#
# The download itself is episode 1's: ../episode-1/fetch-data.sh puts the raw nflverse
# files in ../episode-1/data/, and slim-data.mjs here reads them from there, so the
# seasons are never downloaded twice. Episode 1's ESPN fill (fetch-espn.mjs) writes
# episode 1's 18 columns, not this episode's 35, so this file is nflverse only: a game
# nflverse has not published yet is not in it. Run `./fetch-data.sh 2026` on the morning
# of a show.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NO_ESPN_FILL=1 "$DIR/../episode-1/fetch-data.sh" "$@"
cd "$DIR"
node ./slim-data.mjs
