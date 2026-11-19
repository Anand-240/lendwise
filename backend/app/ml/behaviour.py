"""Behaviour tests shared by scripts/evaluate.py and the acceptance suite (report Section 4.9).

* Directional checks: 2 models x 3 inputs x 4 reference profiles = 24 checks. Each input is swept
  across its range while the other two stay fixed. A check fails when the score moves against the
  expected direction by more than `tolerance` points overall (the largest wrong-way drop between
  any two points of the sweep). The evaluation uses 1 point; the acceptance suite uses 0, because
  the constrained models must never move the wrong way at all.
* Nudge test: 551 random profiles across the valid input ranges (one per whole FICO score from 300
  to 850, with a random loan amount from $500 to $40,000 and a random DTI from 0 to 100). Each input
  is nudged on its own: loan amount +1%, FICO +1 point, DTI +0.5 (kept inside the valid ranges). A
  profile is jumpy if eligibility moves by more than 10 points or the default probability by more
  than 3 points after any nudge.
"""
from __future__ import annotations

import numpy as np

from app.ml.constants import DTI_MAX, DTI_MIN, FEATURES, FICO_MAX, FICO_MIN, LOAN_MAX, LOAN_MIN, SEED

REFERENCE_PROFILES = [
    {"loan_amount": 5_000, "fico": 700, "dti": 10},
    {"loan_amount": 15_000, "fico": 680, "dti": 20},
    {"loan_amount": 25_000, "fico": 720, "dti": 25},
    {"loan_amount": 35_000, "fico": 760, "dti": 30},
]
SWEEPS = {
    "loan_amount": np.arange(1_000, 40_001, 500, dtype=float),
    "fico": np.arange(600, 851, 1, dtype=float),
    "dti": np.arange(0, 45.01, 0.25),
}
ELIGIBILITY_JUMP = 10.0
RISK_JUMP = 3.0


def wrong_way(model, profile: dict, feature: str, sign: int) -> float:
    """Sweep one input and return the largest move against the expected direction, in points."""
    j = FEATURES.index(feature)
    grid = np.tile([profile["loan_amount"], profile["fico"], profile["dti"]], (len(SWEEPS[feature]), 1)).astype(float)
    grid[:, j] = SWEEPS[feature]
    s = model.predict_score(grid) * sign  # should never decrease along the sweep
    return float(np.max(np.maximum.accumulate(s) - s))


def direction_ok(model, profile: dict, feature: str, sign: int, tolerance: float = 0.0) -> tuple[bool, float]:
    worst = wrong_way(model, profile, feature, sign)
    return worst <= tolerance + 1e-9, worst


def behaviour_failures(model, cst: tuple[int, int, int], tolerance: float = 1.0) -> list[str]:
    failed = []
    for p in REFERENCE_PROFILES:
        for j, f in enumerate(FEATURES):
            ok, worst = direction_ok(model, p, f, cst[j], tolerance)
            if not ok:
                failed.append(f"{f} at {p}: moved {worst:.1f} points the wrong way")
    return failed


def nudge_profiles() -> np.ndarray:
    rng = np.random.default_rng(SEED)
    fico = np.arange(FICO_MIN, FICO_MAX + 1, dtype=float)
    loan = rng.uniform(LOAN_MIN, LOAN_MAX, size=len(fico)).round(-1)
    dti = rng.uniform(DTI_MIN, DTI_MAX, size=len(fico)).round(1)
    return np.column_stack([loan, fico, dti])


def jumpy_share(model, limit: float, profiles: np.ndarray | None = None) -> float:
    profiles = nudge_profiles() if profiles is None else profiles
    base = model.predict_score(profiles)
    worst = np.zeros(len(profiles))
    for col, step, lo, hi in ((0, None, LOAN_MIN, LOAN_MAX), (1, 1.0, FICO_MIN, FICO_MAX), (2, 0.5, DTI_MIN, DTI_MAX)):
        moved = profiles.copy()
        moved[:, col] = moved[:, col] * 1.01 if step is None else moved[:, col] + step
        moved[:, col] = np.clip(moved[:, col], lo, hi)
        worst = np.maximum(worst, np.abs(model.predict_score(moved) - base))
    return float((worst > limit).mean())
