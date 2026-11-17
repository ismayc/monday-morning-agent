# Design: the data science articles on episodes 1 and 2

Written November 3, 2026, before any model below was fit. Before this file, I
had seen only: the published page numbers, a halftime-margin sweep of the
quartile gap, the within-game share of wins by the team that ran more, and
conversion rates by down, goal to go, and season for the episode 2 definition,
plus the cross-tab of that definition against FTN's charted sneaks. Everything
else below is specified without having seen its result.

## Shared rules

- Both languages compute every reported table from the same prepared files.
  Python and R must agree within 1e-9 (`python/04_reconcile.py`).
- Methods are deterministic: Wilson and Newcombe intervals, Newton fits for the
  logistic models, Mantel-Haenszel, and leave-one-team-out jackknife. No
  bootstrap. No betting columns, in keeping with the series' rule.
- Seasons 2021 to 2025 are the analysis set. 2026 through the games of
  November 1 is a holdout, read only after the analysis set is written.
- Numbers in the stories are bound to `output/` tables by `python/05_values.py`.

## Article 1: "You have to establish the run"

1. **Reproduce.** The tool's four views with the tool's own order, then a Wilson
   interval per group and a Newcombe interval per gap. Note that Newcombe treats
   team-games as independent; step 3 removes that assumption.
2. **Fragility.** Bounds on the gap from the tied rush shares at the quartile
   cuts, and the gap by halftime margin: 0, 1, 3, 7, 10, 14, and all games.
3. **One row per game.** Home team won, from a logistic model with the
   intercept as home advantage. Each term is home minus away.
   - Model A: first-half rush share.
   - Model B: A plus team strength, the team's win rate in its other games that
     season.
   - Model C: B plus the halftime margin. A halftime margin can be a result of
     the running, so C estimates a direct effect, not a total effect.
   - Model D, the primary test: rush share only on plays snapped before either
     team has scored, plus team strength. The scoreboard cannot have pushed
     these calls, and the model does not condition on a later score. Each team
     needs at least 5 such plays.
   - Report each share term as the win chance, at otherwise even odds, of the
     team that ran 10 points more of its plays.
4. **Measurement.** `rush_attempt` counts quarterback scrambles, which are
   called passes. Rerun models A and D with scrambles counted as passes.
5. **Holdout.** Models A and D and the within-game share on 2026.

Decision rule for the headline, set now: model D's term is the answer. If its
interval excludes 50%, running early has a detectable association. If it
contains 50%, report the largest edge the interval still allows.

## Article 2: "Ban the tush push"

1. **Reproduce.** The tool's published gap, then remove the 195 two-point tries
   the tool's filter line says are out. Report both. The corrected universe is
   the base for everything after this step.
2. **Validate the proxy.** Precision and recall against FTN's `is_qb_sneak`,
   2022 to 2025, with Wilson intervals. FTN is a human charting label for a
   sneak, not for a push, so it validates only the sneak half of the claim.
3. **Definition sensitivity.** The gap under: the entry; the entry without
   scrambles; the charted sneak (2022 to 2025); the entry and every other rush
   restricted to 2022 to 2025, so that the charted row has a fair partner.
4. **Adjustment.** Mantel-Haenszel risk difference across season by down by goal
   to go, with a leave-one-team-out jackknife interval that treats each team as
   the cluster. Also the same with Philadelphia left out.
5. **Comparison group.** The defined play against each of: other under-center
   non-quarterback rushes, shotgun non-quarterback rushes, and shotgun runs by
   the primary passer.
6. **Team differences.** Per-team gaps for teams with at least 20 defined plays,
   a DerSimonian-Laird random-effects mean, tau, and shrunken team estimates.
7. **Beyond conversion.** Mean EPA per play (MH-adjusted, same strata and
   jackknife), share of plays for no gain or a loss, and lost fumbles per play.
8. **Holdout.** The corrected gap on 2026, with the note that Jalen Hurts missed
   the Eagles' games from week 6.

Decision rule for the headline, set now: the adjusted, cluster-aware interval on
conversion is the answer. If it excludes zero, the edge is reported as a
measured association. Nothing here tests a ban, safety, or what a call would
have done in the same situation.

## Article 3: "Kickers are too good now"

Written November 17, 2026, before any table below was computed. Before this
section, I had seen only what aired: the episode 3 ruling
(`episode-3/examples/05-ruling.md`), which gives the long kick's make rate and
attempts per game by season, and its distance split (50 to 59 yards: 67.6% of
182 in 2021, 70.2% of 255 in 2025; 60 and over: 44.4% of 9, 52.2% of 23). I had
also checked that the 6,221 field goal rows have no blank kicker or distance.
Chester chose the scope on November 17: the distance adjustment and how much
change the counts can rule out. Weather, surface, kicker effects, and coaches'
decisions are out of scope for this article.

Data: `episode-3/data/plays.csv`, the file the show's tool reads, with the
tool's own universe: a field goal attempt with a result (made, missed, or
blocked; a blocked kick is a miss) and a distance, regular season and playoffs.
The long kick is the entry `long-field-goal`, 50 to 70 yards. The cluster for
every interval that needs one is the kicker (`kicker_player_name`), because one
kicker's attempts are not independent.

1. **Reproduce.** By season, 2021 to 2025: attempts, makes, and the make rate
   for the long kick and for every other attempt (18 to 49), with Wilson
   intervals, and attempts per game, games as the tool counts them. The tool
   recount (`python/06_check_tools.py`) must match these rows.
2. **What the raw counts can rule out.** The long kick's make rate in 2025
   minus 2021, with a Newcombe interval. The upper end is the largest rise the
   raw comparison allows.
3. **The mix of distances.** By season: the long kick's mean distance, and its
   attempts at 50 to 54, 55 to 59, and 60 and over.
4. **The distance adjustment, the primary test.** On long kicks, 2021 to 2025,
   a logistic model of a make on season (one indicator per season, 2021 as the
   base) and distance (linear, centered at 55 yards). Report each season's make
   chance at 55 yards, and 2025 minus 2021 at 55 yards, with a
   leave-one-kicker-out jackknife interval.
5. **Checks on the primary.**
   - The same model with season as one linear term: the change in make chance
     at 55 yards from 2021 to 2025 that the trend implies, same jackknife.
   - Without a model: a Mantel-Haenszel difference, 2025 against 2021, within
     each one-yard distance from 50 to 70, same jackknife.
   - The model on every attempt from 18 to 70, with distance and its square,
     both centered at 55: the 2025 minus 2021 difference at 55 yards.
6. **Holdout.** 2026 through the games of November 16, read after steps 1 to 5
   are written: the make chance at 55 yards from step 4's model refit with a
   2026 indicator, against 2025 and 2021.

Decision rule for the headline, set now: step 4's jackknife interval on the
2025 minus 2021 difference at 55 yards is the answer. If it excludes zero, the
distance-adjusted make chance changed, in the direction of the estimate. If it
contains zero, report the largest rise and the largest fall the interval
allows. Nothing here says why a kick was made or why a coach tried it.

## Added during the analysis, after the plan above

Each of these was added after results were visible, so read them as exploration.

- Article 1: model B on model D's games, to separate a change of measure from a
  change of games.
- Article 2: the two-yard and any-formation definition rows, and the shotgun
  primary-passer comparison with scrambles removed.
