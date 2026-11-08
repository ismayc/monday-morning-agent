#!/usr/bin/env bash
# Tests for the on-air shell (terminal.sh, page/index.html, zsh/.zshrc).
#
#   episode-3/browser-shell/test.sh
#
# It never touches a shell that is already running: the start and stop checks
# use their own ports (MMA_PORT, MMA_PAGE_PORT; 17681 and 17682 unless set),
# their own TMPDIR for the pid files, and a temporary HOME. The Ctrl+L checks
# drive a real zsh with expect, which plays the terminal and answers the
# cursor-position question (ESC[6n) the way the browser does.
#
# Needs: bash, zsh, expect, curl, lsof (all on macOS), and for the start checks
# ttyd and the two zsh plugins (brew install ttyd zsh-syntax-highlighting
# zsh-autosuggestions). A check that cannot run says SKIP and why.
# Exit 0 when every check passed or skipped, 1 when one failed.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SHOW_DIR="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/browser-shell-test.XXXXXX")"
mkdir -p "$T/home" "$T/tmp"
TPORT="${MMA_PORT:-17681}"
TPAGE="${MMA_PAGE_PORT:-17682}"
pass=0; fail=0; skip=0
ok()   { echo "PASS  $1"; pass=$((pass + 1)); }
bad()  { echo "FAIL  $1"; [ -n "${2:-}" ] && printf '      %s\n' "$2"; fail=$((fail + 1)); }
skp()  { echo "SKIP  $1"; skip=$((skip + 1)); }
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
cleanup() {
  HOME="$T/home" TMPDIR="$T/tmp" MMA_PORT=$TPORT MMA_PAGE_PORT=$TPAGE "$HERE/terminal.sh" --stop >/dev/null 2>&1
  rm -rf "$T"
}
trap cleanup EXIT

# 1. syntax ------------------------------------------------------------------
bash -n "$HERE/terminal.sh" && ok "terminal.sh parses (bash -n)" || bad "terminal.sh does not parse"
zsh -n "$HERE/zsh/.zshrc" && ok ".zshrc parses (zsh -n)" || bad ".zshrc does not parse"

# 2. the page ----------------------------------------------------------------
page="$HERE/page/index.html"
grep -q '<title>Shell</title>' "$page" && ok "page title is Shell" || bad "page title is not Shell"
grep -q 'iframe id="term" src="http://127.0.0.1:7681/"' "$page" \
  && ok "page frames ttyd at 127.0.0.1:7681 (terminal.sh's default port)" \
  || bad "page iframe does not point at http://127.0.0.1:7681/"

# 3. a missing dependency: exit 69 -------------------------------------------
out="$(env -i HOME="$T/home" TMPDIR="$T/tmp" PATH=/usr/bin:/bin "$HERE/terminal.sh" --no-open 2>&1)"; rc=$?
[ $rc -eq 69 ] && ok "no ttyd on PATH: exit 69" || bad "no ttyd on PATH: exit $rc, expected 69" "$out"

# 4. start, refuse a second start, stop ---------------------------------------
run() { HOME="$T/home" TMPDIR="$T/tmp" MMA_PORT=$TPORT MMA_PAGE_PORT=$TPAGE MMA_SHOW_DIR="$SHOW_DIR" "$HERE/terminal.sh" "$@"; }
deps=yes
command -v ttyd >/dev/null || deps="no ttyd"
for f in /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh; do
  [ -f "$f" ] || deps="missing $f"
done
if [ "$deps" != yes ]; then
  skp "start and stop checks: $deps"
elif listening "$TPORT" || listening "$TPAGE"; then
  skp "start and stop checks: port $TPORT or $TPAGE is in use (set MMA_PORT and MMA_PAGE_PORT)"
else
  out="$(run --no-open 2>&1)"; rc=$?
  if [ $rc -ne 0 ]; then
    bad "start: exit $rc" "$out"
  else
    ok "start: exit 0"
    b1="$(lsof -nP -iTCP:$TPORT -sTCP:LISTEN | awk 'NR>1 {print $9}' | sort -u)"
    b2="$(lsof -nP -iTCP:$TPAGE -sTCP:LISTEN | awk 'NR>1 {print $9}' | sort -u)"
    [ "$b1" = "127.0.0.1:$TPORT" ] && ok "ttyd listens on 127.0.0.1 only" || bad "ttyd listens on '$b1'"
    [ "$b2" = "127.0.0.1:$TPAGE" ] && ok "the page listens on 127.0.0.1 only" || bad "the page listens on '$b2'"
    html="$(curl -s --max-time 5 "http://127.0.0.1:$TPAGE/")"
    case "$html" in *'<title>Shell</title>'*) ok "the page serves (title Shell)";; *) bad "the page did not serve";; esac
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$TPORT/")"
    [ "$code" = 200 ] && ok "ttyd answers HTTP 200" || bad "ttyd answered $code"
    out="$(run --no-open 2>&1)"; rc=$?
    [ $rc -eq 75 ] && ok "a second start: exit 75" || bad "a second start: exit $rc, expected 75" "$out"
    run --stop >/dev/null 2>&1
    sleep 1
    if listening "$TPORT" || listening "$TPAGE"; then bad "--stop left a port listening"; else ok "--stop frees both ports"; fi
  fi
fi

# 5. Ctrl+L puts the prompt at the top and keeps early keys ------------------
# expect plays the terminal: it sends Ctrl+L and more keys in one burst, waits
# for the shell to ask where the cursor is (ESC[6n), answers row 12, and checks
# that the shell scrolled 11 lines (ESC[11S), went home (ESC[1;1H), and ran
# the keys that came before the answer.
ctrl_l() {  # $1 = name, $2 = keys after Ctrl+L (Tcl string), $3 = marker the command prints
  if ! command -v expect >/dev/null; then skp "$1: no expect"; return; fi
  out="$(HOME="$T/home" ZDOTDIR="$HERE/zsh" MMA_SHOW_DIR="$SHOW_DIR" KEYS="$2" MARK="$3" expect -c '
    set timeout 8
    log_user 0
    spawn -noecho zsh -i
    expect {
      -re {episode-3[^%]*% } {}
      timeout { puts "no prompt"; exit 2 }
    }
    send -- "\x0c$env(KEYS)"
    expect {
      -ex "\033\[6n" {}
      timeout { puts "no ESC\[6n"; exit 3 }
    }
    send -- "\033\[12;1R"
    expect {
      -ex "\033\[11S" {}
      timeout { puts "no scroll by 11"; exit 4 }
    }
    expect {
      -ex "\033\[1;1H" {}
      timeout { puts "no home"; exit 5 }
    }
    if {![regexp {\r} $env(KEYS)]} { send -- "\r" }
    expect {
      -re "\n$env(MARK)\r" {}
      timeout { puts "the early keys did not run"; exit 6 }
    }
    send -- "exit\r"
    expect eof
    exit 0
  ' 2>&1)"; rc=$?
  [ $rc -eq 0 ] && ok "$1" || bad "$1 (expect exit $rc)" "$out"
}
if [ ! -f /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ] || [ ! -f /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]; then
  skp "Ctrl+L checks: the zsh plugins are not installed"
else
  ctrl_l "Ctrl+L: keys typed before the reply are kept" 'echo early$((40+2))' 'early42'
  ctrl_l "Ctrl+L: a capital R typed early does not end the read" 'echo RxR$((1+1))' 'RxR2'
  ctrl_l "Ctrl+L: a Return inside the burst still runs the line" 'echo ret$((3+4))'$'\r' 'ret7'
fi

# 6. the start folder ---------------------------------------------------------
if command -v expect >/dev/null && [ -f /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]; then
  out="$(HOME="$T/home" ZDOTDIR="$HERE/zsh" MMA_SHOW_DIR="$SHOW_DIR" expect -c '
    set timeout 8
    log_user 0
    spawn -noecho zsh -i
    expect -re {% } {} timeout { exit 2 }
    send -- "pwd\r"
    expect -re "\n(\[^\r\n\]+)\r" { puts $expect_out(1,string) } timeout { exit 3 }
    send -- "exit\r"
    expect eof
  ' 2>&1)"
  [ "$out" = "$SHOW_DIR" ] && ok "the shell starts in episode-3" || bad "the shell starts in '$out', expected $SHOW_DIR"
else
  skp "start folder: no expect or no plugins"
fi

echo
echo "$pass passed, $fail failed, $skip skipped"
[ $fail -eq 0 ]
