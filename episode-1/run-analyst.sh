#!/usr/bin/env bash
# run-analyst.sh: hand the analyst one claim and watch it work.
#
#   ./run-analyst.sh "You have to establish the run."
#   ./run-analyst.sh                       with no argument, reads the claim from claim.txt
#
# The whole agent is: one policy file (analyst.md), one read-only data tool
# (query-plays.mjs), and `claude -p` as the runtime. There is no server and no API client.
#
# When the run ends, the same run is written as one page (rulings/run-<stamp>.html: the
# ruling at the top, each tool call with its filters and result, the full ruling at the
# end) and opened in the browser. The terminal view stays as it is.
#
# Optional environment:
#   ANALYST_LOG_DIR=/some/dir ./run-analyst.sh "..."
#       Where the event stream, the ruling, and the page land. Default ./rulings
#   ANALYST_NO_OPEN=1 ./run-analyst.sh "..."
#       Write the page but do not open it (a rehearsal batch, a machine with no browser)

set -uo pipefail

# Resolve our own directory and work from it: the policy refers to ./query-plays.mjs.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

POLICY_FILE="$DIR/analyst.md"
CLAIM="${1:-$(cat "$DIR/claim.txt" 2>/dev/null || true)}"
[ -n "$CLAIM" ] || { echo "run-analyst.sh: no claim given and claim.txt is empty" >&2; exit 64; }
[ -f "$POLICY_FILE" ] || { echo "run-analyst.sh: missing policy file $POLICY_FILE" >&2; exit 66; }
[ -f "$DIR/data/plays-slim.csv" ] || { echo "run-analyst.sh: missing data/plays-slim.csv (run ./fetch-data.sh)" >&2; exit 66; }
for bin in claude node; do
  command -v "$bin" >/dev/null 2>&1 || { echo "run-analyst.sh: '$bin' not on PATH" >&2; exit 127; }
done

LOG_DIR="${ANALYST_LOG_DIR:-$DIR/rulings}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
STREAM="$LOG_DIR/run-$STAMP.jsonl"        # every event the agent produced
RULING="$LOG_DIR/ruling-$STAMP.md"        # just the ruling, written by show-run.mjs
PAGE="$LOG_DIR/run-$STAMP.html"           # the run as one page, written by show-run.mjs

echo "run-analyst.sh: claim: $CLAIM"
echo "run-analyst.sh: starting $(date -Iseconds)"

# The allowlist is the security boundary and it is one line long.
#
#   - The Bash entry is pinned to our one script, so the agent can run OUR tool and
#     nothing else. `Bash(node:*)` would have allowed arbitrary JavaScript. The `:*`
#     suffix means "this exact script, any arguments"; without it the agent cannot pass
#     --seasons and the run dies on its first tool call.
#   - The path is relative to this directory, which is why this script cd's here first.
#     It must be spelled exactly the way the policy spells it.
#   - Read, Write, Edit, and every network tool are absent. The agent cannot open the data
#     file directly, cannot change anything, and cannot fetch anything.
#
# --permission-mode default means anything NOT on this list is refused rather than
# silently escalated. In a headless run there is nobody to approve a prompt, so an
# off-list tool call shows up in the stream as REFUSED, which is what we want to see.
#
# --output-format stream-json makes `claude -p` emit each event as it happens instead of
# one block at the end. show-run.mjs turns that stream into the on-screen view and saves
# the ruling.
claude -p "$CLAIM" \
  --append-system-prompt "$(cat "$POLICY_FILE")" \
  --allowedTools "Bash(node ./query-plays.mjs:*)" \
  --permission-mode default \
  --output-format stream-json --verbose \
  2>"$LOG_DIR/run-$STAMP.err" \
  | tee "$STREAM" \
  | node ./show-run.mjs "$RULING" "$PAGE" "$CLAIM"
STATUS="${PIPESTATUS[2]}"

echo "run-analyst.sh: finished $(date -Iseconds) with status $STATUS"
echo "run-analyst.sh: event stream at $STREAM"

# Verify the EFFECT, not the report of the effect: the ruling file exists only if the
# stream ended with a result.
if [ -s "$RULING" ]; then
  echo "run-analyst.sh: ruling at $RULING ($(wc -w <"$RULING" | tr -d ' ') words)"
else
  echo "run-analyst.sh: WARNING, no ruling written to $RULING" >&2
  [ "$STATUS" -eq 0 ] && STATUS=65
fi

# The page: easier to read than the terminal. Opened with the system's opener, if there is one.
if [ -s "$PAGE" ]; then
  echo "run-analyst.sh: run page at $PAGE"
  if [ -z "${ANALYST_NO_OPEN:-}" ]; then
    if command -v open >/dev/null 2>&1; then open "$PAGE"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$PAGE" >/dev/null 2>&1 || true
    fi
  fi
fi
exit "$STATUS"
