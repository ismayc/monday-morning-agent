"""Write the numbers the two blog posts print, as formatted text read straight from
the committed tables, plus the rows for each chart. The posts template these values,
so no number in a post is typed by hand. Output: output/values_establish.json and
output/values_tush.json, which sunbirds.ai's tools/build_blog.py reads."""
from __future__ import annotations

import csv
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "output"


def rows(name: str) -> list[dict]:
    return list(csv.DictReader((OUT / f"{name}.csv").open()))


def pct(x, d=1) -> str:
    return f"{100 * float(x):.{d}f}%"


def p(x, d=1) -> str:
    """Percentage points, or a percent without its sign, with a real minus sign."""
    return f"{100 * float(x):.{d}f}".replace("-", "−")


def signed(x, d=1) -> str:
    v = 100 * float(x)
    return (f"+{v:.{d}f}" if v > 0 else f"{v:.{d}f}").replace("-", "−")


def num(x) -> str:
    return f"{int(float(x)):,}"


def f100(x) -> float:
    return round(100 * float(x), 4)


def establish() -> dict:
    v = {}
    views = {r["view"]: r for r in rows("e1_views")}
    for key, name in [("whole", "whole game"), ("h1", "first half"), ("h2", "second half"), ("ht", "first half, within 3 at halftime")]:
        r = views[name]
        v |= {f"{key}_most": pct(r["rate_most"]), f"{key}_least": pct(r["rate_least"]), f"{key}_gap": signed(r["gap"]),
              f"{key}_lo": signed(r["gap_lo"]), f"{key}_hi": signed(r["gap_hi"]), f"{key}_n": num(r["per_group"]),
              f"{key}_tied": num(r["tied_at_cuts"]), f"{key}_tie_min": signed(r["tie_gap_min"]), f"{key}_tie_max": signed(r["tie_gap_max"]),
              f"{key}_tg": num(r["team_games"])}
    for r in rows("e1_sweep"):
        m = r["margin"]
        v |= {f"sw{m}_gap": signed(r["gap"]), f"sw{m}_lo": signed(r["gap_lo"]), f"sw{m}_hi": signed(r["gap_hi"]), f"sw{m}_n": num(r["per_group"])}
    m_rows = [r for r in rows("e1_models") if r["term"] == "d_share"]
    tag = {"A": "a", "B": "b", "C": "c", "D": "d", "A called": "ac", "D called": "dc", "B on D's games": "bd"}
    for r in m_rows:
        k = ("" if r["sample"] == "2021-2025" else "y26_") + tag[r["model"]]
        v |= {f"{k}_chance": pct(r["chance"]), f"{k}_lo": pct(r["chance_lo"]), f"{k}_hi": pct(r["chance_hi"]), f"{k}_games": num(r["games"])}
    v["d_edge_max"] = p(float(next(r for r in m_rows if r["model"] == "D" and r["sample"] == "2021-2025")["chance_hi"]) - 0.5)
    for r in rows("e1_within"):
        k = ("" if r["sample"] == "2021-2025" else "y26_") + ("wg_all" if r["games"] == "every game" else "wg_ht")
        v |= {f"{k}_rate": pct(r["rate"]), f"{k}_lo": pct(r["lo"]), f"{k}_hi": pct(r["hi"]), f"{k}_n": num(r["n"]), f"{k}_wins": num(r["wins"])}
    c = rows("e1_counts")[0]
    v |= {"plays": num(c["plays"]), "scrambles": num(c["scrambles"]), "rushes": num(c["rushes"]), "games": num(c["games"]),
          "games_2026": num(c["games_2026"]), "h1_median_gap": f"{float(c['h1_abs_gap_median']):.1f}",
          "scramble_share": pct(float(c["scrambles"]) / float(c["rushes"]))}
    charts = {
        "groups": [{"label": f"{'Ran most' if g['group'] == '1' else 'Ran least' if g['group'] == '4' else 'Group ' + g['group']}, {g['half']}",
                    "est": f100(g["rate"]), "lo": f100(g["lo"]), "hi": f100(g["hi"]), "section": g["half"]} for g in rows("e1_groups")],
        "sweep": [{"label": {"0": "Tied at halftime", "999": "Every game"}.get(r["margin"], f"Within {r['margin']}"),
                   "est": f100(r["gap"]), "lo": f100(r["gap_lo"]), "hi": f100(r["gap_hi"])} for r in rows("e1_sweep")],
        "models": [{"label": lab, "est": f100(r["chance"]), "lo": f100(r["chance_lo"]), "hi": f100(r["chance_hi"])}
                   for lab, mod in [("A: first half", "A"), ("B: A plus team strength", "B"), ("C: B plus halftime score", "C"),
                                    ("B, on model D's games", "B on D's games"), ("D: before any score", "D")]
                   for r in m_rows if r["model"] == mod and r["sample"] == "2021-2025"],
    }
    return {"values": v, "charts": charts}


def tush() -> dict:
    v = {}
    rep = {r["label"]: r for r in rows("e2_reproduce")}
    for key, name in [("pub", "as published, two-point tries in"), ("pub_np", "as published, without the Eagles"),
                      ("cor", "corrected, two-point tries out"), ("cor_np", "corrected, without the Eagles"), ("phi", "corrected, the Eagles alone")]:
        r = rep[name]
        v |= {f"{key}_n1": num(r["n1"]), f"{key}_r1": pct(r["r1"]), f"{key}_n0": num(r["n0"]), f"{key}_r0": pct(r["r0"]),
              f"{key}_gap": signed(r["gap"]), f"{key}_gapu": p(r["gap"]), f"{key}_lo": signed(r["lo"]), f"{key}_hi": signed(r["hi"])}
    t = rows("e2_two_point")[0]
    v |= {"tp": num(t["two_point_tries"]), "tp_def": num(t["in_defined"]), "tp_oth": num(t["in_other"])}
    val = {r["measure"]: r for r in rows("e2_validation")}
    for key, name in [("prec", "precision: charted sneak among defined plays"), ("rec", "recall: defined play among charted sneaks"),
                      ("prec2", "precision after removing scrambles"), ("fp_sc", "defined non-sneaks that were scrambles"),
                      ("fn_oth", "missed sneaks by another runner"), ("oth_sn", "charted rate among other rushes")]:
        r = val[name]
        v |= {f"{key}": pct(r["rate"]), f"{key}_lo": pct(r["lo"]), f"{key}_hi": pct(r["hi"]), f"{key}_k": num(r["k"]), f"{key}_n": num(r["n"])}
    c = rows("e2_confusion")[0]
    v |= {"cf_all": num(c["charted_plays"]), "cf_both": num(c["both"]), "cf_def": num(c["defined_only"]), "cf_sn": num(c["sneak_only"]),
          "cf_neither": num(c["neither"]), "fp_scr_conv": pct(c["fp_scramble_conv"], 0)}
    sens = rows("e2_sensitivity")
    gaps = [float(r["gap"]) for r in sens]
    v |= {"sens_min": p(min(gaps)), "sens_max": p(max(gaps))}
    for key, r in zip(["s_entry", "s_nosc", "s_anyf", "s_two", "s_e22", "s_chart"], sens):
        v |= {f"{key}_gap": signed(r["gap"]), f"{key}_lo": signed(r["lo"]), f"{key}_hi": signed(r["hi"]), f"{key}_n1": num(r["n1"]), f"{key}_r1": pct(r["r1"]), f"{key}_r0": pct(r["r0"])}
    ad = rows("e2_adjusted")
    for key, r in zip(["adj", "adj_np", "ad_epa", "ad_yds", "ad_stf", "ad_fum"], ad):
        if key in ("ad_epa", "ad_yds"):
            s = lambda x: f"{float(x):+.2f}".replace("-", "−")
            v |= {f"{key}": s(r["theta"]), f"{key}_lo": s(r["lo"]), f"{key}_hi": s(r["hi"])}
        else:
            v |= {f"{key}": signed(r["theta"]), f"{key}_lo": signed(r["lo"]), f"{key}_hi": signed(r["hi"])}
    v |= {"adj_teams": num(ad[0]["teams"]), "adj_loo_min": signed(ad[0]["loo_min"]), "adj_loo_max": signed(ad[0]["loo_max"]),
          "adj_team_min": ad[0]["team_min"], "adj_team_max": ad[0]["team_max"]}
    cmp_rows = rows("e2_comparators")
    for key, r in zip(["c_all", "c_uc", "c_sg", "c_qb", "c_qbn"], cmp_rows):
        v |= {f"{key}_n": num(r["n0"]), f"{key}_r": pct(r["r0"]), f"{key}_gap": signed(r["gap"]), f"{key}_lo": signed(r["lo"]), f"{key}_hi": signed(r["hi"]), f"{key}_mh": signed(r["mh_gap"])}
    ts = rows("e2_team_summary")[0]
    v |= {"t_mu": signed(ts["mu"]), "t_lo": signed(ts["lo"]), "t_hi": signed(ts["hi"]), "t_tau": p(ts["tau"]), "t_q": f"{float(ts['q']):.1f}",
          "t_df": ts["df"], "t_i2": pct(ts["i2"], 0), "t_teams": ts["teams"]}
    team = rows("e2_team")
    phi = next(r for r in team if r["posteam"] == "PHI")
    v |= {"phi_raw": signed(phi["gap"]), "phi_shr": signed(phi["shrunk"]), "phi_n": num(phi["n1"])}
    be = {r["arm"]: r for r in rows("e2_beyond")}
    for arm, k in [("defined", "d"), ("other", "o")]:
        r = be[arm]
        v |= {f"{k}_epa": f"{float(r['epa']):+.2f}", f"{k}_yds": f"{float(r['yards']):.1f}", f"{k}_stf": pct(r["stuffed"]), f"{k}_fum": pct(r["fumble_lost"])}
    dn = {r["down"]: r for r in rows("e2_down")}
    late1 = sum(float(dn[d]["n1"]) for d in "34") / sum(float(dn[d]["n1"]) for d in "1234")
    late0 = sum(float(dn[d]["n0"]) for d in "34") / sum(float(dn[d]["n0"]) for d in "1234")
    v |= {"late1": pct(late1, 0), "late0": pct(late0, 0)}
    for d in "1234":
        r = dn[d]
        v |= {f"dn{d}_n1": num(r["n1"]), f"dn{d}_r1": pct(r["r1"]), f"dn{d}_n0": num(r["n0"]), f"dn{d}_r0": pct(r["r0"]), f"dn{d}_gap": signed(float(r["r1"]) - float(r["r0"]))}
    h = rows("e2_holdout")
    v |= {"h_n1": num(h[0]["n1"]), "h_r1": pct(h[0]["r1"]), "h_n0": num(h[0]["n0"]), "h_r0": pct(h[0]["r0"]), "h_gap": signed(h[0]["gap"]), "h_lo": signed(h[0]["lo"]), "h_hi": signed(h[0]["hi"]),
          "h_np_gap": signed(h[1]["gap"]), "h_phi_n": num(int(h[0]["n1"]) - int(h[1]["n1"]))}
    ha = rows("e2_holdout_adjusted")[0]
    v |= {"ha": signed(ha["theta"]), "ha_lo": signed(ha["lo"]), "ha_hi": signed(ha["hi"])}
    charts = {
        "definitions": [{"label": f"{lab}", "est": f100(r["gap"]), "lo": f100(r["lo"]), "hi": f100(r["hi"])}
                        for lab, r in zip(["The entry, 2021 to 2025", "No scrambles, either side", "Any formation", "Two yards or less",
                                           "The entry, 2022 to 2025", "FTN's charted sneak, 2022 to 2025"], sens)],
        "comparisons": [{"label": lab, "est": f100(r["gap"]), "lo": f100(r["lo"]), "hi": f100(r["hi"])}
                        for lab, r in zip(["Every other rush", "Under center, another runner", "Shotgun, another runner",
                                           "Shotgun, primary passer", "Same, without scrambles"], cmp_rows)],
        "teams": sorted([{"label": r["posteam"], "est": f100(r["gap"]), "lo": f100(float(r["gap"]) - 1.959963984540054 * float(r["se"])),
                          "hi": f100(float(r["gap"]) + 1.959963984540054 * float(r["se"])), "shrunk": f100(r["shrunk"]), "n": int(r["n1"])} for r in team],
                        key=lambda x: -x["n"]),
    }
    return {"values": v, "charts": charts}


def main() -> None:
    rec = json.loads((OUT / "reconcile.json").read_text())
    shared = {"rec_tables": str(rec["tables"]), "rec_cells": f"{rec['cells']:,}"}
    for name, build in [("establish", establish), ("tush", tush)]:
        d = build()
        d["values"] |= shared
        (OUT / f"values_{name}.json").write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
        print(f"values_{name}.json: {len(d['values'])} values, {len(d['charts'])} charts")


if __name__ == "__main__":
    main()
