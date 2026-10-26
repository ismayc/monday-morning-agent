Whether the league should ban the tush push is a question of safety, fairness, and the game people want to watch, which the plays cannot settle, and a Super Bowl prediction is a forecast, which I do not make.

**The claim:** Did the defined play convert clearly more often than every other rush with two or fewer yards to go, with a gap that does not depend on one team?

**Definition used:** I used `tush-push`, from `dictionary/tush-push.json`, written 2026-10-12 "by a rehearsal, not the analyst." I found it on file and did not change it. A search for "tush push" in all 263,835 descriptions from 2021 to 2026 found 0 matches, so the play has no name in the data.

**Five seasons (2021-2025, regular season and playoffs, any down, 2 or fewer yards to go):** The defined play converted 77.2% of 1,554 plays vs other short-yardage rushes 67.2% of 9,777 plays, gap 10.0 points.
The read that could prove it wrong: I took out PHI, which ran the defined play most often in the by-team output (179 plays). Without PHI, the defined play converted 76.7% of 1,375 plays vs 67.3% of 9,477 others, gap 9.4 points. BUF ran it second most often (132 plays, a 14.8-point gap).

**This season (2026, weeks 1-7, same filters and entry):** The defined play converted 83.8% of 111 plays vs other short-yardage rushes 66.2% of 653 plays, gap 17.6 points. The tool printed no SMALL SAMPLE warning, but this season has only 111 plays of the defined play, against 1,554 in the baseline.

**The gap between the two answers:** The gaps are 10.0 points over five seasons and 17.6 points this season, and the tool did not test the difference, so seven weeks of plays do not show that the gap became larger.

**Ruling:** The claim holds only in part: over five seasons the defined play converted 10.0 points more often, and the gap stayed when PHI was removed, which is a clear advantage but not evidence of a different kind of play.

**What these plays cannot tell you:** The entry cannot see who pushed the runner or any formation detail beyond shotgun or not, so these counts do not show why the play converts or whether it is safe.

**Commands run:**
node ./query-plays.mjs --search "tush push" --seasons 2021-2026
node ./query-plays.mjs --play tush-push --seasons 2021-2025
node ./query-plays.mjs --play tush-push --seasons 2026
node ./query-plays.mjs --play tush-push --seasons 2021-2025 --by team
node ./query-plays.mjs --play tush-push --seasons 2021-2025 --not-team PHI
