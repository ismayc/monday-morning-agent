"""Hand-checkable cases for python/lib.py. tests/test_functions.R runs the same cases."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import lib  # noqa: E402


def test_wilson_textbook():
    lo, hi = lib.wilson(5, 10)  # Agresti and Coull report 0.2366 to 0.7634
    assert lo == pytest.approx(0.2366, abs=1e-4) and hi == pytest.approx(0.7634, abs=1e-4)


def test_newcombe_published_example():
    d, lo, hi = lib.newcombe(56, 70, 48, 80)  # Newcombe (1998), method 10: 0.0524 to 0.3339
    assert d == pytest.approx(0.2) and lo == pytest.approx(0.0524, abs=1e-4) and hi == pytest.approx(0.3339, abs=1e-4)


def test_mh_is_weighted_by_harmonic_size():
    assert lib.mh_rd([(10, 0.5, 10, 0.3), (0, 0.0, 5, 0.1)]) == pytest.approx(0.2)
    assert lib.mh_rd([(1, 1.0, 1, 0.0), (100, 0.5, 100, 0.5)]) == pytest.approx(0.5 / 50.5)


def test_jackknife_of_a_mean_matches_the_standard_error():
    x = np.array([1.0, 2.0, 4.0, 8.0])
    loo = [float(np.delete(x, i).mean()) for i in range(4)]
    se, _, _ = lib.jackknife(float(x.mean()), loo)
    assert se == pytest.approx(x.std(ddof=1) / 2)


def test_dl_with_no_extra_spread_is_the_fixed_effect_mean():
    d = lib.dersimonian_laird(np.array([0.1, 0.1, 0.1]), np.array([0.01, 0.02, 0.04]))
    assert d["tau"] == 0 and d["mu"] == pytest.approx(0.1) and d["shrunk"] == pytest.approx(np.array([0.1, 0.1, 0.1]))


def test_logistic_recovers_a_saturated_log_odds():
    X = np.array([[1.0, 0], [1, 0], [1, 0], [1, 0], [1, 1], [1, 1], [1, 1], [1, 1]])
    y = np.array([1.0, 0, 0, 0, 1, 1, 1, 0])
    b, _ = lib.logistic(X, y)
    assert b[0] == pytest.approx(np.log(1 / 3)) and b[1] == pytest.approx(np.log(3) - np.log(1 / 3))
