**The claim:** Whether the tush push should be legal is a question about safety, fairness, and the game people want to watch, and the plays cannot settle it. I tested whether the play converts so much more often than other short-yardage rushes that it is a different kind of play. For that to hold, the defined play needs a large conversion gap over other rushes at the same distance, and the gap must survive without the team that runs it most.

**Definition used:** I wrote `tush-push` in this run, at `dictionary/tush-push.json`, "written 2026-10-26 by the analyst, episode 2", and no entry was on file before it. A search for "tush push" across 2021-2026 (265,845 descriptions, regular season and playoffs) found 0 matches, so the play has no name in the data and the entry defines it by situation.

**Five seasons:** For 2021-2025, regular season and playoffs, all teams and downs, 1 or fewer yards to go: the defined play converted 78.3% of 1,472 plays vs other short-yardage rushes 70.0% of 6,282 plays, gap 8.3 points.
The read that could prove the claim wrong drops PHI, which ran the defined play most (173 plays): 77.9% of 1,299 plays vs 70.1% of 6,134 plays, gap 7.8 points, almost unchanged.

**This season:** For 2026, weeks 1-7, with the same filters: the defined play converted 82.0% of 128 plays vs other short-yardage rushes 67.7% of 477 plays, gap 14.3 points. The tool printed no SMALL SAMPLE warning, but 128 plays is about a tenth of the five-season group, so a few conversions either way can move that rate by several points.

**The gap between the two answers:** The 2026 gap (14.3 points on 128 plays) is larger than the five-season gap (8.3 points on 1,472 plays), but seven weeks of data cannot show that the difference is more than chance.

**Ruling:** The claim does not hold in its strong form: the defined play converted 8.3 points more often than other short-yardage rushes over five seasons and 7.8 points more without PHI, which is a real edge but not a gap that makes it a different kind of play.

**What these plays cannot tell you:** They cannot show who pushed the runner or whether anyone pushed at all, so this entry counts every under-center sneak by the primary passer at 1 yard or less, and it cannot explain why the play converts.

**Commands run:**
node ./query-plays.mjs --search "tush push" --seasons 2021-2026
node ./query-plays.mjs --play tush-push --seasons 2021-2025
node ./query-plays.mjs --play tush-push --seasons 2021-2025 --by team
node ./query-plays.mjs --play tush-push --seasons 2026
node ./query-plays.mjs --play tush-push --seasons 2021-2025 --not-team PHI
