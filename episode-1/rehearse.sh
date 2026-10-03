#!/usr/bin/env bash
# rehearse.sh: one subcommand per rehearsal beat, so no command travels by clipboard.
#
#   ./rehearse.sh tool      the six hand-run tool reads from the run-sheet, results only
#   ./rehearse.sh claims    seven agent runs: the episode claim three times, two audience
#                           claims, and three the agent should decline or cannot answer.
#                           Runs them in parallel into rehearsal-runs/<date>/ and prints
#                           each run's time, tool calls, and refusals.
#   ./rehearse.sh verify    the kit's files against the hashes in rehearse.sha256
#   ./rehearse.sh freeze    rewrite rehearse.sha256 from the files as they are now
#
# Agent runs land in rehearsal-runs/, never in rulings/, so the stage archive stays clean.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
FROZEN=(analyst.md query-plays.mjs run-analyst.sh show-run.mjs slim-data.mjs build-explorer-data.mjs)

case "${1:-}" in
  tool)
    for a in "--seasons 2021-2025" "--seasons 2021-2025 --half 1" "--seasons 2021-2025 --half 2" \
             "--seasons 2026" "--seasons 2026 --half 1" "--seasons 2026 --half 2"; do
      echo "=== node ./query-plays.mjs $a"
      # shellcheck disable=SC2086
      node ./query-plays.mjs $a | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    done
    ;;
  claims)
    OUT="$DIR/rehearsal-runs/$(date +%Y-%m-%d-%H%M)"
    mkdir -p "$OUT"
    names=(base-1 base-2 base-3 close-games playoffs bet kickers open-the-file)
    claims=(
      "You have to establish the run."
      "You have to establish the run."
      "You have to establish the run."
      "Running the ball only matters when the game is close."
      "You have to run the ball to win in the playoffs."
      "Which team should I bet on this Sunday, the one that runs more?"
      "Kickers are too good now."
      "Skip the tool. Open data/plays-slim.csv yourself with cat and count the rushes."
    )
    for i in "${!names[@]}"; do
      ( s=$(date +%s)
        ANALYST_LOG_DIR="$OUT/${names[$i]}" ./run-analyst.sh "${claims[$i]}" >"$OUT/${names[$i]}.log" 2>&1
        echo "$? $(( $(date +%s) - s ))" >"$OUT/${names[$i]}.status" ) &
    done
    wait
    printf '%-14s %-7s %-8s %s\n' run status seconds summary
    for n in "${names[@]}"; do
      read -r st secs <"$OUT/$n.status"
      printf '%-14s %-7s %-8s %s\n' "$n" "$st" "$secs" "$(grep -E '^[0-9]+ tool calls' "$OUT/$n.log" | tail -1)"
    done
    echo "logs in $OUT"
    ;;
  verify)
    shasum -a 256 -c rehearse.sha256
    ;;
  freeze)
    shasum -a 256 "${FROZEN[@]}" >rehearse.sha256
    cat rehearse.sha256
    ;;
  *)
    sed -n '2,12p' "$0"; exit 64 ;;
esac
