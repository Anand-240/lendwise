"""Range guard (report Section 4.8.4).

Flags an application when any input lies outside the 0.1st to 99.9th percentile of the funded
loans the charge-off model learned from, or when an Isolation Forest (200 trees) finds the
combination of inputs unusual. A flag never causes a rejection on its own; it sends a case that
would otherwise be approved to a human reviewer instead.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from app.ml.constants import (
    FEATURE_LABELS,
    FEATURES,
    GUARD_CONTAMINATION,
    GUARD_LOWER_Q,
    GUARD_TREES,
    GUARD_UPPER_Q,
    SEED,
)
from app.ml.layer_model import as_matrix


def _fmt(feature: str, value: float) -> str:
    if feature == "loan_amount":
        return f"${value:,.0f}"
    if feature == "dti":
        return f"{value:g}%"
    return f"{value:.0f}"


class RangeGuard:
    def __init__(self, limits: dict[str, tuple[float, float]] | None = None, forest: IsolationForest | None = None):
        self.limits = limits or {}
        self.forest = forest

    def fit(self, X: Any) -> "RangeGuard":
        arr = as_matrix(X)
        self.limits = {
            f: (float(np.quantile(arr[:, i], GUARD_LOWER_Q)), float(np.quantile(arr[:, i], GUARD_UPPER_Q)))
            for i, f in enumerate(FEATURES)
        }
        self.forest = IsolationForest(
            n_estimators=GUARD_TREES, contamination=GUARD_CONTAMINATION, random_state=SEED
        ).fit(arr)
        return self

    def check(self, X: Any) -> list[list[str]]:
        """Reasons each row is flagged (an empty list means the row is not flagged)."""
        arr = as_matrix(X)
        reasons: list[list[str]] = [[] for _ in range(len(arr))]
        for i, f in enumerate(FEATURES):
            lo, hi = self.limits[f]
            for r in np.flatnonzero((arr[:, i] < lo) | (arr[:, i] > hi)):
                reasons[r].append(
                    f"{FEATURE_LABELS[f]} {_fmt(f, arr[r, i])} is outside the range of funded loans in the "
                    f"training data ({_fmt(f, lo)} to {_fmt(f, hi)})."
                )
        if self.forest is not None:
            for r in np.flatnonzero(self.forest.predict(arr) == -1):
                reasons[r].append("This combination of inputs is unusual compared with the training data.")
        return reasons

    def flags(self, X: Any) -> np.ndarray:
        return np.array([bool(r) for r in self.check(X)])

    def limits_json(self) -> dict[str, dict[str, float]]:
        return {f: {"low": lo, "high": hi} for f, (lo, hi) in self.limits.items()}
