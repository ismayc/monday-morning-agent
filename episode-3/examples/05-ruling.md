**The claim:** Whether kickers are "too good" is a judgment about the game people want to watch, and the plays cannot settle it. The question I tested is whether kickers make more of their long field goals now than they did in 2021, so much more that the long kick is a different play; for that to hold, the long kick's make rate would have to climb season by season, at every distance, and not only because the attempts changed.

**Definition used:** The entry is long-field-goal, from dictionary/long-field-goal.json, written 2026-11-09 by the analyst, episode 3, and I wrote it in this run because the field-goal entry on file puts every attempt in the defined group with nothing to compare against. The search for "field goal" across 2021 through 2026 found 6,379 descriptions, between 1,116 and 1,205 per complete season and 588 so far in 2026, so the play has its name in the data.

**Chart:** The spec is charts/long-field-goal-trend.json, written 2026-11-09, and the chart shows the long kick's make rate holding between 66.5% and 69.7% over 2021 through 2025 while attempts per game climb from 0.67 to 0.98, with 2026 in gray at 67.3% and 1.11 per game.

**Five seasons:** The defined kick 66.5% of 191 attempts in 2021 and 68.7% of 278 in 2025, tried 0.67 and 0.98 times per game, with the other kicks (18 to 49 yards) at 89.4% of 885 and 91.1% of 862. The distance split (--bands) was my check against a rate that only looks like a trend: kicks of 50 to 59 yards went 67.6% of 182 in 2021 and 70.2% of 255 in 2025, and kicks of 60 and over went 44.4% of 9 and 52.2% of 23, groups too small to carry a trend, so no band moved in one direction.

**This season:** The defined kick 67.3% of 150 attempts in 2026, tried 1.11 times per game, with the other kicks at 90.5% of 420. The tool marks 2026 in progress, weeks 1 through 9 with the latest game on 2026-11-08, so this row is a partial season and its per-game count can still move.

**The gap between the two answers:** The 2026 make rate sits inside the five-season range of 66.5% to 69.7%, and the only number outside that range is attempts per game, 1.11 against a high of 1.01, which a partial season cannot support as a change.

**Ruling:** The claim does not hold in these plays: the long kick was made at about the same rate in every season on file, and what rose is how often coaches tried it, not how often it went in.

**What these plays cannot tell you:** They cannot say why a kick was made or missed or why a coach chose to try, because the data does not see the wind, the surface, the snap and hold, an icing timeout, or the long kicks that were never attempted.

**Commands run:**
node ./query-plays.mjs --search "field goal" --seasons 2021-2026
node ./query-plays.mjs --trend long-field-goal --seasons 2021-2026
node ./query-plays.mjs --trend long-field-goal --seasons 2021-2026
node ./query-plays.mjs --trend long-field-goal --seasons 2021-2026 --bands
node ../charts/render-chart.mjs
node ../charts/render-chart.mjs ../charts/long-field-goal-trend.json
