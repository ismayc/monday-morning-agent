#!/bin/bash
# Download FTN's charting files through nflverse. They are CC BY-SA 4.0 ("FTN Data via
# nflverse"), so they stay out of the repo; only aggregate tables are published.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/ftn
for y in 2022 2023 2024 2025; do
  curl -fsSL -o "data/ftn/ftn_charting_$y.csv" \
    "https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_$y.csv"
done
