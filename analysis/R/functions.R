# Statistics both articles use. Every function has a twin in python/lib.py.
Z <- qnorm(0.975)

wilson <- function(k, n) {
  if (n == 0) return(c(NaN, NaN))
  p <- k / n
  d <- 1 + Z^2 / n
  ctr <- (p + Z^2 / (2 * n)) / d
  h <- Z * sqrt(p * (1 - p) / n + Z^2 / (4 * n^2)) / d
  c(ctr - h, ctr + h)
}

newcombe <- function(k1, n1, k2, n2) {
  p1 <- k1 / n1; p2 <- k2 / n2
  a <- wilson(k1, n1); b <- wilson(k2, n2)
  d <- p1 - p2
  c(d, d - sqrt((p1 - a[1])^2 + (b[2] - p2)^2), d + sqrt((a[2] - p1)^2 + (p2 - b[1])^2))
}

logistic_fit <- function(X, y, tol = 1e-13, maxit = 100) {
  b <- rep(0, ncol(X))
  done <- FALSE
  for (i in seq_len(maxit)) {
    p <- plogis(drop(X %*% b))
    w <- p * (1 - p)
    info <- crossprod(X * w, X)
    step <- solve(info, crossprod(X, y - p))
    b <- b + drop(step)
    if (max(abs(step)) < tol) { done <- TRUE; break }
  }
  if (!done) stop("logistic fit did not converge")
  p <- plogis(drop(X %*% b))
  info <- crossprod(X * (p * (1 - p)), X)
  list(b = b, se = sqrt(diag(solve(info))))
}

mh_rd <- function(n1, m1, n0, m0) {
  ok <- n1 > 0 & n0 > 0
  w <- n1[ok] * n0[ok] / (n1[ok] + n0[ok])
  sum(w * (m1[ok] - m0[ok])) / sum(w)
}

jackknife <- function(full, loo) {
  g <- length(loo)
  se <- sqrt((g - 1) / g * sum((loo - mean(loo))^2))
  t <- qt(0.975, g - 1)
  c(se, full - t * se, full + t * se)
}

dersimonian_laird <- function(y, v) {
  w <- 1 / v
  mu_f <- sum(w * y) / sum(w)
  q <- sum(w * (y - mu_f)^2)
  df <- length(y) - 1
  cc <- sum(w) - sum(w^2) / sum(w)
  tau2 <- max(0, (q - df) / cc)
  ws <- 1 / (v + tau2)
  mu <- sum(ws * y) / sum(ws)
  se <- sqrt(1 / sum(ws))
  list(mu = mu, se = se, lo = mu - Z * se, hi = mu + Z * se, tau = sqrt(tau2), q = q, df = df,
       i2 = if (q > 0) max(0, (q - df) / q) else 0, shrunk = mu + tau2 / (tau2 + v) * (y - mu))
}

# Full precision on disk, so the reconcile compares the numbers themselves.
write_out <- function(d, path) {
  d <- as.data.frame(d)
  for (nm in names(d)) if (is.double(d[[nm]])) {
    x <- sprintf("%.17g", d[[nm]]); x[is.na(d[[nm]])] <- ""; d[[nm]] <- x
  }
  data.table::fwrite(d, path, quote = "auto", na = "")
}
