"""Article 1: every table for "You have to establish the run." See docs/design.md."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
MARGINS = [0, 1, 3, 7, 10, 14, 999]


def load() -> pl.DataFrame:
    p = pl.read_csv(ROOT / "data/e1_plays.csv", null_values=[""], infer_schema_length=100000).with_row_index("row")
    return p.with_columns(pl.col("qb_kneel", "qb_spike", "qb_scramble", "rush_attempt", "pass_attempt").fill_null(0))


def universe(p: pl.DataFrame) -> pl.DataFrame:
    """The tool's plays: a rush or a pass by a team, no kneel-downs or spikes."""
    return p.filter(pl.col("posteam").is_not_null(), (pl.col("rush_attempt") == 1) | (pl.col("pass_attempt") == 1),
                    pl.col("qb_kneel") != 1, pl.col("qb_spike") != 1)


def halftime(p: pl.DataFrame) -> pl.DataFrame:
    """The score at the snap of each game's first second-half play, from the home side."""
    return (p.filter(pl.col("game_half") == "Half2", pl.col("posteam").is_not_null(),
                     pl.col("score_differential").is_not_null())
            .sort("row").group_by("game_id", maintain_order=True).first()
            .with_columns(ht_home=pl.when(pl.col("posteam") == pl.col("home_team"))
                          .then(pl.col("score_differential")).otherwise(-pl.col("score_differential")))
            .select("game_id", "ht_home"))


def team_games(u: pl.DataFrame, min_plays: int = 10, called: bool = False) -> pl.DataFrame:
    """One row per team per game, in the tool's order: games and teams by first
    appearance. Drops tied and unfinished games and teams under min_plays."""
    rush = (pl.col("rush_attempt") - pl.col("qb_scramble")) if called else pl.col("rush_attempt")
    d = (u.group_by("game_id", "posteam", maintain_order=True)
         .agg(rush=rush.sum(), n=pl.len(), season=pl.col("season").first(), home=pl.col("home_team").first(),
              away=pl.col("away_team").first(), result=pl.col("result").first(), first_row=pl.col("row").min()))
    firsts = d.group_by("game_id").agg(game_row=pl.col("first_row").min())
    d = d.join(firsts, on="game_id").sort("game_row", "first_row")
    d = d.filter(pl.col("result").is_not_null(), pl.col("result") != 0, pl.col("n") >= min_plays)
    return d.with_columns(share=pl.col("rush") / pl.col("n"),
                          won=((pl.col("posteam") == pl.col("home")) == (pl.col("result") > 0)).cast(pl.Int32))


def quartile_view(tg: pl.DataFrame) -> dict:
    """The tool's cut, the Newcombe interval, and the bounds from tied shares."""
    s = tg.sort("share", descending=True, maintain_order=True)
    size = s.height // 4
    share, won = s["share"].to_numpy(), s["won"].to_numpy()
    top, bot = won[:size], won[-size:]
    d, lo, hi = lib.newcombe(int(top.sum()), size, int(bot.sum()), size)
    def range_wins(cut_value: float, sel_above: np.ndarray, sel_tied: np.ndarray, slots: int) -> tuple[int, int]:
        wins_tied, n_tied = int(sel_tied.sum()), len(sel_tied)
        base = int(sel_above.sum())
        return (base + max(0, slots - (n_tied - wins_tied)), base + min(slots, wins_tied))
    v_top, v_bot = share[size - 1], share[-size]
    a_top, t_top = won[share > v_top], won[share == v_top]
    a_bot, t_bot = won[share < v_bot], won[share == v_bot]
    t_lo, t_hi = range_wins(v_top, a_top, t_top, size - len(a_top))
    b_lo, b_hi = range_wins(v_bot, a_bot, t_bot, size - len(a_bot))
    return {"team_games": s.height, "per_group": size, "wins_most": int(top.sum()), "wins_least": int(bot.sum()),
            "rate_most": top.mean(), "rate_least": bot.mean(), "gap": d, "gap_lo": lo, "gap_hi": hi,
            "tied_at_cuts": len(t_top) + len(t_bot),
            "tie_gap_min": (t_lo - b_hi) / size, "tie_gap_max": (t_hi - b_lo) / size}


def views(p: pl.DataFrame, u: pl.DataFrame, ht: pl.DataFrame, season_max: int = 2025) -> tuple[pl.DataFrame, pl.DataFrame]:
    a = u.filter(pl.col("season") <= season_max)
    h1, h2 = a.filter(pl.col("game_half") == "Half1"), a.filter(pl.col("game_half") == "Half2")
    close = ht.filter(pl.col("ht_home").abs() <= 3)["game_id"]
    rows = []
    for name, d in [("whole game", a), ("first half", h1), ("second half", h2),
                    ("first half, within 3 at halftime", h1.filter(pl.col("game_id").is_in(close.to_list())))]:
        rows.append({"view": name} | quartile_view(team_games(d)))
    sweep = []
    for m in MARGINS:
        ids = ht.filter(pl.col("ht_home").abs() <= m)["game_id"].to_list()
        sweep.append({"margin": m} | quartile_view(team_games(h1.filter(pl.col("game_id").is_in(ids)))))
    return pl.DataFrame(rows), pl.DataFrame(sweep)


def groups_four(u: pl.DataFrame) -> pl.DataFrame:
    """All four quartile groups for the first and second half, for the figure."""
    rows = []
    a = u.filter(pl.col("season") <= 2025)
    for half, tag in [("Half1", "first half"), ("Half2", "second half")]:
        s = team_games(a.filter(pl.col("game_half") == half)).sort("share", descending=True, maintain_order=True)
        size = s.height // 4
        won = s["won"].to_numpy()
        for k in range(4):
            part = won[k * size:(k + 1) * size] if k < 2 else won[s.height - (4 - k) * size: s.height - (3 - k) * size]
            lo, hi = lib.wilson(int(part.sum()), len(part))
            rows.append({"half": tag, "group": k + 1, "n": len(part), "wins": int(part.sum()),
                         "rate": part.mean(), "lo": lo, "hi": hi})
    return pl.DataFrame(rows)


def games_table(p: pl.DataFrame) -> pl.DataFrame:
    """One row per decided game, with each side's win rate in its other games that season."""
    g = (p.group_by("game_id", maintain_order=True)
         .agg(pl.col("season", "home_team", "away_team", "result").first())
         .filter(pl.col("result").is_not_null(), pl.col("result") != 0))
    long = pl.concat([
        g.select("game_id", "season", team=pl.col("home_team"), w=(pl.col("result") > 0).cast(pl.Int32)),
        g.select("game_id", "season", team=pl.col("away_team"), w=(pl.col("result") < 0).cast(pl.Int32)),
    ])
    tot = long.group_by("season", "team").agg(wins=pl.col("w").sum(), games=pl.len())
    long = long.join(tot, on=["season", "team"]).with_columns(
        strength=pl.when(pl.col("games") > 1).then((pl.col("wins") - pl.col("w")) / (pl.col("games") - 1)))
    return (g.join(long.select("game_id", "team", s_home="strength"), left_on=["game_id", "home_team"], right_on=["game_id", "team"])
             .join(long.select("game_id", "team", s_away="strength"), left_on=["game_id", "away_team"], right_on=["game_id", "team"])
             .with_columns(y=(pl.col("result") > 0).cast(pl.Int32), d_strength=pl.col("s_home") - pl.col("s_away")))


def share_diff(tg: pl.DataFrame) -> pl.DataFrame:
    """Home share minus away share, for games where both teams clear the play minimum."""
    h = tg.filter(pl.col("posteam") == pl.col("home")).select("game_id", sh="share")
    a = tg.filter(pl.col("posteam") != pl.col("home")).select("game_id", sa="share")
    return h.join(a, on="game_id").with_columns(d_share=(pl.col("sh") - pl.col("sa")) * 10).select("game_id", "d_share")


def fit(d: pl.DataFrame, terms: list[str], sample: str, model: str) -> list[dict]:
    d = d.drop_nulls(terms).sort("game_id")
    X = np.column_stack([np.ones(d.height)] + [d[t].to_numpy().astype(float) for t in terms])
    b, se = lib.logistic(X, d["y"].to_numpy().astype(float))
    rows = []
    for i, t in enumerate(["home"] + terms):
        rows.append({"sample": sample, "model": model, "term": t, "games": d.height, "beta": float(b[i]), "se": float(se[i]),
                     "chance": lib.plogis(b[i]), "chance_lo": lib.plogis(b[i] - lib.Z * se[i]),
                     "chance_hi": lib.plogis(b[i] + lib.Z * se[i])})
    return rows


def models(p: pl.DataFrame, u: pl.DataFrame, ht: pl.DataFrame, sample: str, keep) -> list[dict]:
    p, u = p.filter(keep), u.filter(keep)
    g = games_table(p).join(ht, on="game_id", how="left")
    h1 = u.filter(pl.col("game_half") == "Half1")
    pre_ids = p.with_columns(z=pl.col("score_differential").abs().fill_null(0).cum_max().over("game_id"))
    pre = pre_ids.filter(pl.col("z") == 0, pl.col("posteam").is_not_null(),
                         (pl.col("rush_attempt") == 1) | (pl.col("pass_attempt") == 1),
                         pl.col("qb_kneel") != 1, pl.col("qb_spike") != 1)
    a = g.join(share_diff(team_games(h1)), on="game_id")
    d = g.join(share_diff(team_games(pre, min_plays=5)), on="game_id")
    ac = g.join(share_diff(team_games(h1, called=True)), on="game_id")
    dc = g.join(share_diff(team_games(pre, min_plays=5, called=True)), on="game_id")
    rows = fit(a, ["d_share"], sample, "A") + fit(a, ["d_share", "d_strength"], sample, "B")
    rows += fit(a, ["d_share", "d_strength", "ht_home"], sample, "C") + fit(d, ["d_share", "d_strength"], sample, "D")
    rows += fit(ac, ["d_share"], sample, "A called") + fit(dc, ["d_share", "d_strength"], sample, "D called")
    # Added after docs/design.md: model B on model D's games, so the move from B to D
    # can be read as a change of measure, not a change of games.
    rows += fit(a.filter(pl.col("game_id").is_in(d["game_id"].to_list())), ["d_share", "d_strength"], sample, "B on D's games")
    return rows


def within(u: pl.DataFrame, ht: pl.DataFrame, sample: str, keep) -> list[dict]:
    """In each game, did the team that ran more of its first-half plays win?"""
    tg = team_games(u.filter(keep, pl.col("game_half") == "Half1"))
    rows = []
    for label, ids in [("every game", None), ("within 3 at halftime", ht.filter(pl.col("ht_home").abs() <= 3)["game_id"].to_list())]:
        d = tg if ids is None else tg.filter(pl.col("game_id").is_in(ids))
        pair = (d.group_by("game_id").agg(hi=pl.col("share").max(), lo=pl.col("share").min(), c=pl.len(),
                                          hi_won=pl.col("won").sort_by("share").last())
                 .filter(pl.col("c") == 2, pl.col("hi") > pl.col("lo")))
        k, n = int(pair["hi_won"].sum()), pair.height
        lo, hi = lib.wilson(k, n)
        rows.append({"sample": sample, "games": label, "n": n, "wins": k, "rate": k / n, "lo": lo, "hi": hi})
    return rows


def main() -> None:
    p = load()
    u = universe(p)
    ht = halftime(p)
    v, sw = views(p, u, ht)
    v.write_csv(OUT / "e1_views.csv")
    sw.write_csv(OUT / "e1_sweep.csv")
    groups_four(u).write_csv(OUT / "e1_groups.csv")
    five, hold = pl.col("season") <= 2025, pl.col("season") == 2026
    pl.DataFrame(models(p, u, ht, "2021-2025", five) + models(p, u, ht, "2026", hold)).write_csv(OUT / "e1_models.csv")
    pl.DataFrame(within(u, ht, "2021-2025", five) + within(u, ht, "2026", hold)).write_csv(OUT / "e1_within.csv")
    a = u.filter(five)
    h1_diff = share_diff(team_games(a.filter(pl.col("game_half") == "Half1")))["d_share"].to_numpy() * 10
    pl.DataFrame([{"h1_abs_gap_median": float(np.median(np.abs(h1_diff))), "plays": a.height, "scrambles": int(a["qb_scramble"].sum()), "rushes": int(a["rush_attempt"].sum()),
                   "games": a["game_id"].n_unique(),
                   "games_2026": p.filter(hold)["game_id"].n_unique()}]).write_csv(OUT / "e1_counts.csv")
    print(v.select("view", "team_games", "per_group", "rate_most", "rate_least", "gap", "gap_lo", "gap_hi", "tied_at_cuts", "tie_gap_min", "tie_gap_max"))


if __name__ == "__main__":
    pl.Config.set_tbl_cols(20)
    pl.Config.set_tbl_width_chars(220)
    pl.Config.set_tbl_rows(60)
    main()
    print(pl.read_csv(OUT / "e1_sweep.csv").select("margin", "team_games", "per_group", "gap", "gap_lo", "gap_hi", "tie_gap_min", "tie_gap_max"))
    print(pl.read_csv(OUT / "e1_models.csv").filter(pl.col("term") != "home").select("sample", "model", "term", "games", "beta", "se", "chance", "chance_lo", "chance_hi"))
    print(pl.read_csv(OUT / "e1_within.csv"))
