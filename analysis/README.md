# The data science behind episodes 1 and 2

The code and tables for two articles that go back over the show's analyses as a data
scientist would:

- [Does establishing the run win football games?](https://sunbirds.ai/blog/establish-the-run/)
- [How do you measure a play the data cannot name?](https://sunbirds.ai/blog/tush-push/)

Every table is computed separately in Python (`python/`) and in R (`R/`) from the same
prepared files, and the two must agree within 1e-9. The plan, written before the models
were fit, and what was added after results were visible, are in `docs/design.md`.

## Run it

```bash
../episode-1/fetch-data.sh                # the raw nflverse seasons (about 500 MB, not committed)
tools/fetch_ftn.sh                        # FTN's charting files (not committed)
python python/01_prepare.py               # selects rows and columns into data/ (not committed)
PY=python ./run_checks.sh                 # tests, both pipelines, reconcile, tool recount, values
```

Python needs polars, numpy, scipy, and pytest. R needs data.table and testthat.

## Files

| File | What |
|---|---|
| `python/01_prepare.py` | Joins the sources by position after proving they align. No definitions live here. |
| `python/02_establish.py`, `R/establish.R` | Article 1's tables. |
| `python/03_tush.py`, `R/tush.R` | Article 2's tables. |
| `python/lib.py`, `R/functions.R` | Wilson, Newcombe, a Newton logistic fit, Mantel-Haenszel, the jackknife, and DerSimonian-Laird. |
| `python/04_reconcile.py` | Compares every table with its R twin. |
| `python/06_check_tools.py` | Recomputes six headline views with the show's own `query-plays.mjs`. |
| `python/05_values.py` | Writes the formatted numbers and chart rows the articles print. |
| `output/` | Aggregate tables only. `*_r.csv` is the R twin. |

## Data and licenses

Play-by-play data is from [nflverse](https://github.com/nflverse/nflverse-data), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The charted sneak flag is from
FTN Data via nflverse, licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), per the
[nflreadr documentation](https://nflreadr.nflverse.com/reference/load_ftn_charting.html).
Play-level files stay out of this repo; only aggregates are published. The analysis set
is 2021 to 2025, and 2026 through the games of November 1 is a holdout. No betting column
is read.
