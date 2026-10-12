**The claim:** In games tied or close at halftime (within 3 points), do teams that ran the most in the first half win clearly more often than teams that ran the least?

**Five seasons (2021-2025, regular season and playoffs):**
- First half, games within 3 points at halftime: ran most 46.3% vs ran least 55.3%, gap -9.0 points, 188 team-games per group.
- First half, all games: ran most 53.0% vs ran least 46.1%, gap 6.9 points, 710 team-games per group.
- Second half, all games: ran most 87.0% vs ran least 11.7%, gap 75.4 points, 710 team-games per group.

The pattern goes the wrong way for the claim. When the halftime score is close, the teams that ran most early won less often. The small positive gap across all first halves fits teams running more because they were already ahead. The large second-half gap is what you would expect from teams with a lead running out the clock.

**This season (2026, weeks 1-5, same filters):**
- First half, games within 3 points at halftime: ran most 45.5% vs ran least 54.5%, gap -9.1 points, 11 team-games per group.
- Second half, all games: ran most 84.2% vs ran least 15.8%, gap 68.4 points, 38 team-games per group.

The tool flagged the halftime test as a small sample. With only 11 team-games per group, a single game moves a win rate by 9.1 points, so that gap of -9.1 is the size of one game.

**The gap between the two answers:** In close games, five seasons show -9.0 and this season shows -9.1. In the second half, five seasons show 75.4 and this season shows 68.4. Both pairs point the same way, and neither gap differs by more than this season's few games can support.

**Ruling:** Does not hold. Over five seasons, in games close at halftime, the teams that ran most in the first half won less often than the teams that ran least, not more. The strong link between running and winning shows up only in the second half, where the score at that point can explain it.

**What these plays cannot tell you:** These plays can't say whether early runs set up play-action, wore down the defense, or gained yards, and they can't say whether running causes winning.

**Commands run:**
node ./query-plays.mjs --seasons 2021-2025 --half 1 --halftime-margin 3
node ./query-plays.mjs --seasons 2021-2025 --half 1
node ./query-plays.mjs --seasons 2021-2025 --half 2
node ./query-plays.mjs --seasons 2026 --half 1 --halftime-margin 3
node ./query-plays.mjs --seasons 2026 --half 2
