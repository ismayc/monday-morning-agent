"""Compare every Python table with its R twin: same rows and columns, and every
number within 1e-9. Exit 1 on any difference."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import polars as pl

OUT = Path(__file__).resolve().parents[1] / "output"
TOL = 1e-9


def main() -> int:
    fails, cells, tables = [], 0, 0
    for py in sorted(OUT.glob("e[12]_*.csv")):
        if py.stem.endswith("_r"):
            continue
        rf = OUT / f"{py.stem}_r.csv"
        if not rf.exists():
            fails.append(f"{py.name}: no R twin")
            continue
        a = pl.read_csv(py, infer_schema_length=None)
        b = pl.read_csv(rf, infer_schema_length=None)
        tables += 1
        if a.columns != b.columns or a.height != b.height:
            fails.append(f"{py.name}: shape {a.shape} {a.columns} against {b.shape} {b.columns}")
            continue
        for c in a.columns:
            x, y = a[c].to_list(), b[c].to_list()
            for i, (u, v) in enumerate(zip(x, y)):
                cells += 1
                if isinstance(u, (int, float)) and isinstance(v, (int, float)):
                    if abs(u - v) > TOL:
                        fails.append(f"{py.name} row {i} {c}: {u} against {v}")
                elif str(u) != str(v):
                    fails.append(f"{py.name} row {i} {c}: {u!r} against {v!r}")
    for f in fails[:40]:
        print(f)
    print(f"RECONCILE {'FAILED' if fails else 'PASSED'}: {tables} tables, {cells:,} cells, {len(fails)} differences, tolerance {TOL}")
    (OUT / "reconcile.json").write_text(json.dumps({"tables": tables, "cells": cells, "differences": len(fails), "tolerance": TOL}) + "\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
