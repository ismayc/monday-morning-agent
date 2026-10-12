# The Monday Morning Agent

An agent that checks the tape. A football argument goes in; a ruling comes out, with
every filter it applied on screen.

This is the repo behind [The Monday Morning Agent](https://www.oreilly.com/live-events/the-monday-morning-agent/0642572456054/),
an eight-episode O'Reilly live series hosted by Chester Ismay. Each episode settles one
argument NFL fans cannot stop having and adds one skill to the agent. One folder per
episode.

- **The series, all eight arguments:** https://ismayc.github.io/monday-morning-agent/
- **Episode 1, the short version with no code:** https://ismayc.github.io/monday-morning-agent/episode-1/
- **The plays, row by row, and the cut from 372 columns to 18:** https://ismayc.github.io/monday-morning-agent/episode-1/plays.html
- **Change a filter yourself, nothing to install:** https://ismayc.github.io/monday-morning-agent/episode-1/explorer.html
- **How the one tool works, as a diagram:** https://ismayc.github.io/monday-morning-agent/episode-1/tool.html
- **Where we are, the episode in eight parts:** https://ismayc.github.io/monday-morning-agent/episode-1/map.html
- **Five meanings of the claim, one per keypress:** https://ismayc.github.io/monday-morning-agent/episode-1/meanings.html
- **The words the count uses (team-game, rush share, gap, and the rest):** https://ismayc.github.io/monday-morning-agent/episode-1/#terms
- **Episode 2, the short version with no code:** https://ismayc.github.io/monday-morning-agent/episode-2/
- **Change the definition of the play yourself, nothing to install:** https://ismayc.github.io/monday-morning-agent/episode-2/explorer.html
- **How episode 2's tool works, the dictionary included:** https://ismayc.github.io/monday-morning-agent/episode-2/tool.html
- **Where we are, episode 2 in eight parts:** https://ismayc.github.io/monday-morning-agent/episode-2/map.html
- **Five definitions of the tush push, one per keypress:** https://ismayc.github.io/monday-morning-agent/episode-2/definitions.html
- **Episode 2's words (the defined play, primary passer, entry, cite, and the rest):** https://ismayc.github.io/monday-morning-agent/episode-2/#terms
- **The dictionary, the definitions the agent measures with:** [`dictionary/`](dictionary/), from episode 2 on

Every page has the same strip across the top, which stays put as you scroll, and a term with a dotted underline shows its definition on hover and links to the glossary.

## Episode 1: "You have to establish the run."

One agent, one read-only data tool, every filter shown. Everything is in `episode-1/`.

```mermaid
flowchart TB
    claim["A claim<br/>'You have to establish the run.'"]
    policy["analyst.md<br/>the policy: the one thing written for this"]
    agent["The agent<br/>claude -p, allowed to run exactly one script"]
    tool["query-plays.mjs<br/>read-only: prints every filter, then the result"]
    data["data/plays-slim.csv<br/>258,000 plays, 18 of 372 columns, no betting lines"]
    ruling["One ruling<br/>five seasons, this season, the gap, the commands it ran"]
    claim --> agent
    policy --> agent
    agent -- "chooses the filters" --> tool
    tool -- "reads" --> data
    tool -- "filters and result" --> agent
    agent --> ruling
```

| File | What it is |
|---|---|
| `analyst.md` | The policy: eight sections, about 1,000 words. Who the agent is, its one tool, how to turn a claim into a question, answer it twice, show every filter, what it may not say, the shape of the ruling, the allowlist |
| `analyst-outline.md` | The same file with only its eight headings: what the episode starts from and fills in on air, and the place to start your own |
| `query-plays.mjs` | The one tool. Sorts every team's game by the share of its plays that were runs, cuts them into equal groups, and reports each group's win rate under the filters given. `node ./query-plays.mjs --help` lists the filters |
| `run-analyst.sh` | The runner: `claude -p` with your claim as the prompt, the policy as the system prompt, and a one-line allowlist. It also holds the policy's word limit: a ruling over 350 words above the commands goes back to the model once with "shorten it", and if it is still over, the run fails with an OVER LIMIT line |
| `show-run.mjs` | Turns the agent's event stream into what you see: each tool call with its filters and result as it lands, then the ruling |
| `render-run.mjs` | Writes the same run as one page, `rulings/run-<stamp>.html`: the ruling first, then each call down a clock with its filters as a funnel and its result as a table and a bar. The runner opens it when the run ends; `node ./render-run.mjs rulings/run-<stamp>.jsonl` rebuilds it for an older run |
| `season-sheet.mjs` | The answer on one page: asks the tool nine questions for a set of seasons (whole game, each half, the first half of games close at halftime, close games, the regular season, the playoffs) and writes them as one sheet with a verdict on the claim, by a rule printed on the page. `--seasons 2026` for this season, `--open` to open it, `--out` to put it anywhere. Written to `rulings/` by default, so a sheet is not public until it is published on purpose |
| `data/plays-slim.csv` | The plays: 2021 through 2025 complete, 2026 as far as it has been published |
| `slim-data.mjs`, `fetch-data.sh` | How that file is made: download the seasons from nflverse, keep 18 columns |
| `fetch-espn.mjs` | The fallback for this season: when nflverse has not yet published a game that has been played, fills it from ESPN's game summaries in the same 18 columns, and only until nflverse has it. `fetch-data.sh` runs it; `--check` only reports |
| `build-explorer-data.mjs` | Asks the tool every question the explorer page's buttons can ask and saves the answers |
| `build-plays-data.mjs` | Describes the plays file for the page that reads it: every column in the download with the kept ones and the betting lines marked, the counts, and every play of the latest week's games |
| `examples/` | A tool read (text and JSON), the policy, one run as it looked on screen, and three rulings: the episode's claim, a bet it declined, and a claim the tool cannot answer. The run and the first two rulings are from the episode on October 12, 2026 |
| `rehearse.sh` | `tool`, `claims`, `verify`, `freeze`: the rehearsal beats as subcommands |

### How `query-plays.mjs` works

It is 224 lines of JavaScript (an ES module, hence `.mjs`), run by Node.js. It imports
only what ships with Node (`node:fs`, `node:path`, `node:url`), so there is nothing to
install. It reads one file and prints; it never writes and never goes online.

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 28, "rankSpacing": 22, "padding": 4, "wrappingWidth": 240}}}%%
flowchart TB
    subgraph r1 [" "]
        direction LR
        cmd["1. Read the command<br/>check every filter;<br/>an unknown one stops it<br/>with exit code 64"]
        load["2. Load the plays<br/>data/plays-slim.csv:<br/>258,611 plays, 18 columns"]
        cmd --> load
    end
    subgraph r2 [" "]
        direction LR
        filt["3. Apply the nine filters<br/>in order, recording each<br/>with the plays left after it"]
        team["4. Add up per team per game<br/>rush share =<br/>rushes / (rushes + passes);<br/>did the team win?"]
        filt --> team
    end
    subgraph r3 [" "]
        direction LR
        grp["5. Sort by rush share, cut<br/>into equal groups: wins per<br/>group, win rate, the gap,<br/>a small-sample warning"]
        out["6. Print the filters first,<br/>then the result, as text<br/>or as JSON with --json"]
        grp --> out
    end
    r1 --> r2 --> r3
    style r1 fill:none,stroke:none
    style r2 fill:none,stroke:none
    style r3 fill:none,stroke:none
```

For `--seasons 2021-2025 --half 1`, stage 3 goes from 258,611 plays to 87,209; stage 4
finds 2,840 team-games; stage 5 cuts them into four groups of 710. The page linked above
follows that command through every stage.

### Run it

You need Node, git, and the [Claude Code CLI](https://claude.com/claude-code), signed in.
The data is in the repo.

```
git clone https://github.com/ismayc/monday-morning-agent.git
cd monday-morning-agent/episode-1

# the tool on its own: whole game, then first half only
node ./query-plays.mjs --seasons 2021-2025
node ./query-plays.mjs --seasons 2021-2025 --half 1

# the agent, with any claim about running the ball
./run-analyst.sh "You have to establish the run."
```

A run takes about 15 seconds and makes five tool calls for that claim. The ruling is
saved under `rulings/`, and the whole run opens in your browser as one page when it
ends (`ANALYST_NO_OPEN=1` writes the page without opening it). A ruling that runs over
the policy's 350 words goes back to the model once, and the page then shows both
versions. To refresh this season yourself: `./fetch-data.sh 2026`.

### What the numbers say

Five seasons, the teams that ran most against the teams that ran least:

| Filter | Ran most | Ran least | Gap |
|---|---|---|---|
| Whole game | 77.7% | 19.2% | 58.6 points |
| First half only | 53.0% | 46.1% | 6.9 points |
| Second half only | 87.0% | 11.7% | 75.4 points |
| First half, games within 3 points at halftime | 46.3% | 55.3% | -9.0 points |

Running early and running late tell two different stories, and holding the halftime
score close tells a third. Across all games, running early goes with a small edge. Hold
the halftime score within 3 points and the edge turns to -9.0: the teams that ran least
early won more. Running late goes with an enormous gap, and teams that are ahead run to
use the clock. The agent ruled on October 12, 2026 that the claim does not hold; its
ruling is in `examples/05-ruling.md`, and the evidence is on two season sheets,
[five seasons](https://ismayc.github.io/monday-morning-agent/episode-1/season-sheet-2021-2025.html)
and [this season](https://ismayc.github.io/monday-morning-agent/episode-1/season-sheet-2026.html).
One filter changes the story, which is why the tool prints every filter and the policy
makes the agent read them.

## Episode 2: "Ban the tush push."

The play nobody can stop arguing about has no name in the data: not one of 260,927
play descriptions, 2021 through the 2026 games of October 11, contains the words "tush
push." So the agent has to define the play before it can judge it. It writes the
definition into a dictionary at the root of this repo, the tool measures only by a
written entry, and every ruling cites the entry it used. Everything else is in
`episode-2/`.

```mermaid
flowchart TB
    claim["A claim<br/>'Ban the tush push.'"]
    policy["analyst.md<br/>the policy: nine sections, one new: Your dictionary"]
    agent["The agent<br/>claude -p, allowed to run one script and write one kind of file"]
    dict["dictionary/NAME.json<br/>one written definition per file; the runner<br/>appends every entry to the policy before a run"]
    tool["query-plays.mjs<br/>read-only: prints the definition, every filter, then the result"]
    data["data/plays.csv<br/>260,927 plays, 31 of 372 columns, no betting lines"]
    ruling["One ruling<br/>the entry it used, five seasons, this season, the commands it ran"]
    claim --> agent
    policy --> agent
    dict -- "fed back before every run" --> agent
    agent -- "writes a new entry, never changes one" --> dict
    agent -- "names the entry and the filters" --> tool
    tool -- "reads one entry" --> dict
    tool -- "reads" --> data
    tool -- "definition, filters, and result" --> agent
    agent --> ruling
```

| File | What it is |
|---|---|
| `analyst.md` | The policy: nine sections, about 1,400 words. Episode 1's eight plus "Your dictionary," third: search by name first, use an entry on file and never change it, write one when there is none, and cite it. The ruling has eight parts, the new one **Definition used**, under 400 words above the commands |
| `analyst-outline.md` | The nine headings and nothing else |
| `query-plays.mjs` | The one tool, 392 lines. `--search "WORDS" --seasons ...` counts the play descriptions containing the words, per season. `--play NAME --seasons ...` reads `dictionary/NAME.json`, prints it, applies the filters in order, and compares the defined play with every other rush with the same yards to go: plays, converted, rate, and the gap. With no entry of that name it stops with exit code 65 and prints the shape of one. `node ./query-plays.mjs --help` lists every flag |
| `run-analyst.sh` | The runner: `claude -p` with your claim, the policy plus the dictionary as the system prompt, and a two-line allowlist (`Bash(node ./query-plays.mjs:*)` and `Edit(//<repo>/dictionary/*.json)`). It holds the word limit as in episode 1, and adds three memory checks: the dictionary appended before the run, the citation required after it (exit 69 if still missing after one retry), and any entry that was on file and changed put back (exit 70); a new entry the tool rejects fails the run (exit 71). `ANALYST_DICT_DIR` points it at another dictionary folder |
| `show-run.mjs` | The live view: each tool call with its definition, filters, and result, each entry written shown in full, the ruling at the end |
| `render-run.mjs` | The run as one page, `rulings/run-<stamp>.html`: the ruling and the entry it cites at the top, then a search's count per season, an entry written, and each comparison with its filter funnel, its bar, and its table |
| `season-sheet.mjs` | The answer on one page: the name search, the entry quoted, nine situations as bars, by season and by team, and a verdict by a rule printed on the page. Written to `rulings/` by default |
| `data/plays.csv` | The plays: 2021 through 2025 complete, 2026 as far as it has been published, 31 columns with the play description last |
| `slim-data.mjs`, `fetch-data.sh` | How that file is made, from the raw seasons episode 1 downloads, so nothing is downloaded twice |
| `build-explorer-data.mjs` | Writes the explorer page's 54 definitions into a scratch dictionary, measures each for seven sets of seasons, and saves the answers |
| `examples/` | The search by name, the tool refusing with no entry, and the policy. The run from the episode, its rulings, and the entry the agent wrote are added after October 26, 2026 |
| `rehearse.sh` | `entry`, `tool`, `claims`, `verify`, `freeze`, `reset`: the rehearsal beats as subcommands, all writing into `rehearsal-runs/`, never into `../dictionary` |

### The dictionary

[`dictionary/`](dictionary/) holds the written definitions the agent measures with, one
JSON file per entry: a name, the day it was written, the definition in plain words,
four rules the data can apply (who carried, the yards to go, shotgun or not, the downs),
what it is compared with, and what it cannot see. The agent may add an entry and may
never change one; a different definition is a new entry with a new name. It sits at the
root, not in `episode-2/`, because every later episode that measures a play cites it.
Its [README](dictionary/README.md) gives the shape and every key. It is empty until the
first entry, `tush-push`, is written on air on October 26, 2026.

### Run it

```
cd monday-morning-agent/episode-2

# the search by name
node ./query-plays.mjs --search "tush push" --seasons 2021-2026

# a play with no entry: the tool stops and prints the shape of one
node ./query-plays.mjs --play no-such-play --seasons 2021-2025

# the agent, into a scratch dictionary so your copy of the real one stays as it is
ANALYST_DICT_DIR=$(mktemp -d) ./run-analyst.sh "Ban the tush push."
```

With an empty dictionary a run takes under a minute: it searches by name, gets the
tool's refusal, writes the entry, measures with it, and cites it. Leave out
`ANALYST_DICT_DIR` and the agent reads and writes the repo's own `dictionary/`.

### What the numbers say

The answer goes up after the episode airs on October 26, 2026, with the season sheets
for five seasons and for this season. Until then the tool's numbers for 54 definitions
of the play are on [the explorer page](https://ismayc.github.io/monday-morning-agent/episode-2/explorer.html).

## What this agent does not do

No predictions, no odds, no wagering analysis, and no fantasy advice. That is a design
decision. The public data carries betting-line columns; `slim-data.mjs` does not keep
them, so the file the agent can reach has none.

## A scheduled workflow commits to `main`

`.github/workflows/refresh-data.yml` is scheduled three times a night (GitHub starts
scheduled workflows hours late, so one slot is not enough; the file says why). It
re-downloads the seasons, rebuilds the slim file, the explorer page's answers, and the
plays page's data, and commits when the plays changed. Pull before you push.

## Data

Play-by-play data is from [nflverse](https://github.com/nflverse/nflverse-data),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The file here is a
cut of it: 18 of 372 columns, seasons 2021 through 2026. nflverse rebuilds its file
several times a day in season, so a Sunday game is normally there by Monday morning; for
the morning it is not, `fetch-espn.mjs` fills the missing games from ESPN's public game
summaries on your own machine (the committed file is nflverse only). Measured on all 16
Week 4 games of 2026: the two sources agree on a team's runs and passes within three
plays, and on rush share within 1.15 points.

The site is `docs/`: the series page at the root and one folder per episode
(`docs/episode-1/`, `docs/episode-2/`), all sharing `docs/sheet.css` and the icons. The link-preview images
and the icons are rendered from the `og-image.html` beside each image and from
`docs/apple-touch-icon.html`; each file's first
comment has the command (serve `docs/` locally first, since the preview source loads
the stylesheet and fonts).
