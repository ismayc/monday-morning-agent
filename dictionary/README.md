# The dictionary

The written definitions this show's agent measures with. One file per entry,
`NAME.json`, in a fixed shape. It started in episode 2, "Ban the tush push,"
because the play everybody argues about has no name in the play-by-play data: not
one of 260,927 play descriptions from 2021 through the 2026 season contains the
words "tush push." Before the agent could judge the play it had to say, in rules
the data can apply, what it was going to count as one. That definition is page one.

## How an entry is used

The agent's tool, `episode-2/query-plays.mjs`, only speaks this dictionary.
`--play NAME` reads `dictionary/NAME.json`, applies the rules written there, and
prints them at the top of its output, quoted, with the file's name and date. There
is no flag for a definition made up on the spot: with no entry of that name the
tool stops and prints the shape an entry takes. Every ruling that measures a play
cites the entry it used, and the runner checks that the citation is there.

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

The tool rejects an entry with a missing key, an unknown key, or a value outside
these choices, and says which. A rejected entry is not a definition.

## Entries

None yet. The first, `tush-push`, is written on air on October 26, 2026, and
committed here afterward.
