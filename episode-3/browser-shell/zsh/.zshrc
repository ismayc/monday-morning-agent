# The on-air shell for the Monday Morning Agent, read by terminal.sh through
# ZDOTDIR. It loads your own shell setup first, then the two
# plugins that give the command line an IDE's highlighting: commands in
# green when they exist and red when they do not, strings in yellow, and a
# gray suggestion from history that Right Arrow accepts.
[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"

export CLICOLOR=1                      # colored ls, as Positron's terminal shows it
export TERM=xterm-256color

# the prompt: the folder in blue, then the percent sign, nothing else on air
PROMPT='%F{blue}%1~%f %# '

HISTFILE="$HOME/.zsh_history"
HISTSIZE=5000
SAVEHIST=5000
setopt SHARE_HISTORY HIST_IGNORE_DUPS

source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'   # the suggestion in gray

# Ctrl+L (and `clear`): push the prompt to the top of the box and keep every
# line above it in the scrollback, instead of wiping the screen. Output that
# piled up at the bottom is then one scroll away, and typing goes on at the top.
# It asks the terminal where the cursor is (ESC[6n), scrolls the screen up by
# that many lines (ESC[nS: the lines move into the scrollback), and homes.
# Keys typed or pasted before the terminal's reply arrives would be read with
# it and lost ("./show.sh" ran as "how.sh" in the November 8, 2026 dress
# rehearsal), so it reads one character at a time until a whole reply
# (ESC [ row ; col R) is in, and hands back whatever came before it in
# PTT_STRAY. A capital R typed early no longer ends the read too soon.
prompt-to-top() {
  local buf="" c row reply
  printf '\e[6n' > /dev/tty
  while IFS= read -s -r -k 1 -t 1 c < /dev/tty; do
    buf+=$c
    [[ $buf == *$'\e['<->';'<->R ]] && break
  done
  PTT_STRAY=${buf%%$'\e['*}
  reply=${buf#"$PTT_STRAY"}
  row=${${reply#$'\e['}%%;*}
  [[ "$row" == <1-> ]] || row=$LINES
  (( row > 1 )) && printf '\e[%dS' $((row - 1)) > /dev/tty
  printf '\e[1;1H' > /dev/tty
}
# The widget feeds the early keys back to the line editor as if typed again
# (zle -U), so a Return or another Ctrl+L among them still acts as a key, not
# as text; `clear` queues them for the next prompt.
prompt-to-top-widget() { prompt-to-top; zle reset-prompt; [[ -n $PTT_STRAY ]] && zle -U "$PTT_STRAY"; PTT_STRAY=; }
clear-to-top() { prompt-to-top; [[ -n $PTT_STRAY ]] && print -z -- "$PTT_STRAY"; PTT_STRAY=; }
zle -N prompt-to-top-widget
bindkey '^L' prompt-to-top-widget
alias clear='clear-to-top'

# syntax highlighting must be the last thing sourced
source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

cd "${MMA_SHOW_DIR:-$PWD}" 2>/dev/null
