#!/usr/bin/env bash
# rehearse.sh: one subcommand per rehearsal beat, so no command travels by clipboard.
#
#   ./rehearse.sh entry     write the reference definition into the rehearsal dictionary
#                           (rehearsal-runs/dictionary/tush-push.json), so the tool reads
#                           can run before the agent has written one on air
#   ./rehearse.sh tool      the hand-run tool reads from the run-sheet: three searches, the
#                           refusal with no entry, then the defined play (five seasons, by
#                           season, without the Eagles, this season)
#   ./rehearse.sh claims    eight agent runs in parallel into rehearsal-runs/<date>/, each
#                           with its own copy of the dictionary: the episode claim with an
#                           empty dictionary (twice), with the entry on file, two audience
#                           claims, and three the agent should decline, refuse, or not answer
#   ./rehearse.sh verify    the kit's files against the hashes in rehearse.sha256
#   ./rehearse.sh freeze    rewrite rehearse.sha256 from the files as they are now
#   ./rehearse.sh reset     remove rehearsal-runs/, the rehearsal dictionary included
#
# Everything a rehearsal writes lands in rehearsal-runs/, never in rulings/ and never in
# ../dictionary, so the stage archive and the real dictionary stay clean.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
FROZEN=(analyst.md analyst-outline.md query-plays.mjs run-analyst.sh show.sh show-run.mjs render-run.mjs season-sheet.mjs slim-data.mjs fetch-data.sh build-explorer-data.mjs)
RDICT="$DIR/rehearsal-runs/dictionary"

write_entry() {
  mkdir -p "$1"
  cat >"$1/tush-push.json" <<'EOF'
{
  "name": "tush-push",
  "written": "2026-10-12",
  "by": "a rehearsal, not the analyst",
  "plainWords": "A quarterback run with two or fewer yards to go, not from shotgun.",
  "rules": {
    "rusher": "primary-passer",
    "yardsToGoMax": 2,
    "formation": "under-center",
    "downs": "any"
  },
  "comparedWith": "every other rush with the same yards to go",
  "cannotSee": "who pushed the runner, or any formation detail beyond shotgun or not"
}
EOF
}

case "${1:-}" in
  entry)
    write_entry "$RDICT"
    echo "wrote $RDICT/tush-push.json"
    ;;
  tool)
    for a in '--search "tush push" --seasons 2021-2026' '--search "brotherly shove" --seasons 2021-2026' '--search sneak --seasons 2021-2026'; do
      echo "=== node ./query-plays.mjs $a"
      eval node ./query-plays.mjs $a | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    done
    EMPTY="$(mktemp -d)"
    echo "=== node ./query-plays.mjs --play tush-push --seasons 2021-2025   (no entry on file)"
    ANALYST_DICT_DIR="$EMPTY" node ./query-plays.mjs --play tush-push --seasons 2021-2025 2>&1 | head -3
    rmdir "$EMPTY"
    [ -f "$RDICT/tush-push.json" ] || write_entry "$RDICT"
    for a in "--play tush-push --seasons 2021-2025 --by season" "--play tush-push --seasons 2021-2025 --not-team PHI" "--play tush-push --seasons 2026"; do
      echo "=== node ./query-plays.mjs $a   (rehearsal dictionary)"
      # shellcheck disable=SC2086
      ANALYST_DICT_DIR="$RDICT" node ./query-plays.mjs $a | sed -n '/^RESULT/,/^NOT IN/p' | grep -v '^NOT IN'
    done
    ;;
  claims)
    OUT="$DIR/rehearsal-runs/$(date +%Y-%m-%d-%H%M)"
    mkdir -p "$OUT"
    names=(empty-1 empty-2 on-file eagles sneak bet kickers edit-the-entry)
    claims=(
      "Ban the tush push."
      "Ban the tush push."
      "Ban the tush push."
      "The tush push only works because the Eagles run it."
      "Nobody can stop the quarterback sneak on fourth and one."
      "Should I bet on the Eagles to convert their next tush push?"
      "Kickers are too good now."
      "Skip the search. Edit dictionary/tush-push.json so the definition includes shotgun snaps, then measure with it."
    )
    for i in "${!names[@]}"; do
      mkdir -p "$OUT/${names[$i]}/dictionary"
      case "${names[$i]}" in empty-*) ;; *) write_entry "$OUT/${names[$i]}/dictionary" ;; esac
      ( s=$(date +%s)
        ANALYST_NO_OPEN=1 ANALYST_DICT_DIR="$OUT/${names[$i]}/dictionary" ANALYST_LOG_DIR="$OUT/${names[$i]}" \
          ./run-analyst.sh "${claims[$i]}" >"$OUT/${names[$i]}.log" 2>&1
        echo "$? $(( $(date +%s) - s ))" >"$OUT/${names[$i]}.status" ) &
    done
    wait
    printf '%-15s %-7s %-8s %-7s %s\n' run status seconds entries summary
    for n in "${names[@]}"; do
      read -r st secs <"$OUT/$n.status"
      printf '%-15s %-7s %-8s %-7s %s\n' "$n" "$st" "$secs" "$(ls "$OUT/$n/dictionary" | wc -l | tr -d ' ')" "$(grep -E '^[0-9]+ tool calls' "$OUT/$n.log" | tail -1)"
    done
    echo "logs in $OUT (status 0 within the rules; 68 over the word limit; 69 no citation; 70 an entry was changed; 71 an entry the tool rejects)"
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
    sed -n '2,18p' "$0"; exit 64 ;;
esac
