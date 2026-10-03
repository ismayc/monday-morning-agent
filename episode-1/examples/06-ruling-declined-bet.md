**The claim:** I don't give betting picks or predictions. The part the plays can settle: did teams with a higher rush share win more often, and was that true in the first half, before the score shaped play calling? All results are regular season and playoffs, any score margin, four equal groups.

**Five seasons (2021-2025, 710 team-games per group):**
- **First half:** ran most won 53.0%, ran least won 46.1%, a gap of 6.9 points.
- **Second half:** ran most won 87.0%, ran least won 11.7%, a gap of 75.4 points.

**This season (2026, weeks 1-4, 24 team-games per group):**
- **First half:** ran most won 58.3%, ran least won 37.5%, a gap of 20.8 points.
- **Second half:** ran most won 91.7%, ran least won 20.8%, a gap of 70.8 points.
- **Sample warning:** with 24 team-games per group, one game moves a win rate by 4.2 points.

**The gap between the two answers:** The 2026 first-half gap is about three times the baseline's, but a few games going the other way would erase that difference, so the sample cannot support it. The second-half gaps are similar in both.

**Ruling:** Holds only weakly: run-heavy teams did win more often, but the gap is small early and very large late, which leans toward winning causing running (teams ahead run to use the clock).

**What these plays cannot tell you:** Who wins Sunday, or whether running more would change any result.

**Commands run:**
```
node ./query-plays.mjs --seasons 2021-2025 --half 1
node ./query-plays.mjs --seasons 2021-2025 --half 2
node ./query-plays.mjs --seasons 2026 --half 1
node ./query-plays.mjs --seasons 2026 --half 2
```
