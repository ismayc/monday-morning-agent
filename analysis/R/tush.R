# Article 2 in R: the same tables as python/03_tush.py, from the same prepared files.
# Run from the analysis folder: Rscript R/tush.R
source("R/functions.R")
library(data.table)
STRATA <- c("season", "down", "goal_to_go")

pa <- fread("data/e2_passers.csv", na.strings = "")
pa[, row := .I - 1L]
pr <- pa[, .(n = .N, first = min(row)), by = .(game_id, posteam, who)]
setorder(pr, -n, first)
pr <- pr[!duplicated(pr[, .(game_id, posteam)]), .(game_id, posteam, primary = who)]

s <- fread("data/e2_short.csv", na.strings = "")
s[, ord := .I]
s <- merge(s, pr, by = c("game_id", "posteam"), all.x = TRUE)
setorder(s, ord)
s[, is_primary := !is.na(rusher) & !is.na(primary) & rusher == primary]
s[, defined := is_primary & !is.na(shotgun) & shotgun == 0]
s[, conv := as.integer((!is.na(first_down) & first_down == 1) | (!is.na(touchdown) & touchdown == 1))]
s[, two_point := is.na(down)]
s[, stuffed := as.integer(!is.na(yards_gained) & yards_gained <= 0)]
s[is.na(fumble_lost), fumble_lost := 0L]
s[is.na(qb_scramble), qb_scramble := 0L]
s[is.na(goal_to_go), goal_to_go := 0L]

gap_row <- function(label, seasons, d, arm = "defined") {
  x <- d[[arm]]
  k1 <- sum(d$conv[x]); n1 <- sum(x); k0 <- sum(d$conv[!x]); n0 <- sum(!x)
  nc <- newcombe(k1, n1, k0, n0)
  data.table(label = label, seasons = seasons, n1 = n1, k1 = k1, r1 = k1 / n1, n0 = n0, k0 = k0, r0 = k0 / n0,
             gap = nc[1], lo = nc[2], hi = nc[3])
}
mh <- function(d, y, arm) {
  x <- data.table(season = d$season, down = d$down, goal_to_go = d$goal_to_go, arm = d[[arm]], y = as.numeric(d[[y]]))
  t <- x[, .(n = .N, m = mean(y)), by = .(season, down, goal_to_go, arm)]
  j <- merge(t[arm == TRUE, .(season, down, goal_to_go, n1 = n, m1 = m)],
             t[arm == FALSE, .(season, down, goal_to_go, n0 = n, m0 = m)], by = STRATA)
  mh_rd(j$n1, j$m1, j$n0, j$m0)
}
adjusted <- function(label, outcome, d, arm = "defined") {
  d <- d[!is.na(d[[outcome]])]
  full <- mh(d, outcome, arm)
  teams <- sort(unique(d$posteam), method = "radix")
  loo <- vapply(teams, function(t) mh(d[posteam != t], outcome, arm), numeric(1))
  j <- jackknife(full, loo)
  data.table(label = label, outcome = outcome, plays = nrow(d), teams = length(teams), theta = full, se = j[1], lo = j[2], hi = j[3],
             loo_min = min(loo), team_min = teams[which.min(loo)], loo_max = max(loo), team_max = teams[which.max(loo)])
}
wilson_row <- function(name, k, n) {
  ci <- wilson(k, n)
  data.table(measure = name, k = k, n = n, rate = k / n, lo = ci[1], hi = ci[2])
}

one <- s[ydstogo <= 1]
five_all <- one[season <= 2025]
five <- five_all[two_point == FALSE]

write_out(rbind(
  gap_row("as published, two-point tries in", "2021-2025", five_all),
  gap_row("as published, without the Eagles", "2021-2025", five_all[posteam != "PHI"]),
  gap_row("corrected, two-point tries out", "2021-2025", five),
  gap_row("corrected, without the Eagles", "2021-2025", five[posteam != "PHI"]),
  gap_row("corrected, the Eagles alone", "2021-2025", five[posteam == "PHI"])), "output/e2_reproduce_r.csv")
tp <- five_all[two_point == TRUE]
write_out(data.table(two_point_tries = nrow(tp), in_defined = sum(tp$defined), in_other = sum(!tp$defined)), "output/e2_two_point_r.csv")

cc <- five[!is.na(is_qb_sneak)]
cc[, sneak := is_qb_sneak == 1]
both <- cc[defined & sneak, .N]; n_def <- sum(cc$defined); n_sneak <- sum(cc$sneak)
fp <- cc[defined & !sneak]; fn <- cc[!defined & sneak]
nosc <- cc[qb_scramble == 0]
write_out(rbind(
  wilson_row("precision: charted sneak among defined plays", both, n_def),
  wilson_row("recall: defined play among charted sneaks", both, n_sneak),
  wilson_row("precision after removing scrambles", nosc[defined & sneak, .N], sum(nosc$defined)),
  wilson_row("defined non-sneaks that were scrambles", fp[qb_scramble == 1, .N], nrow(fp)),
  wilson_row("missed sneaks by another runner", fn[is_primary == FALSE, .N], nrow(fn)),
  wilson_row("charted rate among other rushes", n_sneak - both, nrow(cc) - n_def)), "output/e2_validation_r.csv")
write_out(data.table(charted_plays = nrow(cc), both = both, defined_only = nrow(fp), sneak_only = nrow(fn),
                     neither = nrow(cc) - both - nrow(fp) - nrow(fn), fp_conv = mean(fp$conv),
                     fp_scramble_conv = mean(fp[qb_scramble == 1]$conv)), "output/e2_confusion_r.csv")

two <- s[season <= 2025 & ydstogo <= 2 & two_point == FALSE]
anyf <- copy(five)[, defined := is_primary]
write_out(rbind(
  gap_row("the entry", "2021-2025", five),
  gap_row("the entry, scrambles removed from both sides", "2021-2025", five[qb_scramble == 0]),
  gap_row("any formation, not only under center", "2021-2025", anyf),
  gap_row("two yards or less", "2021-2025", two),
  gap_row("the entry", "2022-2025", five[season >= 2022]),
  gap_row("the charted sneak", "2022-2025", cc, arm = "sneak")), "output/e2_sensitivity_r.csv")

write_out(rbind(adjusted("all teams", "conv", five), adjusted("without the Eagles", "conv", five[posteam != "PHI"]),
                adjusted("all teams", "epa", five), adjusted("all teams", "yards_gained", five),
                adjusted("all teams", "stuffed", five), adjusted("all teams", "fumble_lost", five)), "output/e2_adjusted_r.csv")

defd <- five[defined == TRUE]; g <- five[defined == FALSE]
cmp <- function(name, o) {
  d <- rbind(defd, o)
  cbind(gap_row(name, "2021-2025", d), data.table(mh_gap = mh(d, "conv", "defined")))
}
write_out(rbind(cmp("every other rush", g),
                cmp("under center, another runner", g[shotgun == 0 & is_primary == FALSE]),
                cmp("shotgun, another runner", g[shotgun == 1 & is_primary == FALSE]),
                cmp("shotgun, the primary passer", g[shotgun == 1 & is_primary == TRUE]),
                cmp("shotgun, the primary passer, no scrambles", g[shotgun == 1 & is_primary == TRUE & qb_scramble == 0])),
          "output/e2_comparators_r.csv")

t <- five[, .(n = .N, k = sum(conv)), by = .(posteam, defined)]
j <- merge(t[defined == TRUE, .(posteam, n1 = n, k1 = k)], t[defined == FALSE, .(posteam, n0 = n, k0 = k)], by = "posteam")[n1 >= 20]
setorder(j, posteam)
j[, `:=`(r1 = k1 / n1, r0 = k0 / n0)]
y <- j$r1 - j$r0
v <- j$r1 * (1 - j$r1) / j$n1 + j$r0 * (1 - j$r0) / j$n0
dl <- dersimonian_laird(y, v)
j[, `:=`(gap = y, se = sqrt(v), shrunk = dl$shrunk)]
write_out(j, "output/e2_team_r.csv")
write_out(data.table(mu = dl$mu, se = dl$se, lo = dl$lo, hi = dl$hi, tau = dl$tau, q = dl$q, df = dl$df, i2 = dl$i2, teams = length(y)),
          "output/e2_team_summary_r.csv")

write_out(rbindlist(lapply(2021:2025, function(yr) gap_row(as.character(yr), as.character(yr), five[season == yr]))), "output/e2_season_r.csv")
write_out(rbindlist(lapply(list(list("defined", defd), list("other", g)), function(z) {
  d <- z[[2]]
  data.table(arm = z[[1]], plays = nrow(d), conv = mean(d$conv), epa = mean(d$epa, na.rm = FALSE), yards = mean(d$yards_gained),
             stuffed = mean(d$stuffed), fumble_lost = mean(d$fumble_lost))
})), "output/e2_beyond_r.csv")

write_out(rbindlist(lapply(1:4, function(dn) {
  a1 <- five[down == dn & defined == TRUE]; a0 <- five[down == dn & defined == FALSE]
  data.table(down = dn, n1 = nrow(a1), r1 = sum(a1$conv) / nrow(a1), n0 = nrow(a0), r0 = sum(a0$conv) / nrow(a0))
})), "output/e2_down_r.csv")

h <- one[season == 2026 & two_point == FALSE]
write_out(rbind(gap_row("2026, all teams", "2026", h), gap_row("2026, without the Eagles", "2026", h[posteam != "PHI"])), "output/e2_holdout_r.csv")
write_out(adjusted("2026, all teams", "conv", h), "output/e2_holdout_adjusted_r.csv")
cat("R tush done\n")
