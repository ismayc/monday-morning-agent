#!/usr/bin/env bash
# show.sh: the commands run on air in episode 5, one word each, so no long command
# has to be typed or pasted while the room watches.
#
#   ./show.sh search "<term>" [flags]   one search by name, the flags passed through to query-plays.mjs
#                               (on air: "coward" with --seasons 2021-2026)
#   ./show.sh go                going for it on fourth down, by hand: the entry on file, five seasons and this one
#   ./show.sh score             the same choice by the score at the snap (how much of the going is forced)
#   ./show.sh distance          the same choice by the yards to go
#   ./show.sh verify            analyst.md, checker.md, the boundaries, and the chart standard against their frozen hashes
#   ./show.sh run "<claim>"     the agent, one claim, as run-analyst.sh runs it, the fact-checker after it
#   ./show.sh declined          the log of everything the agent has declined, one line each, newest last
#   ./show.sh prove "<claim>"   the fingerprints of every entry, every spec, and the boundaries, the run, the fingerprints again
#
# Each underlying command is printed on its own line, after a "$ ", before it runs, so
# the real tool line is still on screen. Nothing here is new: every line is one that
# run-analyst.sh, query-plays.mjs, or rehearse.sh already runs.
#
# The environment passes through. ANALYST_DICT_DIR, ANALYST_CHART_DIR, ANALYST_LOG_DIR,
# ANALYST_BOUNDARY_LOG, and ANALYST_NO_OPEN mean what they mean in run-analyst.sh, so a
# rehearsal that points them at rehearsal-runs/ never touches ../dictionary, ../charts, or
# ../boundaries/declined.jsonl, the real ones.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 66
DICT="${ANALYST_DICT_DIR:-../dictionary}"
CHARTS="${ANALYST_CHART_DIR:-../charts}"
LOG="${ANALYST_BOUNDARY_LOG:-../boundaries/declined.jsonl}"

# Print the line as the room would type it, then run it.
show() { printf '$ %s\n' "$1"; shift; "$@"; }

claim() {
  if [ -z "${2:-}" ]; then
    echo "show.sh $1: give it the claim in quotation marks, for example:" >&2
    echo "  ./show.sh $1 \"Coaches are cowards on fourth down.\"" >&2
    exit 64
  fi
}
# Every entry and every spec on file, and the boundaries: the three things a run reads and
# may not change.
fingerprints() {
  show "shasum -a 256 $DICT/*.json" shasum -a 256 "$DICT"/*.json
  if ls "$CHARTS"/*.json >/dev/null 2>&1; then show "shasum -a 256 $CHARTS/*.json" shasum -a 256 "$CHARTS"/*.json
  else printf '$ %s\n%s: no spec on file yet\n' "shasum -a 256 $CHARTS/*.json" "$CHARTS"; fi
  show "shasum -a 256 ../boundaries/BOUNDARIES.md" shasum -a 256 ../boundaries/BOUNDARIES.md
}

case "${1:-}" in
  search)
    if [ -z "${2:-}" ]; then
      echo "show.sh search: give it the term in quotation marks, then any query-plays.mjs flags, for example:" >&2
      echo "  ./show.sh search \"coward\" --seasons 2021-2026" >&2
      exit 64
    fi
    term="$2"
    shift 2
    q="$term"
    case "$term" in *[\ \"]*) q="\"$term\"" ;; esac   # quoted in the echo only when it needs to be
    show "node ./query-plays.mjs --search $q${*:+ $*}" node ./query-plays.mjs --search "$term" "$@"
    ;;
  go)
    show 'node ./query-plays.mjs --choice fourth-down-go --seasons 2021-2026' \
      node ./query-plays.mjs --choice fourth-down-go --seasons 2021-2026
    ;;
  score)
    show 'node ./query-plays.mjs --choice fourth-down-go --seasons 2021-2026 --by score' \
      node ./query-plays.mjs --choice fourth-down-go --seasons 2021-2026 --by score
    ;;
  distance)
    show 'node ./query-plays.mjs --choice fourth-down-go --seasons 2021-2026 --by distance' \
      node ./query-plays.mjs --choice fourth-down-go --seasons 2021-2026 --by distance
    ;;
  verify)
    printf '$ %s\n' './rehearse.sh verify | grep -E "analyst.md|checker.md|BOUNDARIES.md|STANDARD.md"'
    ./rehearse.sh verify | grep -E 'analyst.md|checker.md|BOUNDARIES.md|STANDARD.md'
    ;;
  run)
    claim run "${2:-}"
    show "./run-analyst.sh \"$2\"" ./run-analyst.sh "$2"
    ;;
  declined)
    printf '$ %s\n' "cat $LOG"
    if [ ! -s "$LOG" ]; then echo "nothing declined yet: $LOG is empty or not there"; exit 0; fi
    node -e '
    const lines = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").filter(Boolean)
    lines.forEach((l, i) => { let r; try { r = JSON.parse(l) } catch { console.log(`${i + 1}. (a line that is not JSON)`); return }
      console.log(`${String(i + 1).padStart(2)}. ${r.when}  boundary ${(r.boundaries || []).join(" and ") || "?"}  ruling: ${r.ruling || "none"}  checker: ${r.checker || "not run"}`)
      console.log(`    claim:    ${r.claim}`)
      console.log(`    declined: ${r.declined}`) })
    console.log(`${lines.length} declined, in ${process.argv[1]}`)' "$LOG"
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
    sed -n '2,13p' "$0"; exit 64 ;;
esac
