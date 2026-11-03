"""Article 2: every table for "Ban the tush push." See docs/design.md."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
STRATA = ["season", "down", "goal_to_go"]


def load() -> pl.DataFrame:
    p = pl.read_csv(ROOT / "data/e2_passers.csv", null_values=[""]).with_row_index("row")
    primary = (p.group_by("game_id", "posteam", "who").agg(n=pl.len(), first=pl.col("row").min())
                .sort(["n", "first"], descending=[True, False]).group_by("game_id", "posteam", maintain_order=True)
                .first().select("game_id", "posteam", primary="who"))
    s = pl.read_csv(ROOT / "data/e2_short.csv", null_values=[""], infer_schema_length=20000)
    s = s.join(primary, on=["game_id", "posteam"], how="left", maintain_order="left")
    is_primary = (pl.col("rusher") == pl.col("primary")).fill_null(False)
    return s.with_columns(
        is_primary=is_primary,
        defined=is_primary & (pl.col("shotgun") == 0).fill_null(False),
        conv=((pl.col("first_down") == 1) | (pl.col("touchdown") == 1)).fill_null(False).cast(pl.Int32),
        two_point=pl.col("down").is_null(),
        stuffed=(pl.col("yards_gained") <= 0).fill_null(False).cast(pl.Int32),
        fumble_lost=pl.col("fumble_lost").fill_null(0),
        qb_scramble=pl.col("qb_scramble").fill_null(0),
        goal_to_go=pl.col("goal_to_go").fill_null(0),
    )


def gap_row(label: str, seasons: str, d: pl.DataFrame, arm: str = "defined") -> dict:
    a, b = d.filter(pl.col(arm)), d.filter(~pl.col(arm))
    k1, n1, k0, n0 = int(a["conv"].sum()), a.height, int(b["conv"].sum()), b.height
    gap, lo, hi = lib.newcombe(k1, n1, k0, n0)
    return {"label": label, "seasons": seasons, "n1": n1, "k1": k1, "r1": k1 / n1, "n0": n0, "k0": k0, "r0": k0 / n0,
            "gap": gap, "lo": lo, "hi": hi}


def mh(d: pl.DataFrame, y: str, arm: str) -> float:
    t = d.group_by(*STRATA, arm).agg(n=pl.len(), m=pl.col(y).cast(pl.Float64).mean())
    a = t.filter(pl.col(arm)).select(*STRATA, n1="n", m1="m")
    b = t.filter(~pl.col(arm)).select(*STRATA, n0="n", m0="m")
    j = a.join(b, on=STRATA).sort(*STRATA)
    return lib.mh_rd(list(zip(j["n1"].to_list(), j["m1"].to_list(), j["n0"].to_list(), j["m0"].to_list())))


def adjusted(label: str, outcome: str, d: pl.DataFrame, arm: str = "defined") -> dict:
    """MH difference across strata, with a delete-one-team jackknife around it."""
    d = d.filter(pl.col(outcome).is_not_null())
    full = mh(d, outcome, arm)
    teams = sorted(d["posteam"].unique().to_list())
    loo = [mh(d.filter(pl.col("posteam") != t), outcome, arm) for t in teams]
    se, lo, hi = lib.jackknife(full, loo)
    a = np.array(loo)
    return {"label": label, "outcome": outcome, "plays": d.height, "teams": len(teams), "theta": full, "se": se, "lo": lo, "hi": hi,
            "loo_min": float(a.min()), "team_min": teams[int(a.argmin())], "loo_max": float(a.max()), "team_max": teams[int(a.argmax())]}


def wilson_row(name: str, k: int, n: int) -> dict:
    lo, hi = lib.wilson(k, n)
    return {"measure": name, "k": k, "n": n, "rate": k / n, "lo": lo, "hi": hi}


def main() -> None:
    s = load()
    one = s.filter(pl.col("ydstogo") <= 1)
    five_all = one.filter(pl.col("season") <= 2025)
    five = five_all.filter(~pl.col("two_point"))
    not_phi = pl.col("posteam") != "PHI"

    pl.DataFrame([
        gap_row("as published, two-point tries in", "2021-2025", five_all),
        gap_row("as published, without the Eagles", "2021-2025", five_all.filter(not_phi)),
        gap_row("corrected, two-point tries out", "2021-2025", five),
        gap_row("corrected, without the Eagles", "2021-2025", five.filter(not_phi)),
        gap_row("corrected, the Eagles alone", "2021-2025", five.filter(~not_phi)),
    ]).write_csv(OUT / "e2_reproduce.csv")
    tp = five_all.filter(pl.col("two_point"))
    pl.DataFrame([{"two_point_tries": tp.height, "in_defined": tp.filter(pl.col("defined")).height,
                   "in_other": tp.filter(~pl.col("defined")).height}]).write_csv(OUT / "e2_two_point.csv")

    c = five.filter(pl.col("is_qb_sneak").is_not_null()).with_columns(sneak=pl.col("is_qb_sneak") == 1)
    both = c.filter(pl.col("defined"), pl.col("sneak")).height
    n_def, n_sneak = c.filter(pl.col("defined")).height, c.filter(pl.col("sneak")).height
    fp = c.filter(pl.col("defined"), ~pl.col("sneak"))
    fn = c.filter(~pl.col("defined"), pl.col("sneak"))
    nosc = c.filter(pl.col("qb_scramble") == 0)
    both2, def2 = nosc.filter(pl.col("defined"), pl.col("sneak")).height, nosc.filter(pl.col("defined")).height
    pl.DataFrame([
        wilson_row("precision: charted sneak among defined plays", both, n_def),
        wilson_row("recall: defined play among charted sneaks", both, n_sneak),
        wilson_row("precision after removing scrambles", both2, def2),
        wilson_row("defined non-sneaks that were scrambles", fp.filter(pl.col("qb_scramble") == 1).height, fp.height),
        wilson_row("missed sneaks by another runner", fn.filter(~pl.col("is_primary")).height, fn.height),
        wilson_row("charted rate among other rushes", n_sneak - both, c.height - n_def),
    ]).write_csv(OUT / "e2_validation.csv")
    pl.DataFrame([{"charted_plays": c.height, "both": both, "defined_only": fp.height, "sneak_only": fn.height,
                   "neither": c.height - both - fp.height - fn.height,
                   "fp_conv": fp["conv"].mean(), "fp_scramble_conv": fp.filter(pl.col("qb_scramble") == 1)["conv"].mean()}]
                 ).write_csv(OUT / "e2_confusion.csv")

    two = s.filter(pl.col("season") <= 2025, pl.col("ydstogo") <= 2, ~pl.col("two_point"))
    twen = five.filter(pl.col("season") >= 2022)
    pl.DataFrame([
        gap_row("the entry", "2021-2025", five),
        gap_row("the entry, scrambles removed from both sides", "2021-2025", five.filter(pl.col("qb_scramble") == 0)),
        gap_row("any formation, not only under center", "2021-2025", five.with_columns(defined=pl.col("is_primary"))),
        gap_row("two yards or less", "2021-2025", two),
        gap_row("the entry", "2022-2025", twen),
        gap_row("the charted sneak", "2022-2025", c, arm="sneak"),
    ]).write_csv(OUT / "e2_sensitivity.csv")

    ad = [adjusted("all teams", "conv", five), adjusted("without the Eagles", "conv", five.filter(not_phi)),
          adjusted("all teams", "epa", five), adjusted("all teams", "yards_gained", five),
          adjusted("all teams", "stuffed", five), adjusted("all teams", "fumble_lost", five)]
    pl.DataFrame(ad).write_csv(OUT / "e2_adjusted.csv")

    g = five.filter(~pl.col("defined"))
    defd = five.filter(pl.col("defined"))
    cmp_rows = []
    for name, f in [("every other rush", pl.lit(True)),
                    ("under center, another runner", (pl.col("shotgun") == 0) & ~pl.col("is_primary")),
                    ("shotgun, another runner", (pl.col("shotgun") == 1) & ~pl.col("is_primary")),
                    ("shotgun, the primary passer", (pl.col("shotgun") == 1) & pl.col("is_primary")),
                    # Added after docs/design.md: a scramble that fails is often charted as a sack,
                    # so scrambles flatter this group. This row shows how much.
                    ("shotgun, the primary passer, no scrambles", (pl.col("shotgun") == 1) & pl.col("is_primary") & (pl.col("qb_scramble") == 0))]:
        o = g.filter(f)
        row = gap_row(name, "2021-2025", pl.concat([defd, o]))
        row["mh_gap"] = mh(pl.concat([defd, o]), "conv", "defined")
        cmp_rows.append(row)
    pl.DataFrame(cmp_rows).write_csv(OUT / "e2_comparators.csv")

    t = five.group_by("posteam", "defined").agg(n=pl.len(), k=pl.col("conv").sum())
    a = t.filter(pl.col("defined")).select("posteam", n1="n", k1="k")
    b = t.filter(~pl.col("defined")).select("posteam", n0="n", k0="k")
    j = a.join(b, on="posteam").filter(pl.col("n1") >= 20).sort("posteam").with_columns(
        r1=pl.col("k1") / pl.col("n1"), r0=pl.col("k0") / pl.col("n0"))
    y = (j["r1"] - j["r0"]).to_numpy()
    v = (j["r1"] * (1 - j["r1"]) / j["n1"] + j["r0"] * (1 - j["r0"]) / j["n0"]).to_numpy()
    dl = lib.dersimonian_laird(y, v)
    j.with_columns(gap=pl.Series(y), se=pl.Series(np.sqrt(v)), shrunk=pl.Series(dl["shrunk"])).write_csv(OUT / "e2_team.csv")
    pl.DataFrame([{k: dl[k] for k in ("mu", "se", "lo", "hi", "tau", "q", "df", "i2")} | {"teams": len(y)}]).write_csv(OUT / "e2_team_summary.csv")

    pl.DataFrame([gap_row(str(yr), str(yr), five.filter(pl.col("season") == yr)) for yr in range(2021, 2026)]).write_csv(OUT / "e2_season.csv")

    pl.DataFrame([{"arm": n, "plays": d.height, "conv": d["conv"].mean(), "epa": d["epa"].mean(), "yards": d["yards_gained"].mean(),
                   "stuffed": d["stuffed"].mean(), "fumble_lost": d["fumble_lost"].mean()}
                  for n, d in [("defined", defd), ("other", g)]]).write_csv(OUT / "e2_beyond.csv")

    downs = five.group_by("down", "defined").agg(n=pl.len(), k=pl.col("conv").sum())
    pl.DataFrame([{"down": dn, "n1": a1["n"][0], "r1": a1["k"][0] / a1["n"][0], "n0": a0["n"][0], "r0": a0["k"][0] / a0["n"][0]}
                  for dn in [1, 2, 3, 4]
                  for a1 in [downs.filter(pl.col("down") == dn, pl.col("defined"))]
                  for a0 in [downs.filter(pl.col("down") == dn, ~pl.col("defined"))]]).write_csv(OUT / "e2_down.csv")

    h = one.filter(pl.col("season") == 2026, ~pl.col("two_point"))
    pl.DataFrame([gap_row("2026, all teams", "2026", h), gap_row("2026, without the Eagles", "2026", h.filter(not_phi))]).write_csv(OUT / "e2_holdout.csv")
    pl.DataFrame([adjusted("2026, all teams", "conv", h)]).write_csv(OUT / "e2_holdout_adjusted.csv")


if __name__ == "__main__":
    pl.Config.set_tbl_cols(20); pl.Config.set_tbl_width_chars(220); pl.Config.set_tbl_rows(60); pl.Config.set_fmt_str_lengths(50)
    main()
    for f in ["reproduce", "two_point", "validation", "confusion", "sensitivity", "adjusted", "comparators", "team_summary", "season", "beyond", "holdout", "holdout_adjusted"]:
        print(f); print(pl.read_csv(OUT / f"e2_{f}.csv"))
    print(pl.read_csv(OUT / "e2_team.csv").sort("n1", descending=True).select("posteam", "n1", "r1", "n0", "r0", "gap", "se", "shrunk"))
