"""Recompute the headlines another way: run the show's own tools and compare them
with this folder's tables. If the tool changes (for example, the two-point fix),
this check names the rows that moved. Exit 1 on any difference."""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT.parent
OUT = ROOT / "output"


def tool(ep: str, *args: str) -> dict:
    return json.loads(subprocess.run(["node", str(KIT / ep / "query-plays.mjs"), "--seasons", "2021-2025", *args, "--json"],
                                     capture_output=True, text=True, check=True).stdout)


def main() -> int:
    fails = []
    views = {r["view"]: r for r in csv.DictReader((OUT / "e1_views.csv").open())}
    for name, args in [("whole game", []), ("first half", ["--half", "1"]), ("second half", ["--half", "2"]),
                       ("first half, within 3 at halftime", ["--half", "1", "--halftime-margin", "3"])]:
        t = tool("episode-1", *args)
        r = views[name]
        if abs(t["gapTopMinusBottom"] - float(r["gap"])) > 1e-12 or t["result"][0]["wins"] != int(r["wins_most"]):
            fails.append(f"episode 1 {name}: tool {t['gapTopMinusBottom']} against table {r['gap']}")
    rep = {r["label"]: r for r in csv.DictReader((OUT / "e2_reproduce.csv").open())}
    # Since November 3, 2026 the tool removes two-point tries, so it matches the corrected rows.
    # The "as published" rows put them back on purpose, to reproduce what aired.
    for name, args in [("corrected, two-point tries out", []), ("corrected, without the Eagles", ["--not-team", "PHI"])]:
        t = tool("episode-2", "--play", "tush-push", *args)
        r = rep[name]
        if t["result"]["defined"]["plays"] != int(r["n1"]) or t["result"]["other"]["converted"] != int(r["k0"]):
            fails.append(f"episode 2 {name}: tool {t['result']} against table {r['n1']}, {r['k0']}")
    # Episode 3: every season row of the long-kick trend, both arms, and the games behind per game.
    seasons = {(r["season"], r["arm"]): r for r in csv.DictReader((OUT / "e3_seasons.csv").open())}
    t = tool("episode-3", "--trend", "long-field-goal")
    for row in t["rows"]:
        for arm, key in [("defined", "long"), ("other", "other")]:
            r = seasons[(row["season"], key)]
            if (row[arm]["attempts"], row[arm]["made"], row["games"]) != (int(r["attempts"]), int(r["made"]), int(r["games"])):
                fails.append(f"episode 3 {row['season']} {key}: tool {row[arm]} against table {r['attempts']}, {r['made']}")
    for f in fails:
        print(f)
    print("TOOLS", "FAILED" if fails else f"PASSED: the tables match the show's tools on 6 views and {len(t['rows'])} kick seasons")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
