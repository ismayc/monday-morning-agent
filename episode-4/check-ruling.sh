#!/usr/bin/env bash
# check-ruling.sh: the fact-checker, episode 4's second agent. A second `claude -p` with its
# own policy (checker.md) and a one-line allowlist, which reads the analyst's ruling with
# only the tool's printouts in hand and says whether it stands.
#
#   ./check-ruling.sh <run.jsonl> <ruling.md> "<claim>" <check.md>
#
# The packet the checker reads is built here from the analyst's saved event stream: the
# claim, the ruling as written, every tool printout (the text the tool returned for each
# Bash call, exactly as it came back), and every file the run wrote (the content of each
# Edit or Write). Never the analyst's own text between its tool calls, and never its
# instructions: the two agents share a tool and nothing else. The checker may rerun the
# tool; its own event stream lands beside the check (<check>.jsonl), and show-run.mjs prints
# it as it happens, the way it prints the analyst's run.
#
# Exit codes: 0 CONFIRMED or CONFIRMED WITH A NOTE; 74 REJECTED; 65 the check names no
# verdict (the stream ended without one, or the words are missing); 64 to 66 setup.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 66
STREAM="${1:-}"; RULING="${2:-}"; CLAIM="${3:-}"; OUT="${4:-}"
[ -s "$STREAM" ] && [ -s "$RULING" ] && [ -n "$CLAIM" ] && [ -n "$OUT" ] || { echo "usage: $0 <run.jsonl> <ruling.md> \"<claim>\" <check.md>" >&2; exit 64; }
[ -f "$DIR/checker.md" ] || { echo "check-ruling.sh: missing checker.md" >&2; exit 66; }
PACKET="${OUT%.md}-packet.md"
CSTREAM="${OUT%.md}.jsonl"

# The packet: the claim, the ruling, the printouts, the files written. Printouts the tool
# refused are included and marked, because a refusal is something the ruling should not
# have papered over.
node -e '
const fs = require("fs")
const [stream, ruling, claim] = process.argv.slice(1)
const asked = new Map(), printouts = [], files = []
for (const line of fs.readFileSync(stream, "utf8").split("\n")) {
  let ev; try { ev = JSON.parse(line) } catch { continue }
  if (ev.type === "assistant") for (const p of ev.message?.content || []) if (p.type === "tool_use") asked.set(p.id, p)
  if (ev.type === "user") for (const p of ev.message?.content || []) {
    if (p.type !== "tool_result") continue
    const u = asked.get(p.tool_use_id); if (!u) continue
    const body = Array.isArray(p.content) ? p.content.map(c => c.text || "").join("\n") : String(p.content ?? "")
    if (u.name === "Bash") printouts.push(`### Printout ${printouts.length + 1}: \`${u.input?.command || ""}\`${p.is_error ? "  (THE TOOL REFUSED OR FAILED)" : ""}\n\n\`\`\`\n${body.trim()}\n\`\`\``)
    else if ((u.name === "Write" || u.name === "Edit") && !p.is_error) files.push(`### File written: \`${u.input?.file_path || ""}\`\n\n\`\`\`json\n${String(u.input?.content || u.input?.new_string || "").trim()}\n\`\`\``)
  }
}
const out = [
  `## The claim\n\n${claim}`,
  `## The ruling, as written\n\n${fs.readFileSync(ruling, "utf8").trim()}`,
  `## The printouts, exactly as the tool printed them (${printouts.length})\n\n${printouts.join("\n\n") || "None: the run made no tool call."}`,
  `## The files the run wrote (${files.length})\n\n${files.join("\n\n") || "None."}`,
]
process.stdout.write(out.join("\n\n") + "\n")' "$STREAM" "$RULING" "$CLAIM" >"$PACKET" || exit 65

echo "check-ruling.sh: the fact-checker reads the ruling ($(grep -c '^### Printout' "$PACKET") printouts, $(grep -c '^### File written' "$PACKET") files written)"
echo "check-ruling.sh: starting $(date -Iseconds)"

# The allowlist is one line: the tool, read-only. No Edit, no Read, no other command.
claude -p "$(cat "$PACKET")" \
  --append-system-prompt "$(cat "$DIR/checker.md")" \
  --allowedTools "Bash(node ./query-plays.mjs:*)" \
  --permission-mode default \
  --output-format stream-json --verbose \
  2>"${OUT%.md}.err" \
  | tee "$CSTREAM" \
  | node ./show-run.mjs "$OUT"
STATUS="${PIPESTATUS[2]}"
echo "check-ruling.sh: finished $(date -Iseconds) with status $STATUS"

[ -s "$OUT" ] || { echo "check-ruling.sh: NO CHECK: the checker's stream ended without a check." >&2; exit 65; }
WORDS="$(sed '/\*\*Commands run/,$d' "$OUT" | wc -w | tr -d ' ')"
VERDICT="$(grep -m1 -E '\*\*Verdict:?\*\*' "$OUT" | grep -oE 'CONFIRMED WITH A NOTE|CONFIRMED|REJECTED' | head -1)"
echo "check-ruling.sh: check at $OUT ($WORDS words above the commands, limit 300)"
case "$VERDICT" in
  REJECTED) echo "check-ruling.sh: verdict REJECTED"; exit 74 ;;
  "CONFIRMED WITH A NOTE"|CONFIRMED) echo "check-ruling.sh: verdict $VERDICT"; exit 0 ;;
  *) echo "check-ruling.sh: NO VERDICT: the check names none of CONFIRMED, CONFIRMED WITH A NOTE, REJECTED." >&2; exit 65 ;;
esac
