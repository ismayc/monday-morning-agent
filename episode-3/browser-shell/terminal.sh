#!/usr/bin/env bash
# The on-air shell in a Chrome tab: ttyd serves a real zsh at
# http://127.0.0.1:7681/ on the loopback interface only (nothing on the LAN
# or the tailnet can reach it), with Positron's
# Light 2026 terminal colors and font so the tab reads like the IDE.
#
#   episode-3/browser-shell/terminal.sh            start it and open the tab (the box page on 127.0.0.1:7682, ttyd on 7681)
#   episode-3/browser-shell/terminal.sh --no-open  start it only
#   episode-3/browser-shell/terminal.sh --stop     stop it
#   MMA_FONT=30 episode-3/browser-shell/terminal.sh    a bigger font for a stage (default 24)
#
# Why: the episodes move between web pages and a shell many times, and every
# switch between applications costs the room a moment. With the shell in a
# browser tab beside the pages, the show stays in one window. It was built for
# episode 3 (November 9, 2026).
#
# Needs macOS with Homebrew: brew install ttyd zsh-syntax-highlighting zsh-autosuggestions
#
# The shell reads browser-shell/zsh/.zshrc (ZDOTDIR): your own ~/.zprofile and
# ~/.zshrc first, then the two plugins, then cd into episode-3 (MMA_SHOW_DIR
# changes the folder). Your everyday shell is untouched.
set -euo pipefail

PORT="${MMA_PORT:-7681}"            # ttyd, the terminal itself
PAGE_PORT="${MMA_PAGE_PORT:-7682}"  # the page that frames it in a box (page/index.html,
                                    # whose iframe points at 7681: change the two only for test.sh)
HERE="$(cd "$(dirname "$0")" && pwd)"
ZDOT="$HERE/zsh"
PAGE_DIR="$HERE/page"
export MMA_SHOW_DIR="${MMA_SHOW_DIR:-$(cd "$HERE/.." && pwd)}"   # the shell starts in episode-3
FONT="${MMA_FONT:-24}"
URL="http://127.0.0.1:$PAGE_PORT/"
PIDFILE="${TMPDIR:-/tmp}/ttyd-mma3.pid"
PAGE_PIDFILE="${TMPDIR:-/tmp}/ttyd-mma3-page.pid"

if [ "${1:-}" = "--stop" ]; then
  for pf in "$PIDFILE" "$PAGE_PIDFILE"; do
    if [ -f "$pf" ] && kill "$(cat "$pf")" 2>/dev/null; then echo "stopped $(basename "$pf" .pid)"; fi
    rm -f "$pf"
  done
  exit 0
fi

command -v ttyd >/dev/null || { echo "ttyd is not installed: brew install ttyd" >&2; exit 69; }
for f in /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh; do
  [ -f "$f" ] || { echo "missing $f: brew install zsh-syntax-highlighting zsh-autosuggestions" >&2; exit 69; }
done
for p in $PORT $PAGE_PORT; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then
    echo "something already listens on $p (an earlier start? $0 --stop)" >&2; exit 75
  fi
done

# Positron's Light 2026 terminal: foreground #3B3B3B on the panel's #FAFAFD,
# the light ANSI palette from its workbench code (read October 26, 2026), so the
# tab reads like the IDE the earlier episodes used.
THEME='{"background":"#FAFAFD","foreground":"#3B3B3B","cursor":"#202020","cursorAccent":"#FFFFFF","selectionBackground":"#0069CC40",
"black":"#000000","red":"#cd3131","green":"#107C10","yellow":"#949800","blue":"#0451a5","magenta":"#bc05bc","cyan":"#0598bc","white":"#555555",
"brightBlack":"#666666","brightRed":"#cd3131","brightGreen":"#14CE14","brightYellow":"#b5ba00","brightBlue":"#0451a5","brightMagenta":"#bc05bc","brightCyan":"#0598bc","brightWhite":"#a5a5a5"}'
THEME="$(printf '%s' "$THEME" | tr -d '\n')"

# No --max-clients: a reload of the tab must always get a shell (with a limit
# of 1 the old connection lingers a few seconds and the reload is refused,
# seen October 26, 2026). Each connection is its own zsh; loopback is the guard.
ZDOTDIR="$ZDOT" nohup ttyd -p "$PORT" -i lo0 -W \
  -t "fontSize=$FONT" -t "fontFamily=Menlo, Monaco, 'Courier New', monospace" \
  -t "theme=$THEME" -t cursorBlink=true -t "titleFixed=Shell" -t scrollback=2000 \
  zsh -l > "${TMPDIR:-/tmp}/ttyd-mma3.log" 2>&1 &
echo $! > "$PIDFILE"
sleep 1
kill -0 "$(cat "$PIDFILE")" 2>/dev/null || { echo "ttyd did not start:"; cat "${TMPDIR:-/tmp}/ttyd-mma3.log"; exit 1; }
bound="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN | awk 'NR>1 {print $9}')"
case "$bound" in 127.0.0.1:$PORT) ;; *) "$0" --stop; echo "refusing: ttyd bound to $bound, not 127.0.0.1" >&2; exit 70;; esac

# the box page, from the same loopback interface
nohup python3 -I -m http.server --bind 127.0.0.1 -d "$PAGE_DIR" "$PAGE_PORT" > "${TMPDIR:-/tmp}/ttyd-mma3-page.log" 2>&1 &
echo $! > "$PAGE_PIDFILE"
sleep 1
pbound="$(lsof -nP -iTCP:$PAGE_PORT -sTCP:LISTEN | awk 'NR>1 {print $9}')"
case "$pbound" in 127.0.0.1:$PAGE_PORT) ;; *) "$0" --stop; echo "refusing: the page bound to '$pbound', not 127.0.0.1" >&2; exit 70;; esac
echo "shell at $URL (ttyd on $bound, the page on $pbound, font $FONT px)"
[ "${1:-}" = "--no-open" ] || open "$URL"
