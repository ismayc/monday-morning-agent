#!/usr/bin/env bash
# run-analyst.sh: hand the analyst one claim and watch it work.
#
#   ./run-analyst.sh "Ban the tush push."
#   ./run-analyst.sh                       with no argument, reads the claim from claim.txt
#
# The whole agent is: one policy file (analyst.md), one read-only data tool
# (query-plays.mjs), one folder it may write new entries into (../dictionary), and
# `claude -p` as the runtime. There is no server and no API client.
#
# What is new since episode 1 is memory. The dictionary as it stands is appended to the
# policy on every run, so the agent reads what it wrote last time; the tool measures only
# by a written entry; and the ruling has to cite the entry it used. Three things the
# policy asks for, and this script checks each one after the run (see below).
#
# When the run ends, the same run is written as one page (rulings/run-<stamp>.html: the
# ruling at the top, each tool call and each dictionary entry written, the full ruling at
# the end) and opened in the browser. The terminal view stays as it is.
#
# Optional environment:
#   ANALYST_LOG_DIR=/some/dir ./run-analyst.sh "..."
#       Where the event stream, the ruling, and the page land. Default ./rulings
#   ANALYST_DICT_DIR=/some/dir ./run-analyst.sh "..."
#       The dictionary folder. Default ../dictionary, the real one. A rehearsal points
#       this at a scratch copy, so what the agent writes in rehearsal is not what ships.
#   ANALYST_NO_OPEN=1 ./run-analyst.sh "..."
#       Write the page but do not open it (a rehearsal batch, a machine with no browser)
#   ANALYST_WORD_LIMIT=400 ./run-analyst.sh "..."
#       The ruling's word limit, counted above the "Commands run" line. The policy says 400;
#       set it lower to watch the over-limit path (the retry, then the failure).
#
# Exit codes: 0 a ruling within the rules; 64 to 66 a setup problem; 68 over the word
# limit after one retry; 69 the ruling does not cite the entry it measured with, after one
# retry; 70 the run changed an entry that already existed (restored from the copy made
# before the run); 71 the dictionary holds a file the tool cannot use.

set -uo pipefail

LIMIT="${ANALYST_WORD_LIMIT:-400}"
words_above_the_commands() { sed '/\*\*Commands run/,$d' "$1" | wc -w | tr -d ' '; }

# Resolve our own directory and work from it: the policy refers to ./query-plays.mjs.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

POLICY_FILE="$DIR/analyst.md"
CLAIM="${1:-$(cat "$DIR/claim.txt" 2>/dev/null || true)}"
[ -n "$CLAIM" ] || { echo "run-analyst.sh: no claim given and claim.txt is empty" >&2; exit 64; }
[ -f "$POLICY_FILE" ] || { echo "run-analyst.sh: missing policy file $POLICY_FILE" >&2; exit 66; }
[ -f "$DIR/data/plays.csv" ] || { echo "run-analyst.sh: missing data/plays.csv (run ./fetch-data.sh)" >&2; exit 66; }
for bin in claude node; do
  command -v "$bin" >/dev/null 2>&1 || { echo "run-analyst.sh: '$bin' not on PATH" >&2; exit 127; }
done

# The dictionary: an absolute path, because the file-permission rule below needs one
# (a rule with ../ in it is never matched), and because the tool reads the same variable.
export ANALYST_DICT_DIR="$(cd "${ANALYST_DICT_DIR:-$DIR/../dictionary}" 2>/dev/null && pwd)"
[ -n "$ANALYST_DICT_DIR" ] || { echo "run-analyst.sh: the dictionary folder does not exist" >&2; exit 66; }

LOG_DIR="${ANALYST_LOG_DIR:-$DIR/rulings}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
STREAM="$LOG_DIR/run-$STAMP.jsonl"        # every event the agent produced
RULING="$LOG_DIR/ruling-$STAMP.md"        # just the ruling, written by show-run.mjs
FIRST="$LOG_DIR/ruling-$STAMP-first.md"   # the first ruling, kept when it was sent back
PAGE="$LOG_DIR/run-$STAMP.html"           # the run as one page, written by show-run.mjs
BEFORE="$LOG_DIR/dictionary-$STAMP-before" # the dictionary as it was when the run started

# Memory, part one: the agent reads what it wrote. Every entry on file goes into the
# system prompt after the policy, under the heading the policy names, with today's date
# so a new entry can be dated. The agent has no Read tool; this is how it remembers.
mkdir -p "$BEFORE"
cp "$ANALYST_DICT_DIR"/*.json "$BEFORE"/ 2>/dev/null || true
dictionary_today() {
  echo "## The dictionary today"
  echo
  echo "Today is $(date +%Y-%m-%d). The dictionary folder is \`dictionary/\` (${ANALYST_DICT_DIR})."
  local n=0 f
  for f in "$ANALYST_DICT_DIR"/*.json; do
    [ -e "$f" ] || continue
    n=$((n + 1))
    echo
    echo "### $(basename "$f" .json), from \`dictionary/$(basename "$f")\`"
    echo
    echo '```json'
    cat "$f"
    echo '```'
  done
  echo
  if [ "$n" -eq 0 ]; then echo "Entries on file: none. Nothing has been defined yet."; else echo "Entries on file: $n."; fi
}
SYSTEM="$(cat "$POLICY_FILE"; echo; echo; dictionary_today)"

echo "run-analyst.sh: claim: $CLAIM"
echo "run-analyst.sh: dictionary: $ANALYST_DICT_DIR ($(ls "$ANALYST_DICT_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ') entries)"
echo "run-analyst.sh: starting $(date -Iseconds)"

# The allowlist is the security boundary and it is two lines long.
#
#   - Bash(node ./query-plays.mjs:*): the agent can run OUR tool and nothing else, with
#     any arguments. Same line as episode 1.
#   - Edit(//<dictionary>/*.json): the one thing it may write. Edit rules are the ones
#     Claude Code checks for every file-writing tool (a Write(...) rule is accepted and
#     never consulted). The path is absolute, with the // prefix that means so, because a
#     relative rule with ../ in it never matches. *.json keeps README.md out of reach.
#     Nothing else: no Read, no other folder, no network.
#
# --permission-mode default means anything NOT on this list is refused rather than
# silently escalated. In a headless run there is nobody to approve a prompt, so an
# off-list tool call shows up in the stream as REFUSED, which is what we want to see.
#
# --output-format stream-json makes `claude -p` emit each event as it happens instead of
# one block at the end. show-run.mjs turns that stream into the on-screen view and saves
# the ruling.
claude -p "$CLAIM" \
  --append-system-prompt "$SYSTEM" \
  --allowedTools "Bash(node ./query-plays.mjs:*)" "Edit(//$ANALYST_DICT_DIR/*.json)" \
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
WORDS=0
if [ -s "$RULING" ]; then
  WORDS="$(words_above_the_commands "$RULING")"
  echo "run-analyst.sh: ruling at $RULING ($WORDS words above the commands, limit $LIMIT)"
else
  echo "run-analyst.sh: WARNING, no ruling written to $RULING" >&2
  [ "$STATUS" -eq 0 ] && STATUS=65
fi

# A second pass with no tools: the ruling goes back to the model once with one request
# (shorten it, or cite the entry). Its events go on the end of the same stream, so the
# page is rebuilt from it and shows both rulings.
send_back() {
  local ask="$1"
  cp "$RULING" "$FIRST"
  claude -p "$(printf '%s\n\n%s\n' "$ask" "$(cat "$FIRST")")" \
    --append-system-prompt "$SYSTEM" \
    --tools "" \
    --permission-mode default \
    --output-format stream-json --verbose \
    2>>"$LOG_DIR/run-$STAMP.err" \
    | tee -a "$STREAM" \
    | node ./show-run.mjs "$RULING"
  RETRY_STATUS="${PIPESTATUS[2]}"
  WORDS="$(words_above_the_commands "$RULING")"
  CLAIM="$CLAIM" ANALYST_WORD_LIMIT="$LIMIT" node ./render-run.mjs "$STREAM" "$PAGE" >/dev/null
}

# Memory, part two: the ruling cites what it measured with. Every --play NAME in the
# commands it ran must be an entry on file, and the ruling's "Definition used" line must
# name it. Missing, the ruling goes back once; still missing, exit 69.
# The check reads the saved stream, not the ruling's say-so, for which entries were used.
# Only calls the tool answered count: a --play NAME the tool refused (no such entry) measured
# nothing, so there is nothing to cite.
played_entries() { node -e '
  const fs=require("fs"); const asked=new Map(); const seen=new Set();
  for (const line of fs.readFileSync(process.argv[1],"utf8").split("\n")) {
    let ev; try { ev=JSON.parse(line) } catch { continue }
    if (ev.type==="assistant") for (const p of ev.message?.content||[]) if (p.type==="tool_use" && p.name==="Bash") {
      const names=[...String(p.input?.command||"").matchAll(/--play\s+([a-z][a-z0-9-]*)/g)].map(x=>x[1]);
      if (names.length) asked.set(p.id, names);
    }
    if (ev.type==="user") for (const p of ev.message?.content||[]) if (p.type==="tool_result" && !p.is_error && asked.has(p.tool_use_id)) {
      for (const n of asked.get(p.tool_use_id)) seen.add(n);
    }
  }
  console.log([...seen].join(" "))' "$1"; }
cites_ok() {
  local ruling="$1" name
  for name in $PLAYED; do
    [ -f "$ANALYST_DICT_DIR/$name.json" ] || { echo "run-analyst.sh: the run measured with --play $name but $ANALYST_DICT_DIR/$name.json does not exist" >&2; return 1; }
    grep -q '\*\*Definition used' "$ruling" || return 1
    grep -q -- "$name" "$ruling" || return 1
  done
  return 0
}
if [ -s "$RULING" ]; then
  PLAYED="$(played_entries "$STREAM")"
  if [ -n "$PLAYED" ] && ! cites_ok "$RULING"; then
    echo "run-analyst.sh: NO CITATION: the run measured with --play $PLAYED and the ruling does not cite the entry. Sending the ruling back once: cite it."
    send_back "This ruling is yours, on the claim \"$CLAIM\". It measured with the dictionary entry $PLAYED but does not cite it. Write it again with a **Definition used:** line that names the entry, its file dictionary/$PLAYED.json, and its written date as the tool printed them: the same parts, the same numbers, the same commands, nothing new, and no tool calls. Reply with the ruling only."
    if [ "$RETRY_STATUS" -ne 0 ] || ! cites_ok "$RULING"; then
      echo "run-analyst.sh: NO CITATION after one retry. The ruling is saved; the run fails." >&2
      STATUS=69
    else
      echo "run-analyst.sh: the retry cites $PLAYED; the first ruling is at $FIRST"
    fi
  fi
fi

# The word limit, enforced the same way: one retry with no tools, then failure.
if [ -s "$RULING" ] && [ "$WORDS" -gt "$LIMIT" ] && [ "$STATUS" -ne 69 ]; then
  echo "run-analyst.sh: OVER LIMIT: $WORDS words, the policy allows $LIMIT. Sending the ruling back once: shorten it."
  send_back "This ruling is yours, on the claim \"$CLAIM\". It runs $WORDS words above the Commands run line; the policy allows $LIMIT. Write it again in under $LIMIT words above that line: the same eight parts, the same numbers, the same commands, the Definition used line kept, nothing new, and no tool calls. Reply with the ruling only."
  if [ "$RETRY_STATUS" -ne 0 ] || [ "$WORDS" -gt "$LIMIT" ]; then
    echo "run-analyst.sh: OVER LIMIT after one retry: $WORDS words above the commands, the policy allows $LIMIT. The ruling is saved; the run fails." >&2
    STATUS=68
  else
    echo "run-analyst.sh: shortened to $WORDS words above the commands, within the limit of $LIMIT; the first ruling is at $FIRST"
  fi
fi

# Memory, part three: an entry, once written, is not changed. Every entry that existed
# before the run is compared with the copy made at the start; one that changed is put
# back and the run fails with exit 70. New entries are reported. An entry the tool cannot
# use (wrong shape) is reported and the run fails with 71: a rejected entry is not a
# definition, and the next run would inherit it.
CHANGED=0
for f in "$BEFORE"/*.json; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  if ! cmp -s "$f" "$ANALYST_DICT_DIR/$name"; then
    echo "run-analyst.sh: ENTRY CHANGED: dictionary/$name was altered by this run. Restored from the copy made before the run." >&2
    cp "$f" "$ANALYST_DICT_DIR/$name"
    CHANGED=1
  fi
done
[ "$CHANGED" -eq 1 ] && STATUS=70
for f in "$ANALYST_DICT_DIR"/*.json; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .json)"
  if [ ! -e "$BEFORE/$name.json" ]; then
    if out="$(node ./query-plays.mjs --play "$name" --seasons 2021 2>&1 >/dev/null)"; then
      echo "run-analyst.sh: NEW ENTRY: dictionary/$name.json, written by this run and accepted by the tool."
    else
      echo "run-analyst.sh: NEW ENTRY REJECTED: dictionary/$name.json is not a usable entry: $(echo "$out" | head -1)" >&2
      STATUS=71
    fi
  fi
done
rm -rf "$BEFORE"

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
