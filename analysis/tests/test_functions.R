# The same cases as tests/test_lib.py, plus one check of the Newton fit against glm().
source("../R/functions.R")
library(testthat)
test_that("wilson textbook", { w <- wilson(5, 10); expect_equal(w, c(0.2366, 0.7634), tolerance = 1e-3) })
test_that("newcombe published example", { n <- newcombe(56, 70, 48, 80); expect_equal(n, c(0.2, 0.0524, 0.3339), tolerance = 1e-3) })
test_that("mh weights", {
  expect_equal(mh_rd(c(10, 0), c(.5, 0), c(10, 5), c(.3, .1)), 0.2)
  expect_equal(mh_rd(c(1, 100), c(1, .5), c(1, 100), c(0, .5)), 0.5 / 50.5)
})
test_that("jackknife of a mean", {
  x <- c(1, 2, 4, 8); loo <- sapply(1:4, function(i) mean(x[-i]))
  expect_equal(jackknife(mean(x), loo)[1], sd(x) / 2)
})
test_that("dl no spread", { d <- dersimonian_laird(c(.1, .1, .1), c(.01, .02, .04)); expect_equal(d$tau, 0); expect_equal(d$mu, .1) })
test_that("newton matches glm", {
  set.seed(1); n <- 400; x <- rnorm(n); y <- rbinom(n, 1, plogis(.3 + .8 * x))
  f <- logistic_fit(cbind(1, x), y); g <- glm(y ~ x, family = binomial, control = glm.control(epsilon = 1e-14, maxit = 100))
  expect_equal(unname(f$b), unname(coef(g)), tolerance = 1e-8)
  expect_equal(unname(f$se), unname(sqrt(diag(vcov(g)))), tolerance = 1e-6)
})
