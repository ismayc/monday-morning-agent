# Article 3 in R: the same tables as python/07_kick.py, from the same prepared files.
# Run from the analysis folder: Rscript R/kick.R
source("R/functions.R")
library(data.table)
SEASONS <- 2021:2025
AT <- 55
LONG <- c(50, 70)

k <- fread("data/e3_kicks.csv", na.strings = "")
k <- k[field_goal_result %in% c("made", "missed", "blocked") & !is.na(kick_distance)]
k[, made := as.integer(field_goal_result == "made")]
k[, long := kick_distance >= LONG[1] & kick_distance <= LONG[2]]
games <- fread("data/e3_games.csv")

seasons_tab <- rbindlist(lapply(sort(games$season), function(s) rbindlist(lapply(c("long", "other"), function(arm) {
  d <- k[season == s & long == (arm == "long")]
  n <- nrow(d); m <- sum(d$made); w <- wilson(m, n); g <- games[season == s, games]
  data.table(season = s, arm = arm, attempts = n, made = m, rate = m / n, lo = w[1], hi = w[2], games = g, per_game = n / g)
}))))
write_out(seasons_tab, "output/e3_seasons_r.csv")

five <- k[season %in% SEASONS]
long5 <- five[long == TRUE]
a <- long5[season == 2025]; b <- long5[season == 2021]
nc <- newcombe(sum(a$made), nrow(a), sum(b$made), nrow(b))
write_out(data.table(n1 = nrow(a), k1 = sum(a$made), n0 = nrow(b), k0 = sum(b$made), diff = nc[1], lo = nc[2], hi = nc[3]),
          "output/e3_raw_change_r.csv")

mix <- rbindlist(lapply(c(SEASONS, 2026), function(s) {
  d <- k[long == TRUE & season == s]
  row <- data.table(season = s, attempts = nrow(d), mean_distance = mean(d$kick_distance))
  for (band in list(c("50_54", 50, 54), c("55_59", 55, 59), c("60_plus", 60, 70))) {
    x <- d[kick_distance >= as.numeric(band[2]) & kick_distance <= as.numeric(band[3])]
    row[[paste0("n_", band[1])]] <- nrow(x)
    row[[paste0("made_", band[1])]] <- sum(x$made)
  }
  row
}))
write_out(mix, "output/e3_mix_r.csv")

# ---------------------------------------------------------------- models
chances_dummies <- function(d, seasons, quad = FALSE) {
  cc <- d$kick_distance - AT
  X <- cbind(1, sapply(seasons[-1], function(s) as.numeric(d$season == s)), cc)
  if (quad) X <- cbind(X, cc^2)
  b <- logistic_fit(X, as.numeric(d$made))$b
  setNames(plogis(b[1] + c(0, b[2:length(seasons)])), seasons)
}
trend_change <- function(d) {
  X <- cbind(1, d$season - 2023, d$kick_distance - AT)
  b <- logistic_fit(X, as.numeric(d$made))$b
  plogis(b[1] + 2 * b[2]) - plogis(b[1] - 2 * b[2])
}
mh_change <- function(d) {
  t <- d[season %in% c(2021, 2025), .(n = .N, m = mean(made)), by = .(kick_distance, season)]
  dists <- LONG[1]:LONG[2]
  get <- function(s, col) sapply(dists, function(x) { v <- t[kick_distance == x & season == s][[col]]; if (length(v)) v else 0 })
  mh_rd(get(2025, "n"), get(2025, "m"), get(2021, "n"), get(2021, "m"))
}
with_jackknife <- function(label, d, f) {
  full <- f(d)
  kickers <- sort(unique(d$kicker_player_name), method = "radix")
  loo <- sapply(kickers, function(nm) f(d[kicker_player_name != nm]))
  j <- jackknife(full, loo)
  data.table(estimate = label, theta = full, se = j[1], lo = j[2], hi = j[3], kickers = length(kickers),
             attempts = nrow(d), loo_min = min(loo), loo_max = max(loo))
}

per <- lapply(SEASONS, function(s) with_jackknife(sprintf("chance at %d, %d", AT, s), long5,
                                                    function(d) chances_dummies(d, SEASONS)[[as.character(s)]]))
d25 <- function(d, quad = FALSE) { c <- chances_dummies(d, SEASONS, quad); c[["2025"]] - c[["2021"]] }
diffs <- list(
  with_jackknife("primary: 2025 minus 2021", long5, d25),
  with_jackknife("linear trend: 2025 minus 2021", long5, trend_change),
  with_jackknife("Mantel-Haenszel by yard: 2025 minus 2021", long5, mh_change),
  with_jackknife("every attempt, quadratic: 2025 minus 2021", five, function(d) d25(d, TRUE))
)
s6 <- c(SEASONS, 2026)
long6 <- k[long == TRUE & season %in% s6]
hold <- list(
  with_jackknife(sprintf("holdout: chance at %d, 2026", AT), long6, function(d) chances_dummies(d, s6)[["2026"]]),
  with_jackknife("holdout: 2026 minus 2021", long6, function(d) { c <- chances_dummies(d, s6); c[["2026"]] - c[["2021"]] }),
  with_jackknife("holdout: 2026 minus 2025", long6, function(d) { c <- chances_dummies(d, s6); c[["2026"]] - c[["2025"]] })
)
write_out(rbindlist(c(per, diffs, hold)), "output/e3_adjusted_r.csv")
