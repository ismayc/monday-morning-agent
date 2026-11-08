# The shell in a browser tab

The on-air shell for The Monday Morning Agent, from episode 3 (November 9, 2026) on. A real `zsh`, served by [ttyd](https://github.com/tsl0922/ttyd) to one Chrome tab on this machine only, framed in a box that looks like an IDE's terminal panel.

## Why

Each episode moves between web pages and a shell many times, and every switch between applications costs the room a moment. Episodes 1 and 2 switched between Chrome and Positron. With the shell in a browser tab beside the pages, the show stays in one window, and the presenter moves between tabs the way the audience does.

## What is in this folder

| File | What it does |
|---|---|
| `terminal.sh` | Starts and stops the shell. It runs `ttyd` on `127.0.0.1:7681` and a small page server on `127.0.0.1:7682`, checks that both bound to the loopback address and refuses otherwise, then opens the tab. |
| `page/index.html` | The box. An `iframe` of the ttyd terminal with a thin bar above it: the word Shell, and the A− and A+ buttons for the text size. |
| `zsh/.zshrc` | The shell's own setup, read through `ZDOTDIR` so your everyday shell is untouched. It loads your `~/.zprofile` and `~/.zshrc` first, then the two plugins, a one-word prompt, and the Ctrl+L binding described below. It starts in `episode-3/`. |
| `test.sh` | Sixteen checks on spare ports (17681 and 17682), so a running shell is never touched. Exit 0 when every check passed or skipped. |

## Setup

macOS with Homebrew. Three packages:

```
brew install ttyd zsh-syntax-highlighting zsh-autosuggestions
```

`terminal.sh` stops with a message naming the missing one if any is absent. Nothing else is installed, and nothing is written outside this folder except two pid files and two logs in `$TMPDIR`.

## Run it

```
episode-3/browser-shell/terminal.sh             # start it and open the tab
episode-3/browser-shell/terminal.sh --no-open   # start it only
episode-3/browser-shell/terminal.sh --stop      # stop it
```

Settings, as environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `MMA_FONT` | `24` | The terminal's font size in pixels. `MMA_FONT=30` for a stage. |
| `MMA_SHOW_DIR` | `episode-3/` | The folder the shell starts in. |
| `MMA_PORT` | `7681` | The ttyd port. The page's `iframe` points at 7681, so change this only for `test.sh`. |
| `MMA_PAGE_PORT` | `7682` | The box page's port. |

A reload of the tab always gets a shell: ttyd runs with no client limit, because a limit of one refused the reload for a few seconds while the old connection lingered. Each connection is its own `zsh`.

## How it works

1. `terminal.sh` starts `ttyd -i lo0 -W -p 7681 zsh -l`, with `ZDOTDIR` set to `zsh/`, so zsh reads this folder's `.zshrc` instead of yours. The `-i lo0` flag binds the loopback interface only, and the script reads back the bound address with `lsof` and stops with exit 70 if it is anything but `127.0.0.1`.
2. It then serves `page/` with Python's `http.server`, also bound to `127.0.0.1`, and opens `http://127.0.0.1:7682/`. The page frames `http://127.0.0.1:7681/` in an `iframe`.
3. The terminal's theme is Positron's Light 2026 palette (foreground `#3B3B3B` on `#FAFAFD`, read from its workbench code), with Menlo at 24 px, so the tab reads like the IDE the earlier episodes used.
4. `.zshrc` loads `zsh-syntax-highlighting` (a command in green when it exists and red when it does not, strings in yellow) and `zsh-autosuggestions` (a gray suggestion from history that Right Arrow accepts). The prompt is the folder name in blue and a percent sign.

### Ctrl+L puts the prompt at the top

In a normal terminal, Ctrl+L wipes the screen. Here it keeps every line and moves the prompt to the top of the box: the output that piled up at the bottom is one scroll away, and typing goes on at the top. It asks the terminal where the cursor is (`ESC[6n`), scrolls the screen up by that many lines so they move into the scrollback, and homes the cursor. `clear` does the same.

Keys typed or pasted before the terminal's reply arrives would be read with it and lost (`./show.sh` once ran as `how.sh` in a rehearsal), so the function reads one character at a time until a whole reply is in and hands anything typed early back to the command line.

## Security

- Loopback only. Nothing on your network, including a tailnet, can reach either port, and the script refuses to run if either server bound anywhere else.
- No password. Anything that can reach `127.0.0.1` on this machine can type into your shell with your user's rights. Stop it with `--stop` when the show is over.
- It is not for a shared or remote machine. It was built for one laptop presenting to a screen share.

## Tests

```
episode-3/browser-shell/test.sh
```

It checks that the two scripts parse, the refusals (no `ttyd` on the PATH gives exit 69, a second start gives exit 75), that a start succeeds and `--stop` frees both ports, that the page is titled Shell and frames the terminal at `127.0.0.1:7681`, and that Ctrl+L keeps keys typed early, by driving a real `zsh` with `expect`. It needs `bash`, `zsh`, `expect`, `curl`, and `lsof` (all on macOS), plus the three packages above for the start checks. A check that cannot run says SKIP and why.
