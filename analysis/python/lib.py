"""Statistics both articles use. Every function has a twin in R/functions.R,
and the two are tested on shared fixtures and reconciled on every output."""
from __future__ import annotations

import math

import numpy as np
from scipy import stats

Z = float(stats.norm.ppf(0.975))


def wilson(k: float, n: float) -> tuple[float, float]:
    """95% Wilson interval for k of n."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + Z**2 / n
    c = (p + Z**2 / (2 * n)) / d
    h = Z * math.sqrt(p * (1 - p) / n + Z**2 / (4 * n**2)) / d
    return (c - h, c + h)


def newcombe(k1: float, n1: float, k2: float, n2: float) -> tuple[float, float, float]:
    """Difference k1/n1 - k2/n2 with its 95% Newcombe (hybrid score) interval."""
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1)
    l2, u2 = wilson(k2, n2)
    d = p1 - p2
    return (d, d - math.sqrt((p1 - l1)**2 + (u2 - p2)**2), d + math.sqrt((u1 - p1)**2 + (p2 - l2)**2))


def logistic(X: np.ndarray, y: np.ndarray, tol: float = 1e-13, maxit: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """Logistic regression by Newton's method. Returns coefficients and standard errors."""
    b = np.zeros(X.shape[1])
    for _ in range(maxit):
        eta = X @ b
        p = 1 / (1 + np.exp(-eta))
        w = p * (1 - p)
        info = (X * w[:, None]).T @ X
        step = np.linalg.solve(info, X.T @ (y - p))
        b = b + step
        if np.max(np.abs(step)) < tol:
            break
    else:
        raise RuntimeError("logistic fit did not converge")
    p = 1 / (1 + np.exp(-(X @ b)))
    info = (X * (p * (1 - p))[:, None]).T @ X
    return b, np.sqrt(np.diag(np.linalg.inv(info)))


def plogis(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def mh_rd(rows: list[tuple[float, float, float, float]]) -> float:
    """Mantel-Haenszel difference of means across strata. Each row is
    (n1, mean1, n0, mean0); a stratum with an empty arm carries no weight."""
    num = den = 0.0
    for n1, m1, n0, m0 in rows:
        if n1 > 0 and n0 > 0:
            w = n1 * n0 / (n1 + n0)
            num += w * (m1 - m0)
            den += w
    return num / den


def jackknife(full: float, loo: list[float]) -> tuple[float, float, float]:
    """Delete-one-cluster standard error and 95% t interval around the full estimate."""
    g = len(loo)
    a = np.array(loo)
    se = math.sqrt((g - 1) / g * float(np.sum((a - a.mean())**2)))
    t = float(stats.t.ppf(0.975, g - 1))
    return (se, full - t * se, full + t * se)


def dersimonian_laird(y: np.ndarray, v: np.ndarray) -> dict:
    """Random-effects mean, tau, and shrunken estimates for gaps y with variances v."""
    w = 1 / v
    mu_f = float(np.sum(w * y) / np.sum(w))
    q = float(np.sum(w * (y - mu_f)**2))
    df = len(y) - 1
    c = float(np.sum(w) - np.sum(w**2) / np.sum(w))
    tau2 = max(0.0, (q - df) / c)
    ws = 1 / (v + tau2)
    mu = float(np.sum(ws * y) / np.sum(ws))
    se = math.sqrt(1 / float(np.sum(ws)))
    shrunk = mu + tau2 / (tau2 + v) * (y - mu)
    return {"mu": mu, "se": se, "lo": mu - Z * se, "hi": mu + Z * se, "tau": math.sqrt(tau2), "q": q, "df": df,
            "i2": max(0.0, (q - df) / q) if q > 0 else 0.0, "shrunk": shrunk}
