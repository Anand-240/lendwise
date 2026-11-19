"""The two scoring models (report Sections 4.2 and 4.8).

Both are histogram gradient boosting classifiers with monotonic constraints, wrapped in 3-fold
sigmoid (Platt) calibration. They differ only in their constraints:

* EligibilityModel  [-1, +1, -1]: a larger loan or DTI never raises the score, a higher FICO never lowers it.
* ChargeOffModel    [+1, -1, +1]: the opposite, for the probability of charge-off.

Only the fitted scikit-learn estimator is saved to disk, so artifacts load without this module.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold

from app.ml.constants import CALIBRATION_FOLDS, CHARGEOFF_CST, ELIGIBILITY_CST, HGB_PARAMS, SEED


def as_matrix(X: Any) -> np.ndarray:
    """Inputs in model column order [loan_amount, fico, dti] as a float array."""
    arr = np.asarray(X, dtype=float)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    if arr.shape[1] != 3:
        raise ValueError("expected three columns: loan_amount, fico, dti")
    return arr


class LayerModel:
    monotonic_cst: tuple[int, int, int] | None = None
    name = "layer"

    def __init__(self, estimator: Any = None, *, params: dict[str, Any] | None = None,
                 monotonic_cst: tuple[int, int, int] | None = None, calibrate: bool = True):
        self.params = {**HGB_PARAMS, **(params or {})}
        if monotonic_cst is not None:
            self.monotonic_cst = monotonic_cst
        self.calibrate = calibrate
        self.estimator_ = estimator

    def build(self):
        booster = HistGradientBoostingClassifier(
            monotonic_cst=list(self.monotonic_cst) if self.monotonic_cst else None, **self.params
        )
        if not self.calibrate:
            return booster
        folds = StratifiedKFold(n_splits=CALIBRATION_FOLDS, shuffle=True, random_state=SEED)
        return CalibratedClassifierCV(estimator=booster, method="sigmoid", cv=folds)

    def fit(self, X: Any, y: Any) -> "LayerModel":
        self.estimator_ = self.build().fit(as_matrix(X), np.asarray(y, dtype=int))
        return self

    def predict_proba(self, X: Any) -> np.ndarray:
        """Probability of the positive class (accepted, or charged off) for each row."""
        if self.estimator_ is None:
            raise RuntimeError(f"{self.name} model is not fitted")
        return self.estimator_.predict_proba(as_matrix(X))[:, 1]

    def predict_score(self, X: Any) -> np.ndarray:
        """Score on a 0 to 100 scale."""
        return self.predict_proba(X) * 100.0


class EligibilityModel(LayerModel):
    monotonic_cst = ELIGIBILITY_CST
    name = "eligibility"


class ChargeOffModel(LayerModel):
    monotonic_cst = CHARGEOFF_CST
    name = "charge-off"
