- **The claim:** "Kickers are too good now," restated as a testable question: are field goals made at a higher rate, or from longer distances, in 2026 than across 2021 through 2025? ("Too good" is an opinion; the plays could only settle "better.")

- **Five seasons:** No result. My one tool measures a single thing, whether teams that run on a larger share of their plays win more often. It has no filter for field goals, kick distance, or kick outcome, so no rush-share number tests this claim, and I did not run one.

- **This season:** No result, for the same reason.

- **The gap between the two answers:** There is nothing to compare. No kicking number was produced for either period.

- **Ruling:** Cannot be settled from these plays, because the tool I reach them through reports win rate by rush share and nothing about kicking.

- **What these plays cannot tell you:** Through this tool, anything about field goal accuracy, distance, or how often teams attempt long kicks, in any season.

- **Commands run:**

```
node ./query-plays.mjs --help
```

That command was rejected (exit code 64, unknown flag). The rejection listed the known flags: `--seasons --type --weeks --half --quarter --margin --groups --min-plays --json`. None of them concern kicking.
