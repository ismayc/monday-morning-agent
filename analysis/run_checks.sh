#!/bin/bash
# Every check in this folder: unit tests in both languages, both pipelines, the
# reconcile, a recount with the show's own tools, and the blog's values.
# PY overrides the interpreter. data/ must be prepared first (python/01_prepare.py).
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python3}
$PY -m pytest tests/test_lib.py -q
(cd tests && Rscript -e 'r <- as.data.frame(testthat::test_file("test_functions.R", reporter = "silent", stop_on_failure = TRUE)); cat(sum(r$nb), "R expectations passed\n")')
$PY -I python/02_establish.py >/dev/null
$PY -I python/03_tush.py >/dev/null
Rscript R/establish.R >/dev/null 2>&1
Rscript R/tush.R >/dev/null 2>&1
$PY -I python/04_reconcile.py
$PY -I python/06_check_tools.py
$PY -I python/05_values.py
