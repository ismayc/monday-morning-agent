"""Article 3: every table for "Kickers are too good now." See docs/design.md.

The universe is the episode 3 tool's: a field goal attempt with a result (made,
missed, or blocked; a blocked kick is a miss) and a distance. The long kick is
50 to 70 yards. Intervals that need a cluster leave out one kicker at a time."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
SEASONS = [2021, 2022, 2023, 2024, 2025]
AT = 55  # the distance every adjusted chance is read at
LONG = (50, 70)


def load() -> tuple[pl.DataFrame, dict]:
    k = pl.read_csv(ROOT / "data/e3_kicks.csv", null_values=[""])
    k = k.filter(pl.col("field_goal_result").is_in(["made", "missed", "blocked"]), pl.col("kick_distance").is_not_null())
    k = k.with_columns(made=(pl.col("field_goal_result") == "made").cast(pl.Int32),
                       long=pl.col("kick_distance").is_between(*LONG))
    games = {r["season"]: r["games"] for r in pl.read_csv(ROOT / "data/e3_games.csv").to_dicts()}
    return k, games


def seasons_table(k: pl.DataFrame, games: dict) -> pl.DataFrame:
    out = []
    for s in sorted(games):
        for arm, keep in [("long", True), ("other", False)]:
            d = k.filter(pl.col("season") == s, pl.col("long") == keep)
            n, m = d.height, int(d["made"].sum())
            lo, hi = lib.wilson(m, n)
            out.append({"season": s, "arm": arm, "attempts": n, "made": m, "rate": m / n, "lo": lo, "hi": hi,
                        "games": games[s], "per_game": n / games[s]})
    return pl.DataFrame(out)


def raw_change(k: pl.DataFrame) -> pl.DataFrame:
    a = k.filter(pl.col("long"), pl.col("season") == 2025)
    b = k.filter(pl.col("long"), pl.col("season") == 2021)
    d, lo, hi = lib.newcombe(int(a["made"].sum()), a.height, int(b["made"].sum()), b.height)
    return pl.DataFrame([{"n1": a.height, "k1": int(a["made"].sum()), "n0": b.height, "k0": int(b["made"].sum()),
                          "diff": d, "lo": lo, "hi": hi}])


def mix(k: pl.DataFrame) -> pl.DataFrame:
    out = []
    for s in SEASONS + [2026]:
        d = k.filter(pl.col("long"), pl.col("season") == s)
        row = {"season": s, "attempts": d.height, "mean_distance": float(d["kick_distance"].mean())}
        for tag, lo, hi in [("50_54", 50, 54), ("55_59", 55, 59), ("60_plus", 60, 70)]:
            b = d.filter(pl.col("kick_distance").is_between(lo, hi))
            row |= {f"n_{tag}": b.height, f"made_{tag}": int(b["made"].sum())}
        out.append(row)
    return pl.DataFrame(out)


# ---------------------------------------------------------------- models
def design_dummies(d: pl.DataFrame, seasons: list[int], quad: bool = False) -> np.ndarray:
    c = d["kick_distance"].to_numpy().astype(float) - AT
    cols = [np.ones(d.height)] + [(d["season"].to_numpy() == s).astype(float) for s in seasons[1:]] + [c]
    if quad:
        cols.append(c**2)
    return np.column_stack(cols)


def chances_dummies(d: pl.DataFrame, seasons: list[int], quad: bool = False) -> dict:
    """Make chance at AT yards for each season, from the season-indicator model."""
    b, _ = lib.logistic(design_dummies(d, seasons, quad), d["made"].to_numpy().astype(float))
    return {s: lib.plogis(b[0] + (b[i] if i else 0.0)) for i, s in enumerate(seasons)}


def trend_change(d: pl.DataFrame) -> float:
    """2025 minus 2021 at AT yards, from one linear season term."""
    X = np.column_stack([np.ones(d.height), d["season"].to_numpy().astype(float) - 2023,
                         d["kick_distance"].to_numpy().astype(float) - AT])
    b, _ = lib.logistic(X, d["made"].to_numpy().astype(float))
    return lib.plogis(b[0] + 2 * b[1]) - lib.plogis(b[0] - 2 * b[1])


def mh_change(d: pl.DataFrame) -> float:
    """2025 against 2021 within each one-yard distance."""
    t = d.filter(pl.col("season").is_in([2021, 2025])).group_by("kick_distance", "season").agg(
        n=pl.len(), m=pl.col("made").cast(pl.Float64).mean())
    rows = []
    for dist in range(LONG[0], LONG[1] + 1):
        a = t.filter(pl.col("kick_distance") == dist, pl.col("season") == 2025)
        b = t.filter(pl.col("kick_distance") == dist, pl.col("season") == 2021)
        rows.append((a["n"][0] if a.height else 0, a["m"][0] if a.height else 0.0,
                     b["n"][0] if b.height else 0, b["m"][0] if b.height else 0.0))
    return lib.mh_rd(rows)


def with_jackknife(label: str, d: pl.DataFrame, f) -> dict:
    full = f(d)
    kickers = sorted(d["kicker_player_name"].unique().to_list())
    loo = [f(d.filter(pl.col("kicker_player_name") != name)) for name in kickers]
    se, lo, hi = lib.jackknife(full, loo)
    return {"estimate": label, "theta": full, "se": se, "lo": lo, "hi": hi, "kickers": len(kickers),
            "attempts": d.height, "loo_min": min(loo), "loo_max": max(loo)}


def main() -> None:
    k, games = load()
    five = k.filter(pl.col("season").is_in(SEASONS))
    long5 = five.filter(pl.col("long"))
    seasons_table(k, games).write_csv(OUT / "e3_seasons.csv")
    raw_change(five).write_csv(OUT / "e3_raw_change.csv")
    mix(k).write_csv(OUT / "e3_mix.csv")

    # Step 4: each season's chance at 55 yards, and the headline difference.
    per = [with_jackknife(f"chance at {AT}, {s}", long5, lambda d, s=s: chances_dummies(d, SEASONS)[s]) for s in SEASONS]
    diffs = [
        with_jackknife("primary: 2025 minus 2021", long5, lambda d: (lambda c: c[2025] - c[2021])(chances_dummies(d, SEASONS))),
        with_jackknife("linear trend: 2025 minus 2021", long5, trend_change),
        with_jackknife("Mantel-Haenszel by yard: 2025 minus 2021", long5, mh_change),
        with_jackknife("every attempt, quadratic: 2025 minus 2021", five,
                       lambda d: (lambda c: c[2025] - c[2021])(chances_dummies(d, SEASONS, quad=True))),
    ]
    # Step 6: the holdout, 2026 through the games of November 16.
    s6 = SEASONS + [2026]
    long6 = k.filter(pl.col("long"), pl.col("season").is_in(s6))
    hold = [
        with_jackknife(f"holdout: chance at {AT}, 2026", long6, lambda d: chances_dummies(d, s6)[2026]),
        with_jackknife("holdout: 2026 minus 2021", long6, lambda d: (lambda c: c[2026] - c[2021])(chances_dummies(d, s6))),
        with_jackknife("holdout: 2026 minus 2025", long6, lambda d: (lambda c: c[2026] - c[2025])(chances_dummies(d, s6))),
    ]
    pl.DataFrame(per + diffs + hold).write_csv(OUT / "e3_adjusted.csv")
    print(pl.read_csv(OUT / "e3_adjusted.csv").select("estimate", "theta", "lo", "hi", "kickers"))


if __name__ == "__main__":
    main()
