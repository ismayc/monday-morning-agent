#!/usr/bin/env bash
# show.sh: the commands run on air in episode 3, one word each, so no long command
# has to be typed or pasted while the room watches.
#
#   ./show.sh search "<term>" [flags]   one search by name, the flags passed through to query-plays.mjs
#                               (on air: "field goal" with --seasons 2021-2026)
#   ./show.sh trend             the trend by hand: every field goal, five seasons and this one, by distance band
#   ./show.sh refuse            the renderer handed a spec that starts the trend at 2023: rule 1 named, nothing drawn
#   ./show.sh verify            analyst.md and the chart standard, the files on screen, against their frozen hashes
#   ./show.sh run "<claim>"     the agent, one claim, as run-analyst.sh runs it
#   ./show.sh sheets            the five-season sheet, then (after Return) this season's, each opened
#   ./show.sh prove "<claim>"   the fingerprints of every entry and every spec on file, the run, the fingerprints again
#
# Each underlying command is printed on its own line, after a "$ ", before it runs, so
# the real tool line is still on screen. Nothing here is new: every line is one that
# run-analyst.sh, query-plays.mjs, render-chart.mjs, season-sheet.mjs, or rehearse.sh
# already runs.
#
# The environment passes through. ANALYST_DICT_DIR, ANALYST_CHART_DIR, ANALYST_LOG_DIR,
# and ANALYST_NO_OPEN mean what they mean in run-analyst.sh, so a rehearsal that points the
# two folders at rehearsal-runs/ never touches ../dictionary or ../charts, the real ones.
# The fingerprints in "prove" read the same folders the run does.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 66
DICT="${ANALYST_DICT_DIR:-../dictionary}"
CHARTS="${ANALYST_CHART_DIR:-../charts}"

# Print the line as the room would type it, then run it.
show() { printf '$ %s\n' "$1"; shift; "$@"; }

claim() {
  if [ -z "${2:-}" ]; then
    echo "show.sh $1: give it the claim in quotation marks, for example:" >&2
    echo "  ./show.sh $1 \"Kickers are too good now.\"" >&2
    exit 64
  fi
}
# Every entry and every spec on file, because the agent names a spec for its question and
# the name is not known before the run. A folder with no spec yet says so.
fingerprints() {
  show "shasum -a 256 $DICT/*.json" shasum -a 256 "$DICT"/*.json
  if ls "$CHARTS"/*.json >/dev/null 2>&1; then show "shasum -a 256 $CHARTS/*.json" shasum -a 256 "$CHARTS"/*.json
  else printf '$ %s\n%s: no spec on file yet\n' "shasum -a 256 $CHARTS/*.json" "$CHARTS"; fi
}

case "${1:-}" in
  search)
    if [ -z "${2:-}" ]; then
      echo "show.sh search: give it the term in quotation marks, then any query-plays.mjs flags, for example:" >&2
      echo "  ./show.sh search \"field goal\" --seasons 2021-2026" >&2
      exit 64
    fi
    term="$2"
    shift 2
    q="$term"
    case "$term" in *[\ \"]*) q="\"$term\"" ;; esac   # quoted in the echo only when it needs to be
    show "node ./query-plays.mjs --search $q${*:+ $*}" node ./query-plays.mjs --search "$term" "$@"
    ;;
  trend)
    show 'node ./query-plays.mjs --trend field-goal --seasons 2021-2026 --bands' \
      node ./query-plays.mjs --trend field-goal --seasons 2021-2026 --bands
    ;;
  refuse)
    show 'node ../charts/render-chart.mjs ./bad-chart.json' \
      node ../charts/render-chart.mjs ./bad-chart.json
    st=$?
    echo "exit $st"
    exit "$st"
    ;;
  verify)
    printf '$ %s\n' './rehearse.sh verify | grep -E "analyst.md|STANDARD.md"'
    ./rehearse.sh verify | grep -E 'analyst.md|STANDARD.md'
    ;;
  run)
    claim run "${2:-}"
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
  prove)
    claim prove "${2:-}"
    fingerprints
    show "./run-analyst.sh \"$2\"" ./run-analyst.sh "$2"
    st=$?
    fingerprints
    exit "$st"
    ;;
  *)
    sed -n '2,14p' "$0"; exit 64 ;;
esac
