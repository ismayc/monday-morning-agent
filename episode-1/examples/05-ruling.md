**The claim:** If establishing the run matters, teams that run on a larger share of first-half plays should win clearly more often, and that gap should not be dwarfed by the second-half gap.

**Five seasons:** 2021-2025, regular season and playoffs, 710 team-games per group.
- First half: ran most 53.0%, ran least 46.1%, gap 6.9 points.
- Second half: ran most 87.0%, ran least 11.7%, gap 75.4 points.

**This season:** 2026, weeks 1-4, 24 team-games per group.
- First half: ran most 58.3%, ran least 37.5%, gap 20.8 points.
- Second half: ran most 91.7%, ran least 20.8%, gap 70.8 points.
- Sample warning: with 24 team-games per group, a single game moves a win rate by 4.2 points.

**The gap between the two answers:** The 2026 first-half gap is 20.8 points against 6.9 for the baseline, but that is more than four weeks can support, and the middle groups are out of order (45.8%, then 54.2%). The second-half pattern matches in both.

**Ruling:** Does not hold as stated, because the first-half association is small while the second-half one is enormous, which leans toward teams that are ahead running to use the clock, not early running producing wins.

**What these plays cannot tell you:** Whether running causes winning or winning causes running, since the tool measures only an association.

**Commands run:**
```
node ./query-plays.mjs --seasons 2021-2025 --half 1
node ./query-plays.mjs --seasons 2021-2025 --half 2
node ./query-plays.mjs --seasons 2026 --half 1
node ./query-plays.mjs --seasons 2026 --half 2
```
