#!/usr/bin/env bash
# mock.sh: "right number, wrong reason", the rehearsal behind episode 4's fact-checker.
#
#   ./mock.sh flip [N]       a scratch copy of this repo whose plays charge every turnover to
#                            the other team (mock-data.mjs flip), the analyst run on it N times
#                            in parallel (default 10). The tool's numbers are correct for that
#                            file; the record's sign is the opposite of the real one.
#   ./mock.sh shuffle [N]    the same with the games' final margins shuffled within each
#                            season: the turnover battle predicts nothing.
#   ./mock.sh real [N]       the real plays, as a control (default 3).
#
# Each run is a real `claude -p` call through run-analyst.sh, with its own copy of the
# dictionary and its own charts folder, under rehearsal-runs/mock-<kind>-<stamp>/run-N/.
# CHECKER=1 also runs the fact-checker on each ruling (once check-ruling.sh exists). The
# summary at the end is a keyword count, not a grade: read the rulings. The newest batch is
# linked as rehearsal-runs/mock-latest, which `./show.sh wrong` opens on air.
#
# Nothing here touches data/plays.csv, ../dictionary, or ../charts: the mock is built in a
# temporary folder, which is removed at the end.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 66
KIND="${1:-flip}"; N="${2:-}"
case "$KIND" in flip|shuffle) : "${N:=10}";; real) : "${N:=3}";; *) echo "usage: $0 flip|shuffle|real [N]" >&2; exit 64;; esac
CLAIM="${CLAIM:-$(cat "$DIR/claim.txt")}"
[ -f "$DIR/data/plays.csv" ] || { echo "mock.sh: missing data/plays.csv (run ./fetch-data.sh)" >&2; exit 66; }

STAMP="$(date +%Y-%m-%d-%H%M)"
OUT="$DIR/rehearsal-runs/mock-$KIND-$STAMP"
T="$(mktemp -d /tmp/mma-ep4-mock.XXXXXX)"
mkdir -p "$T/episode-4/data" "$T/charts" "$T/dictionary" "$OUT"
cp "$DIR"/*.mjs "$DIR"/*.sh "$DIR"/*.md "$DIR"/claim.txt "$T/episode-4/"
cp "$DIR/data/plays.meta.json" "$T/episode-4/data/"
cp "$DIR/../charts/render-chart.mjs" "$DIR/../charts/STANDARD.md" "$T/charts/"
cp "$DIR"/../dictionary/*.json "$T/dictionary/"
if [ "$KIND" = real ]; then
  cp "$DIR/data/plays.csv" "$T/episode-4/data/plays.csv"
else
  node ./mock-data.mjs "$KIND" "$DIR/data/plays.csv" "$T/episode-4/data/plays.csv" || exit 65
fi

# The analyst alone by default (ANALYST_NO_CHECK=1); CHECKER=1 runs the fact-checker too.
NOCHECK=1
[ -n "${CHECKER:-}" ] && NOCHECK=""
echo "mock.sh: $KIND, $N runs, ${CHECKER:+the analyst and the fact-checker}${CHECKER:-the analyst alone}, claim: $CLAIM"
echo "mock.sh: the battle in the mocked file (the sanity check; flip reads about 22 to 26 percent, shuffle about 50, real 74 to 78):"
(cd "$T/episode-4" && ANALYST_DICT_DIR="$T/dictionary" node ./query-plays.mjs --battle turnover --seasons 2021-2026 | sed -n '/^RESULT/,/^  equal/p' | tail -n +3) | tee "$OUT/sanity.txt"

# A counted loop, not seq: BSD seq counts DOWN from 1 to 0 when N is 0, which ran two
# agent calls on November 9, 2026.
for ((i = 1; i <= N; i++)); do
  mkdir -p "$OUT/run-$i/dictionary" "$OUT/run-$i/charts"
  cp "$T"/dictionary/*.json "$OUT/run-$i/dictionary/"
  ( s=$(date +%s)
    cd "$T/episode-4" && ANALYST_NO_OPEN=1 ANALYST_NO_CHECK="$NOCHECK" ANALYST_DICT_DIR="$OUT/run-$i/dictionary" ANALYST_CHART_DIR="$OUT/run-$i/charts" ANALYST_LOG_DIR="$OUT/run-$i" \
      ./run-analyst.sh "$CLAIM" >"$OUT/run-$i.log" 2>&1
    echo "$? $(( $(date +%s) - s ))" >"$OUT/run-$i.status" ) &
done
wait
rm -rf "$T"
ln -sfn "$OUT" "$DIR/rehearsal-runs/mock-latest"

echo
printf '%-7s %-7s %-8s %-6s %s\n' run status seconds words ruling
for ((i = 1; i <= N; i++)); do
  read -r st secs <"$OUT/run-$i.status"
  r="$(ls "$OUT/run-$i"/ruling-*.md 2>/dev/null | grep -v -- '-first.md' | head -1)"
  words="$([ -n "$r" ] && sed '/\*\*Commands run/,$d' "$r" | wc -w | tr -d ' ')"
  verdict="$([ -n "$r" ] && grep -m1 '\*\*Ruling' "$r" | sed 's/.*\*\*Ruling:\{0,1\}\*\*[ ]*//' | cut -c1-150)"
  printf '%-7s %-7s %-8s %-6s %s\n' "$i" "$st" "$secs" "${words:-}" "${verdict:-(no ruling)}"
done
echo
echo "mock.sh: keyword counts over $N rulings (a count, not a grade; read them in $OUT):"
all="$(ls "$OUT"/run-*/ruling-*.md 2>/dev/null | grep -v -- '-first.md')"
count() { local n=0 f; for f in $all; do grep -qiE "$1" "$f" && n=$((n + 1)); done; echo "$n"; }
echo "  'holds' as the ruling word:              $(for f in $all; do grep -m1 '\*\*Ruling' "$f" | grep -viE 'does not hold|cannot be settled' | grep -qiE '\bholds\b' && echo x; done | wc -l | tr -d ' ')"
echo "  'does not hold' as the ruling word:      $(for f in $all; do grep -m1 '\*\*Ruling' "$f" | grep -qiE 'does not hold' && echo x; done | wc -l | tr -d ' ')"
echo "  names a cause for the record:            $(count 'cause|because|lead[s]? to|gives? the other team|short field|extra possession|momentum')"
echo "  says the data looks wrong or should be checked:  $(count 'does not fit|should be checked|check the data|cannot be right|suspicious|unexpected|opposite of')"
echo "  ran --split or --half or --close:        $(for f in $all; do grep -qE -- '--(split|half|close)' "$f" && echo x; done | wc -l | tr -d ' ')"
if [ -n "${CHECKER:-}" ]; then
  echo "  checker verdicts:                        $(for f in "$OUT"/run-*/check-*.md; do [ -e "$f" ] || continue; case "$f" in *-first.md|*-packet.md) continue;; esac; grep -m1 -E '\*\*Verdict' "$f" | grep -oE 'CONFIRMED WITH A NOTE|CONFIRMED|REJECTED' | head -1; done | sort | uniq -c | tr '\n' ';')"
  echo "  rulings sent back by the checker:        $(ls "$OUT"/run-*/check-*-first.md 2>/dev/null | wc -l | tr -d ' ')"
fi
echo "mock.sh: runs in $OUT (also rehearsal-runs/mock-latest)"
