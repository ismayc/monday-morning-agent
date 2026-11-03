"""Cut the prepared files both languages read. No analysis happens here: this
script only selects rows and columns and joins sources, so the R and Python
pipelines apply every definition on their own.

Sources:
  ../episode-1/data/plays-slim.csv   committed, game results and halves
  ../episode-2/data/plays.csv        committed, downs, runners, and scrambles
  ../episode-1/data/pbp20XX.csv      local (../episode-1/fetch-data.sh), EPA and play ids
  data/ftn/ftn_charting_20XX.csv     local (tools/fetch_ftn.sh), the charted sneak flag

Output, all under the gitignored data/ folder:
  e1_plays.csv     every play through the cutoff date, in file order
  e2_short.csv     rushes with two or fewer yards to go, in file order
  e2_passers.csv   every play with a passer, in file order (who is the primary passer)
"""
from __future__ import annotations

from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT.parent
DATA = ROOT / "data"
CUTOFF = "2026-11-01"  # 2026 is a holdout, through the games of this date
NA = ["NA", ""]


def main() -> None:
    e1 = pl.read_csv(KIT / "episode-1/data/plays-slim.csv", null_values=NA, infer_schema_length=100000)
    e2 = pl.read_csv(KIT / "episode-2/data/plays.csv", null_values=NA, infer_schema_length=100000)
    print(f"plays-slim {e1.height:,} rows; plays {e2.height:,} rows")
    # The two cuts come from the same files in the same order. Prove it before joining by position.
    if e1.height != e2.height:
        raise SystemExit("the two episode files have different row counts; pull or rebuild them")
    for c in ("game_id", "posteam", "down", "rush_attempt"):
        same = (e1[c].fill_null(-1 if e1[c].dtype.is_numeric() else "") ==
                e2[c].fill_null(-1 if e2[c].dtype.is_numeric() else "")).all()
        if not same:
            raise SystemExit(f"the two episode files disagree on {c}")
    plays = e1.with_columns(e2["qb_scramble"]).filter(pl.col("game_date") <= CUTOFF)
    keep = ["season", "season_type", "game_id", "game_date", "home_team", "away_team", "posteam", "result",
            "game_half", "rush_attempt", "pass_attempt", "qb_kneel", "qb_spike", "qb_scramble",
            "score_differential"]
    plays.select(keep).write_csv(DATA / "e1_plays.csv")
    print(f"e1_plays {plays.height:,} rows, latest game {plays['game_date'].max()}")

    e2c = e2.with_columns(e1["game_date"]).filter(pl.col("game_date") <= CUTOFF).with_row_index("row")
    e2c.filter(pl.col("passer_player_id").is_not_null() | pl.col("passer_player_name").is_not_null()).with_columns(
        who=pl.col("passer_player_id").fill_null(pl.col("passer_player_name"))
    ).select("game_id", "posteam", "who").write_csv(DATA / "e2_passers.csv")

    # EPA and play ids exist only in the raw files, for the five complete seasons.
    raw = pl.concat([
        pl.read_csv(KIT / f"episode-1/data/pbp{y}.csv",
                    columns=["game_id", "posteam", "play_id", "epa", "fumble_lost"],
                    null_values=NA, infer_schema_length=100000,
                    schema_overrides={"epa": pl.Float64, "play_id": pl.Int64})
        for y in range(2021, 2026)], how="vertical_relaxed").with_row_index("row")
    five = e2c.filter(pl.col("season") <= 2025)
    if raw.height != five.height or not (raw["game_id"] == five["game_id"]).all():
        raise SystemExit("the raw seasons and the episode 2 file are not aligned")
    joined = e2c.join(raw.select("row", "play_id", "epa", "fumble_lost"), on="row", how="left")

    ftn = pl.concat([
        pl.read_csv(DATA / f"ftn/ftn_charting_{y}.csv",
                    columns=["nflverse_game_id", "nflverse_play_id", "is_qb_sneak"], null_values=NA,
                    schema_overrides={"nflverse_play_id": pl.Int64})
        for y in range(2022, 2026)]).rename({"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
    print(f"ftn {ftn.height:,} rows; duplicate keys "
          f"{ftn.height - ftn.unique(['game_id', 'play_id']).height}")
    joined = joined.join(ftn.unique(["game_id", "play_id"], keep="first"), on=["game_id", "play_id"], how="left")
    short = joined.filter(pl.col("posteam").is_not_null(), pl.col("rush_attempt") == 1,
                          pl.col("play_type") == "run", pl.col("ydstogo") <= 2).sort("row")
    short = short.with_columns(pl.col("is_qb_sneak").cast(pl.Int8),
                               rusher=pl.col("rusher_player_id").fill_null(pl.col("rusher_player_name")))
    short.select("season", "game_id", "posteam", "down", "ydstogo", "goal_to_go", "shotgun", "qb_scramble",
                 "rusher", "yards_gained", "first_down", "touchdown", "epa", "fumble_lost",
                 "is_qb_sneak").write_csv(DATA / "e2_short.csv")
    print(f"e2_short {short.height:,} rows; charted 2022-25 {short['is_qb_sneak'].is_not_null().sum():,}")


if __name__ == "__main__":
    main()
