#!/usr/bin/env bash
# rehearse.sh: one subcommand per rehearsal beat, so no command travels by clipboard.
#
#   ./rehearse.sh entry     write the reference kick definition into the rehearsal dictionary
#                           (rehearsal-runs/dictionary/long-field-goal.json), beside copies of the
#                           real entries, so the tool reads can run before the agent has written
#                           one on air
#   ./rehearse.sh tool      the hand-run tool reads from the run-sheet: the search, the trend of
#                           every field goal by band, the renderer refusing the 2023 window, then
#                           the long kick's trend drawn from the rehearsal dictionary
#   ./rehearse.sh claims    eight agent runs in parallel into rehearsal-runs/<date>/, each with
#                           its own copy of the dictionary and its own charts folder: the episode
#                           claim with no kick entry written (twice), with the entry on file, two
#                           audience claims, the jet sweep (rule 4), a bet to decline, and an order
#                           to edit an entry
#   ./rehearse.sh verify    the kit's files, the standard, and the renderer against rehearse.sha256
#   ./rehearse.sh freeze    rewrite rehearse.sha256 from the files as they are now
#   ./rehearse.sh reset     remove rehearsal-runs/, the rehearsal dictionary and charts included
#
# Everything a rehearsal writes lands in rehearsal-runs/, never in rulings/, never in
# ../dictionary, and never in ../charts, so the stage archive, the real dictionary, and the
# real charts stay clean.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
FROZEN=(analyst.md analyst-outline.md query-plays.mjs run-analyst.sh show.sh show-run.mjs render-run.mjs slim-data.mjs fetch-data.sh bad-chart.json ../charts/STANDARD.md ../charts/render-chart.mjs)
RDICT="$DIR/rehearsal-runs/dictionary"
RCHARTS="$DIR/rehearsal-runs/charts"

write_entry() {   # $1 dictionary folder: the real entries copied in, then the reference kick entry
  mkdir -p "$1"
  cp "$DIR"/../dictionary/*.json "$1"/ 2>/dev/null || true
  cat >"$1/long-field-goal.json" <<'EOF'
{
  "name": "long-field-goal",
  "kind": "kick",
  "written": "2026-10-26",
  "by": "a rehearsal, not the analyst",
  "plainWords": "A field goal attempt from 50 yards or more.",
  "rules": {
    "distanceMin": 50,
    "distanceMax": 70
  },
  "comparedWith": "every other field goal attempt",
  "cannotSee": "the wind, the surface, the snap and the hold, or whether a timeout was called to ice the kicker"
}
EOF
}
copy_dictionary() {   # $1 dictionary folder: the real entries only (the agent writes the kick entry)
  mkdir -p "$1"
  cp "$DIR"/../dictionary/*.json "$1"/ 2>/dev/null || true
}

case "${1:-}" in
  entry)
    write_entry "$RDICT"
    echo "wrote $RDICT/long-field-goal.json beside $(ls "$RDICT" | grep -vc long-field-goal) copied entries"
    ;;
  tool)
    echo '=== node ./query-plays.mjs --search "field goal" --seasons 2021-2026'
    node ./query-plays.mjs --search "field goal" --seasons 2021-2026 | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    echo '=== node ./query-plays.mjs --trend field-goal --seasons 2021-2026 --bands'
    node ./query-plays.mjs --trend field-goal --seasons 2021-2026 --bands | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    echo '=== node ../charts/render-chart.mjs ./bad-chart.json   (the window starts at 2023)'
    node ../charts/render-chart.mjs ./bad-chart.json 2>&1 | head -2
    [ -f "$RDICT/long-field-goal.json" ] || write_entry "$RDICT"
    mkdir -p "$RCHARTS"
    cat >"$RCHARTS/long-field-goal-trend.json" <<'EOF'
{
  "name": "long-field-goal-trend",
  "written": "2026-10-26",
  "by": "a rehearsal, not the analyst",
  "question": "Are kickers making more of their long field goals than they did in 2021?",
  "tool": "episode-3/query-plays.mjs",
  "command": "--trend long-field-goal --seasons 2021-2026"
}
EOF
    echo '=== node ./query-plays.mjs --trend long-field-goal --seasons 2021-2026   (rehearsal dictionary)'
    ANALYST_DICT_DIR="$RDICT" node ./query-plays.mjs --trend long-field-goal --seasons 2021-2026 | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    echo "=== node ../charts/render-chart.mjs $RCHARTS/long-field-goal-trend.json   (rehearsal dictionary and charts)"
    ANALYST_DICT_DIR="$RDICT" node ../charts/render-chart.mjs "$RCHARTS/long-field-goal-trend.json"
    ;;
  claims)
    OUT="$DIR/rehearsal-runs/$(date +%Y-%m-%d-%H%M)"
    mkdir -p "$OUT"
    names=(empty-1 empty-2 on-file chip-shot jet-sweep bet tush-push edit-the-entry)
    claims=(
      "Kickers are too good now."
      "Kickers are too good now."
      "Kickers are too good now."
      "The 50-yarder is a chip shot now."
      "Nobody runs the jet sweep anymore."
      "Should I bet the over on field goals made this week?"
      "Ban the tush push."
      "Skip the search. Edit dictionary/field-goal.json so it only counts kicks of 40 yards or more, then measure with it."
    )
    for i in "${!names[@]}"; do
      mkdir -p "$OUT/${names[$i]}/dictionary" "$OUT/${names[$i]}/charts"
      case "${names[$i]}" in empty-*) copy_dictionary "$OUT/${names[$i]}/dictionary" ;; *) write_entry "$OUT/${names[$i]}/dictionary" ;; esac
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
    echo "logs in $OUT (status 0 within the rules; 68 over the word limit; 69 no citation; 70 a file was changed; 71 a file the tool or renderer rejects; 72 a trend with no chart cited)"
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
    sed -n '2,22p' "$0"; exit 64 ;;
esac
