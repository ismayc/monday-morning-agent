#!/usr/bin/env bash
# show.sh: the commands run on air in episode 2, one word each, so no long command
# has to be typed or pasted while the room watches.
#
#   ./show.sh search "<term>" [flags]   one search by name, the flags passed through to query-plays.mjs
#                               (on air, three in turn: "tush push", "brotherly shove", sneak, each
#                               with --seasons 2021-2026)
#   ./show.sh refuse            the tool asked for a play with no entry: exit 65 and the entry's shape
#   ./show.sh verify            analyst.md, the file on screen, against its frozen hash
#   ./show.sh run "<claim>"     the agent, one claim, as run-analyst.sh runs it
#   ./show.sh sheets            the five-season sheet, then (after Return) this season's, each opened
#   ./show.sh prove "<claim>"   the entry's fingerprint, the run, the fingerprint again
#
# Each underlying command is printed on its own line, after a "$ ", before it runs, so
# the real tool line is still on screen. Nothing here is new: every line is one that
# run-analyst.sh, query-plays.mjs, season-sheet.mjs, or rehearse.sh already runs.
#
# The environment passes through. ANALYST_DICT_DIR, ANALYST_LOG_DIR, and ANALYST_NO_OPEN
# mean what they mean in run-analyst.sh, so a rehearsal that points ANALYST_DICT_DIR at
# rehearsal-runs/dictionary never touches ../dictionary, the real one. The fingerprint in
# "prove" reads the same folder the run does.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 66
ENTRY="${ANALYST_DICT_DIR:-../dictionary}/tush-push.json"

# Print the line as the room would type it, then run it.
show() { printf '$ %s\n' "$1"; shift; "$@"; }

claim() {
  if [ -z "${2:-}" ]; then
    echo "show.sh $1: give it the claim in quotation marks, for example:" >&2
    echo "  ./show.sh $1 \"Ban the tush push.\"" >&2
    exit 64
  fi
}

case "${1:-}" in
  search)
    if [ -z "${2:-}" ]; then
      echo "show.sh search: give it the term in quotation marks, then any query-plays.mjs flags, for example:" >&2
      echo "  ./show.sh search \"tush push\" --seasons 2021-2026" >&2
      exit 64
    fi
    term="$2"
    shift 2
    q="$term"
    case "$term" in *[\ \"]*) q="\"$term\"" ;; esac   # quoted in the echo only when it needs to be
    show "node ./query-plays.mjs --search $q${*:+ $*}" node ./query-plays.mjs --search "$term" "$@"
    ;;
  refuse)
    show 'node ./query-plays.mjs --play tush-push --seasons 2021-2025' \
      node ./query-plays.mjs --play tush-push --seasons 2021-2025
    st=$?
    echo "exit $st"
    exit "$st"
    ;;
  verify)
    printf '$ %s\n' './rehearse.sh verify | grep analyst.md'
    ./rehearse.sh verify | grep analyst.md
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
    show "shasum -a 256 $ENTRY" shasum -a 256 "$ENTRY"
    show "./run-analyst.sh \"$2\"" ./run-analyst.sh "$2"
    st=$?
    show "shasum -a 256 $ENTRY" shasum -a 256 "$ENTRY"
    exit "$st"
    ;;
  *)
    sed -n '2,13p' "$0"; exit 64 ;;
esac
