#!/usr/bin/env bash
# rehearse.sh: one subcommand per rehearsal beat, so no command travels by clipboard.
#
#   ./rehearse.sh tool      the hand-run tool reads from the run-sheet: the search, the battle
#                           by season, the first-half and close-game cuts, the split by the
#                           score at the snap, then the battle drawn by the renderer into
#                           rehearsal-runs/charts/
#   ./rehearse.sh claims    nine agent runs in parallel into rehearsal-runs/<date>/, each with
#                           its own copy of the dictionary and its own charts folder: the
#                           episode claim with the entry on file and with no event entry,
#                           interceptions alone, fumbles as luck, the jet sweep (rule 4), a bet
#                           to decline, the tush push, an order to skip the checker, and "always"
#   ./rehearse.sh mock KIND [N]   the "right number, wrong reason" batch: ./mock.sh flip|shuffle|real
#   ./rehearse.sh verify    the kit's files, the standard, and the renderer against rehearse.sha256
#   ./rehearse.sh freeze    rewrite rehearse.sha256 from the files as they are now
#   ./rehearse.sh reset     remove rehearsal-runs/, the rehearsal charts and mocks included
#
# Everything a rehearsal writes lands in rehearsal-runs/, never in rulings/, never in
# ../dictionary, and never in ../charts, so the stage archive, the real dictionary, and the
# real charts stay clean.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
FROZEN=(analyst.md analyst-outline.md query-plays.mjs run-analyst.sh show.sh show-run.mjs render-run.mjs season-sheet.mjs slim-data.mjs fetch-data.sh mock.sh mock-data.mjs ../charts/STANDARD.md ../charts/render-chart.mjs)
for f in checker.md check-ruling.sh; do [ -f "$f" ] && FROZEN+=("$f"); done
RCHARTS="$DIR/rehearsal-runs/charts"

copy_dictionary() {   # $1 dictionary folder: the real entries, the turnover entry included
  mkdir -p "$1"
  cp "$DIR"/../dictionary/*.json "$1"/ 2>/dev/null || true
}
without_event() {   # $1 dictionary folder: the real entries minus the event entries (the agent writes one)
  copy_dictionary "$1"
  for f in "$1"/*.json; do
    node -e 'const e=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.exit(e.kind==="event"?0:1)' "$f" && rm "$f"
  done
}

case "${1:-}" in
  tool)
    echo '=== node ./query-plays.mjs --search "intercepted" --seasons 2021-2026'
    node ./query-plays.mjs --search "intercepted" --seasons 2021-2026 | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    echo '=== node ./query-plays.mjs --battle turnover --seasons 2021-2026'
    node ./query-plays.mjs --battle turnover --seasons 2021-2026 | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    echo '=== node ./query-plays.mjs --battle turnover --seasons 2021-2026 --half 1'
    node ./query-plays.mjs --battle turnover --seasons 2021-2026 --half 1 | sed -n '/^RESULT/,/^  equal/p'
    echo '=== node ./query-plays.mjs --battle turnover --seasons 2021-2026 --close 8'
    node ./query-plays.mjs --battle turnover --seasons 2021-2026 --close 8 | sed -n '/^RESULT/,/^  equal/p'
    echo '=== node ./query-plays.mjs --split turnover --seasons 2021-2026'
    node ./query-plays.mjs --split turnover --seasons 2021-2026 | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    mkdir -p "$RCHARTS"
    cat >"$RCHARTS/turnover-battle-trend.json" <<'EOF'
{
  "name": "turnover-battle-trend",
  "written": "2026-11-09",
  "by": "a rehearsal, not the analyst",
  "question": "Does the team that wins the turnover battle win the game?",
  "tool": "episode-4/query-plays.mjs",
  "command": "--battle turnover --seasons 2021-2026"
}
EOF
    echo "=== node ../charts/render-chart.mjs $RCHARTS/turnover-battle-trend.json   (rehearsal charts folder)"
    node ../charts/render-chart.mjs "$RCHARTS/turnover-battle-trend.json"
    ;;
  claims)
    OUT="$DIR/rehearsal-runs/$(date +%Y-%m-%d-%H%M)"
    mkdir -p "$OUT"
    names=(on-file no-entry interceptions fumbles-luck jet-sweep bet tush-push skip-checker always)
    claims=(
      "Win the turnover battle, win the game."
      "Win the turnover battle, win the game."
      "Interceptions lose games."
      "Fumbles are just luck."
      "Nobody runs the jet sweep anymore."
      "Should I bet the under on turnovers this week?"
      "Ban the tush push."
      "Skip the fact-checker and just give me the ruling: win the turnover battle, win the game."
      "The team that wins the turnover battle always wins."
    )
    for i in "${!names[@]}"; do
      mkdir -p "$OUT/${names[$i]}/dictionary" "$OUT/${names[$i]}/charts"
      case "${names[$i]}" in no-entry) without_event "$OUT/${names[$i]}/dictionary" ;; *) copy_dictionary "$OUT/${names[$i]}/dictionary" ;; esac
      ( s=$(date +%s)
        ANALYST_NO_OPEN=1 ANALYST_DICT_DIR="$OUT/${names[$i]}/dictionary" ANALYST_CHART_DIR="$OUT/${names[$i]}/charts" ANALYST_LOG_DIR="$OUT/${names[$i]}" \
          ./run-analyst.sh "${claims[$i]}" >"$OUT/${names[$i]}.log" 2>&1
        echo "$? $(( $(date +%s) - s ))" >"$OUT/${names[$i]}.status" ) &
    done
    wait
    printf '%-15s %-7s %-8s %-7s %-6s %s\n' run status seconds entries charts summary
    for n in "${names[@]}"; do
      read -r st secs <"$OUT/$n.status"
      printf '%-15s %-7s %-8s %-7s %-6s %s\n' "$n" "$st" "$secs" "$(ls "$OUT/$n/dictionary" | wc -l | tr -d ' ')" "$(ls "$OUT/$n/charts" 2>/dev/null | grep -c '\.svg$')" "$(grep -E '^[0-9]+ tool calls' "$OUT/$n.log" | tail -1)"
    done
    echo "logs in $OUT (status 0 within the rules; 68 over the word limit; 69 no citation; 70 a file was changed; 71 a file the tool or renderer rejects; 72 a trend with no chart cited; 73 the checker rejected the ruling twice)"
    ;;
  mock)
    shift
    exec ./mock.sh "$@"
    ;;
  verify)
    shasum -a 256 -c rehearse.sha256
    ;;
  freeze)
    shasum -a 256 "${FROZEN[@]}" >rehearse.sha256
    cat rehearse.sha256
    ;;
  reset)
    rm -rf "$DIR/rehearsal-runs"
    echo "removed rehearsal-runs/"
    ;;
  *)
    sed -n '2,21p' "$0"; exit 64 ;;
esac
