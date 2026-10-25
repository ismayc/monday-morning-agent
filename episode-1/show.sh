#!/usr/bin/env bash
# show.sh: the commands run on air in episode 1, one word each, for anyone rerunning the
# episode from this folder. (Added October 24, 2026, after the show; episode 1 aired with
# the long commands typed by hand. Episode 2's show.sh is the same idea, written first.)
#
#   ./show.sh columns           the plays file: its first rows, its size, and (when the raw
#                               download is here) the raw file's 372 columns and its betting lines
#   ./show.sh tool              the tool by hand: the whole game, then each half, then the first
#                               half of games close at halftime
#   ./show.sh verify            analyst.md, the file on screen, against its frozen hash
#   ./show.sh run "<claim>"     the agent, one claim, as run-analyst.sh runs it
#   ./show.sh sheets            the five-season sheet, then (after Return) this season's, each opened
#
# Each underlying command is printed on its own line, after a "$ ", before it runs, so
# the real tool line is still on screen. Nothing here is new: every line is one the
# episode typed, or one that run-analyst.sh, query-plays.mjs, season-sheet.mjs, or
# rehearse.sh already runs.
#
# The environment passes through: ANALYST_LOG_DIR, ANALYST_NO_OPEN, and ANALYST_WORD_LIMIT
# mean what they mean in run-analyst.sh.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 66

# Print the line as the room would type it, then run it.
show() { printf '$ %s\n' "$1"; shift; "$@"; }

case "${1:-}" in
  columns)
    show 'head -3 data/plays-slim.csv' head -3 data/plays-slim.csv
    printf '$ %s\n' 'wc -l data/plays-slim.csv && ls -lh data/plays-slim.csv'
    wc -l data/plays-slim.csv && ls -lh data/plays-slim.csv
    if [ -f data/pbp2026.csv ]; then
      echo
      printf '$ %s\n' "head -1 data/pbp2026.csv | tr ',' '\\n' | wc -l"
      head -1 data/pbp2026.csv | tr ',' '\n' | wc -l
      printf '$ %s\n' "head -1 data/pbp2026.csv | tr ',' '\\n' | grep -E 'spread|total_line|vegas|odds'"
      head -1 data/pbp2026.csv | tr ',' '\n' | grep -E 'spread|total_line|vegas|odds'
    else
      echo
      echo "(no data/pbp2026.csv here: the raw download, 372 columns with the betting lines, comes from ./fetch-data.sh 2026)"
    fi
    ;;
  tool)
    show 'node ./query-plays.mjs --seasons 2021-2025' node ./query-plays.mjs --seasons 2021-2025
    echo
    show 'node ./query-plays.mjs --seasons 2021-2025 --half 1' node ./query-plays.mjs --seasons 2021-2025 --half 1
    echo
    show 'node ./query-plays.mjs --seasons 2021-2025 --half 2' node ./query-plays.mjs --seasons 2021-2025 --half 2
    echo
    show 'node ./query-plays.mjs --seasons 2021-2025 --half 1 --halftime-margin 3' \
      node ./query-plays.mjs --seasons 2021-2025 --half 1 --halftime-margin 3
    ;;
  verify)
    printf '$ %s\n' './rehearse.sh verify | grep analyst.md'
    ./rehearse.sh verify | grep analyst.md
    ;;
  run)
    if [ -z "${2:-}" ]; then
      echo "show.sh run: give it the claim in quotation marks, for example:" >&2
      echo "  ./show.sh run \"You have to establish the run.\"" >&2
      exit 64
    fi
    show "./run-analyst.sh \"$2\"" ./run-analyst.sh "$2"
    ;;
  sheets)
    open=(--open)
    [ -n "${ANALYST_NO_OPEN:-}" ] && open=()
    show "node ./season-sheet.mjs${open:+ --open}" node ./season-sheet.mjs ${open[@]+"${open[@]}"}
    if [ -t 0 ]; then
      read -r -p "Return for this season's sheet (2026)... " _
    fi
    show "node ./season-sheet.mjs --seasons 2026${open:+ --open}" node ./season-sheet.mjs --seasons 2026 ${open[@]+"${open[@]}"}
    ;;
  *)
    sed -n '2,13p' "$0"; exit 64 ;;
esac
