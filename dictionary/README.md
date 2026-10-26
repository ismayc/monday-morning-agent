# The dictionary

The written definitions this show's agent measures with. One file per entry,
`NAME.json`, in a fixed shape. It started in episode 2, "Ban the tush push,"
because the play everybody argues about has no name in the play-by-play data: not
one of 260,927 play descriptions from 2021 through the 2026 season contains the
words "tush push." Before the agent could judge the play it had to say, in rules
the data can apply, what it was going to count as one. That definition is page one.

## How an entry is used

The agent's tool (`episode-2/query-plays.mjs`, and from episode 3 on
`episode-3/query-plays.mjs`) only speaks this dictionary. `--play NAME` or
`--trend NAME` reads `dictionary/NAME.json`, applies the rules written there, and
prints them at the top of its output, quoted, with the file's name and date. There
is no flag for a definition made up on the spot: with no entry of that name the
tool stops and prints the shape an entry takes. Every ruling that measures a play
cites the entry it used, and the runner checks that the citation is there.

An entry is one of two shapes. A **rush** (episode 2's shape, below) is measured
with `--play`: how often the defined play converted against every other rush with
the same yards to go. A **kick** (added for episode 3, "Kickers are too good now")
is measured with `--trend`: season by season, how often the defined field goal was
made against every other field goal attempt, and how often it was tried per game. An
entry with no `kind` is a rush, so episode 2's entry did not change.

## How an entry is made

The agent writes it, during a run, with a file-writing permission scoped to this
folder and to `.json` files in it (`Edit(//<repo>/dictionary/*.json)` on the
runner's allowlist). It may write a new entry. It may not change one that exists:
a different definition is a new entry with a new name, and the runner restores any
existing entry a run altered and fails the run. Entries written on air are committed
after the episode; a rehearsal writes into a scratch copy of this folder
(`ANALYST_DICT_DIR`), so nothing here is a rehearsal.

## The shape

```json
{
  "name": "tush-push",
  "written": "2026-10-26",
  "by": "the analyst, episode 2",
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
```

| Key | What it is |
|---|---|
| `name` | The file is `dictionary/<name>.json`. Lowercase letters, digits, and hyphens. |
| `written` | The day it was written, `YYYY-MM-DD`. The tool prints it with every result. |
| `by` | Who wrote it. Optional. |
| `plainWords` | The definition in one sentence a fan would accept. The tool prints it. |
| `rules.rusher` | `"primary-passer"`: the runner is the player with the most pass attempts for that team in that game, which is how the data says "the quarterback" without a position column. Or `"any"`. |
| `rules.yardsToGoMax` | The play is a short-yardage play: this many yards to go or fewer. 1 to 10. The comparison group is every other rush with the same yards to go. |
| `rules.formation` | `"under-center"` (the shotgun column is 0), `"shotgun"`, or `"any"`. Shotgun or not is the only formation detail the data carries. |
| `rules.downs` | `"any"`, or a list such as `[3, 4]`. |
| `comparedWith` | What the defined play is measured against, in words. |
| `cannotSee` | What the fan's meaning includes that these rules cannot see. Optional, and worth writing. |

### The kick shape

```json
{
  "name": "long-field-goal",
  "kind": "kick",
  "written": "2026-11-09",
  "by": "the analyst, episode 3",
  "plainWords": "A field goal attempt from 50 yards or more.",
  "rules": {
    "distanceMin": 50,
    "distanceMax": 70
  },
  "comparedWith": "every other field goal attempt",
  "cannotSee": "the wind, the surface, or whether a timeout was called to ice the kicker"
}
```

| Key | What it is |
|---|---|
| `kind` | `"kick"`. Left out, the entry is a rush and takes the rush rules above. |
| `rules.distanceMin`, `rules.distanceMax` | The kick's distance in yards, from the first to the second, both included. Whole numbers from 18 to 70. A field goal attempt with a result (made, missed, or blocked; a blocked kick is a miss) and a distance on file is a kick. |
| `comparedWith` | What the defined kick is measured against: every field goal attempt outside its distances. An entry that covers every distance has an empty comparison group, and says so. |

The tool rejects an entry with a missing key, an unknown key, or a value outside
these choices, and says which. A rejected entry is not a definition.

## Entries

| Entry | Written | Plain words |
|---|---|---|
| [`tush-push`](tush-push.json) | 2026-10-26, by the analyst, episode 2, on air | The quarterback takes the snap under center with one yard or less to go and runs straight ahead, with teammates pushing him from behind. In these plays it is any run by the team's primary passer, not from shotgun, with one yard or less to go, on any down. |
| [`field-goal`](field-goal.json) | 2026-10-26, by Chester, before episode 3 | Any field goal attempt, from the shortest on file to the longest (18 to 70 yards). The first kick entry, page one of the kick shape, so the trend of every kick can be read by hand before the agent writes its own entry on air. |

The entry is committed exactly as the agent wrote it on air on October 26, 2026,
in the run `episode-2/examples/04-run-on-screen.txt` shows. Three rehearsal runs
had chosen two or fewer yards to go; the agent on air chose one yard or less, and
that is the definition every later ruling cites. A different definition is a new
entry with a new name.
