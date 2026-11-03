# Article 1 in R: the same tables as python/02_establish.py, from the same prepared file.
# Run from the analysis folder: Rscript R/establish.R
source("R/functions.R")
library(data.table)
MARGINS <- c(0, 1, 3, 7, 10, 14, 999)

p <- fread("data/e1_plays.csv", na.strings = "")
p[, row := .I - 1L]
for (cc in c("qb_kneel", "qb_spike", "qb_scramble", "rush_attempt", "pass_attempt")) set(p, which(is.na(p[[cc]])), cc, 0L)
u <- p[!is.na(posteam) & (rush_attempt == 1 | pass_attempt == 1) & qb_kneel != 1 & qb_spike != 1]

ht <- p[game_half == "Half2" & !is.na(posteam) & !is.na(score_differential)][order(row)]
ht <- ht[!duplicated(game_id)]
ht[, ht_home := ifelse(posteam == home_team, score_differential, -score_differential)]
ht <- ht[, .(game_id, ht_home)]

team_games <- function(d, min_plays = 10, called = FALSE) {
  x <- d[, .(rush = if (called) sum(rush_attempt - qb_scramble) else sum(rush_attempt), n = .N, season = season[1],
             home = home_team[1], away = away_team[1], result = result[1], first_row = min(row)),
         by = .(game_id, posteam)]
  x[, game_row := min(first_row), by = game_id]
  setorder(x, game_row, first_row)
  x <- x[!is.na(result) & result != 0 & n >= min_plays]
  x[, share := rush / n]
  x[, won := as.integer((posteam == home) == (result > 0))]
  x[]
}

quartile_view <- function(tg) {
  s <- tg[order(-share)]  # data.table's order is stable, like the tool's sort
  size <- nrow(s) %/% 4
  share <- s$share; won <- s$won
  top <- won[seq_len(size)]; bot <- won[(nrow(s) - size + 1):nrow(s)]
  nc <- newcombe(sum(top), size, sum(bot), size)
  range_wins <- function(above, tied, slots) {
    wt <- sum(tied); nt <- length(tied); base <- sum(above)
    c(base + max(0, slots - (nt - wt)), base + min(slots, wt))
  }
  v_top <- share[size]; v_bot <- share[nrow(s) - size + 1]
  a_top <- won[share > v_top]; t_top <- won[share == v_top]
  a_bot <- won[share < v_bot]; t_bot <- won[share == v_bot]
  rt <- range_wins(a_top, t_top, size - length(a_top))
  rb <- range_wins(a_bot, t_bot, size - length(a_bot))
  data.table(team_games = nrow(s), per_group = size, wins_most = sum(top), wins_least = sum(bot),
             rate_most = mean(top), rate_least = mean(bot), gap = nc[1], gap_lo = nc[2], gap_hi = nc[3],
             tied_at_cuts = length(t_top) + length(t_bot),
             tie_gap_min = (rt[1] - rb[2]) / size, tie_gap_max = (rt[2] - rb[1]) / size)
}

a <- u[season <= 2025]
h1 <- a[game_half == "Half1"]; h2 <- a[game_half == "Half2"]
close_ids <- ht[abs(ht_home) <= 3, game_id]
v <- rbindlist(lapply(list(list("whole game", a), list("first half", h1), list("second half", h2),
                           list("first half, within 3 at halftime", h1[game_id %in% close_ids])),
                      function(z) cbind(data.table(view = z[[1]]), quartile_view(team_games(z[[2]])))))
write_out(v, "output/e1_views_r.csv")
sw <- rbindlist(lapply(MARGINS, function(m)
  cbind(data.table(margin = m), quartile_view(team_games(h1[game_id %in% ht[abs(ht_home) <= m, game_id]])))))
write_out(sw, "output/e1_sweep_r.csv")

g4 <- rbindlist(lapply(list(c("Half1", "first half"), c("Half2", "second half")), function(hh) {
  s <- team_games(a[game_half == hh[1]])[order(-share)]
  size <- nrow(s) %/% 4; n <- nrow(s)
  rbindlist(lapply(1:4, function(k) {
    idx <- if (k <= 2) ((k - 1) * size + 1):(k * size) else (n - (5 - k) * size + 1):(n - (4 - k) * size)
    w <- s$won[idx]; ci <- wilson(sum(w), length(w))
    data.table(half = hh[2], group = k, n = length(w), wins = sum(w), rate = mean(w), lo = ci[1], hi = ci[2])
  }))
}))
write_out(g4, "output/e1_groups_r.csv")

games_table <- function(pp) {
  g <- pp[, .(season = season[1], home_team = home_team[1], away_team = away_team[1], result = result[1]), by = game_id]
  g <- g[!is.na(result) & result != 0]
  long <- rbind(g[, .(game_id, season, team = home_team, w = as.integer(result > 0))],
                g[, .(game_id, season, team = away_team, w = as.integer(result < 0))])
  long[, `:=`(wins = sum(w), games = .N), by = .(season, team)]
  long[, strength := ifelse(games > 1, (wins - w) / (games - 1), NA_real_)]
  out <- merge(g, long[, .(game_id, team, s_home = strength)], by.x = c("game_id", "home_team"), by.y = c("game_id", "team"))
  out <- merge(out, long[, .(game_id, team, s_away = strength)], by.x = c("game_id", "away_team"), by.y = c("game_id", "team"))
  out[, `:=`(y = as.integer(result > 0), d_strength = s_home - s_away)]
  out[]
}
share_diff <- function(tg) {
  h <- tg[posteam == home, .(game_id, sh = share)]
  aw <- tg[posteam != home, .(game_id, sa = share)]
  m <- merge(h, aw, by = "game_id")
  m[, .(game_id, d_share = (sh - sa) * 10)]
}
fit <- function(d, terms, sample, model) {
  d <- d[complete.cases(d[, ..terms])]
  setorder(d, game_id)
  X <- cbind(1, as.matrix(d[, ..terms]))
  f <- logistic_fit(X, d$y)
  data.table(sample = sample, model = model, term = c("home", terms), games = nrow(d), beta = f$b, se = f$se,
             chance = plogis(f$b), chance_lo = plogis(f$b - Z * f$se), chance_hi = plogis(f$b + Z * f$se))
}
models <- function(pp, uu, sample) {
  g <- merge(games_table(pp), ht, by = "game_id", all.x = TRUE)
  h <- uu[game_half == "Half1"]
  pz <- copy(pp)[, z := cummax(abs(fifelse(is.na(score_differential), 0L, as.integer(score_differential)))), by = game_id]
  pre <- pz[z == 0 & !is.na(posteam) & (rush_attempt == 1 | pass_attempt == 1) & qb_kneel != 1 & qb_spike != 1]
  ad <- merge(g, share_diff(team_games(h)), by = "game_id")
  dd <- merge(g, share_diff(team_games(pre, 5)), by = "game_id")
  ac <- merge(g, share_diff(team_games(h, called = TRUE)), by = "game_id")
  dc <- merge(g, share_diff(team_games(pre, 5, called = TRUE)), by = "game_id")
  rbind(fit(ad, "d_share", sample, "A"), fit(ad, c("d_share", "d_strength"), sample, "B"),
        fit(ad, c("d_share", "d_strength", "ht_home"), sample, "C"), fit(dd, c("d_share", "d_strength"), sample, "D"),
        fit(ac, "d_share", sample, "A called"), fit(dc, c("d_share", "d_strength"), sample, "D called"),
        fit(ad[game_id %in% dd$game_id], c("d_share", "d_strength"), sample, "B on D's games"))
}
write_out(rbind(models(p[season <= 2025], u[season <= 2025], "2021-2025"),
                models(p[season == 2026], u[season == 2026], "2026")), "output/e1_models_r.csv")

within_game <- function(uu, sample) {
  tg <- team_games(uu[game_half == "Half1"])
  rbindlist(lapply(list(list("every game", NULL), list("within 3 at halftime", close_ids)), function(z) {
    d <- if (is.null(z[[2]])) tg else tg[game_id %in% z[[2]]]
    pr <- d[, .(hi = max(share), lo = min(share), c = .N, hi_won = won[which.max(share)]), by = game_id][c == 2 & hi > lo]
    ci <- wilson(sum(pr$hi_won), nrow(pr))
    data.table(sample = sample, games = z[[1]], n = nrow(pr), wins = sum(pr$hi_won), rate = mean(pr$hi_won), lo = ci[1], hi = ci[2])
  }))
}
write_out(rbind(within_game(u[season <= 2025], "2021-2025"), within_game(u[season == 2026], "2026")), "output/e1_within_r.csv")
d <- share_diff(team_games(h1))$d_share * 10
write_out(data.table(h1_abs_gap_median = median(abs(d)), plays = nrow(a), scrambles = sum(a$qb_scramble), rushes = sum(a$rush_attempt),
                     games = uniqueN(a$game_id), games_2026 = uniqueN(p[season == 2026]$game_id)), "output/e1_counts_r.csv")
cat("R establish done\n")
