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
    for f in fails:
        print(f)
    print("TOOLS", "FAILED" if fails else "PASSED: the tables match the show's tools on 6 views")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
