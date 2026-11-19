"""Train, calibrate, evaluate and save both LendWise models and the range guard.

    python scripts/train_models.py            # both models
    python scripts/train_models.py --only eligibility
    python scripts/train_models.py --only chargeoff

Reads data/cohorts/*.csv.gz (built by scripts/build_cohorts.py) and writes to app/ml/artifacts/:
eligibility.joblib, chargeoff.joblib, range_guard.joblib and metadata.json.

Eligibility model: 2016 applications, accepted = 1 vs rejected = 0, stratified random 80:20 split.
Charge-off model:  36-month loans, trained on 2012 to 2014 and tested on 2015 (report Table 4.1).
Seed 42 is used everywhere so every run gives the same numbers.
"""
from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import accuracy_score, brier_score_loss, precision_score, recall_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ml import constants as C  # noqa: E402
from app.ml.guard import RangeGuard  # noqa: E402
from app.ml.layer_model import ChargeOffModel, EligibilityModel  # noqa: E402

COHORTS = ROOT / "data" / "cohorts"
ARTIFACTS = ROOT / "app" / "ml" / "artifacts"
X_COLS = list(C.FEATURES)


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def load_eligibility() -> pd.DataFrame:
    return pd.read_csv(COHORTS / "eligibility_2016.csv.gz")


def load_chargeoff() -> pd.DataFrame:
    return pd.read_csv(COHORTS / "chargeoff_36m.csv.gz")


def lender_rule(df: pd.DataFrame) -> np.ndarray:
    """LendingClub's near-fixed screening rule found by the audit (Section 5.4.4)."""
    return ((df["fico"] >= 660) & (df["dti"] <= 35) & (df["loan_amount"] < 40_000)).to_numpy().astype(int)


def train_eligibility(df: pd.DataFrame) -> tuple[EligibilityModel, dict]:
    train, test = df[df["split"] == "train"], df[df["split"] == "test"]
    log(f"eligibility: training on {len(train):,} rows")
    t = time.time()
    model = EligibilityModel().fit(train[X_COLS], train["accepted"])
    fit_s = time.time() - t
    p = model.predict_proba(test[X_COLS])
    y = test["accepted"].to_numpy()
    pred = (p >= 0.5).astype(int)
    rule = lender_rule(test)
    tc08 = model.predict_score(np.array([[15_000, 659, 15], [15_000, 660, 15]]))
    metrics = {
        "roc_auc": float(roc_auc_score(y, p)),
        "accuracy": float(accuracy_score(y, pred)),
        "precision": float(precision_score(y, pred)),
        "recall": float(recall_score(y, pred)),
        "brier": float(brier_score_loss(y, p)),
        "rule_accuracy": float(accuracy_score(y, rule)),
        "rule_agreement": float((pred == rule).mean()),
        "rule": "FICO >= 660, DTI <= 35, loan < $40,000",
        "train_rows": len(train),
        "test_rows": len(test),
        "fit_seconds": round(fit_s, 1),
        "fico_659_vs_660": {"loan_amount": 15_000, "dti": 15, "fico_659": float(tc08[0]), "fico_660": float(tc08[1])},
    }
    log(f"eligibility: AUC {metrics['roc_auc']:.4f}, rule agreement {metrics['rule_agreement']:.3%}")
    return model, metrics


def deciles(p: np.ndarray, y: np.ndarray) -> list[dict]:
    order = np.argsort(p, kind="stable")
    out = []
    for i, idx in enumerate(np.array_split(order, 10)):
        out.append({
            "decile": i + 1,
            "predicted": float(p[idx].mean() * 100),
            "observed": float(y[idx].mean() * 100),
            "count": int(len(idx)),
        })
    return out


def train_chargeoff(df: pd.DataFrame) -> tuple[ChargeOffModel, RangeGuard, dict]:
    train, test = df[df["split"] == "train"], df[df["split"] == "test"]
    log(f"charge-off: training on {len(train):,} loans from 2012 to 2014")
    t = time.time()
    model = ChargeOffModel().fit(train[X_COLS], train["charged_off"])
    fit_s = time.time() - t
    p = model.predict_proba(test[X_COLS])
    y = test["charged_off"].to_numpy()
    base = float(train["charged_off"].mean())
    dec = deciles(p, y)
    metrics = {
        "roc_auc": float(roc_auc_score(y, p)),
        "mean_predicted": float(p.mean() * 100),
        "mean_observed": float(y.mean() * 100),
        "brier": float(brier_score_loss(y, p)),
        "brier_base_rate": float(brier_score_loss(y, np.full_like(p, base))),
        "max_decile_gap": float(max(abs(d["predicted"] - d["observed"]) for d in dec)),
        "train_rate": base * 100,
        "test_rate": float(y.mean() * 100),
        "train_rows": len(train),
        "test_rows": len(test),
        "fit_seconds": round(fit_s, 1),
        "deciles": dec,
    }
    log(f"charge-off: AUC {metrics['roc_auc']:.4f}, predicted {metrics['mean_predicted']:.1f}% vs "
        f"observed {metrics['mean_observed']:.1f}%")

    log("range guard: fitting percentile limits and Isolation Forest on the training loans")
    guard = RangeGuard().fit(train[X_COLS])
    metrics["guard_flag_rate_train"] = float(guard.flags(train[X_COLS]).mean())
    metrics["guard_flag_rate_test"] = float(guard.flags(test[X_COLS]).mean())
    return model, guard, metrics


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["eligibility", "chargeoff"])
    args = ap.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    summary = json.loads((COHORTS / "summary.json").read_text())
    meta_path = ARTIFACTS / "metadata.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() and args.only else {}

    if args.only in (None, "eligibility"):
        model, m = train_eligibility(load_eligibility())
        joblib.dump(model.estimator_, ARTIFACTS / "eligibility.joblib", compress=3)
        meta.setdefault("metrics", {})["eligibility"] = m
    if args.only in (None, "chargeoff"):
        model, guard, m = train_chargeoff(load_chargeoff())
        joblib.dump(model.estimator_, ARTIFACTS / "chargeoff.joblib", compress=3)
        joblib.dump(guard.forest, ARTIFACTS / "range_guard.joblib", compress=3)
        meta.setdefault("metrics", {})["chargeoff"] = m
        meta["guard"] = {
            "limits": guard.limits_json(),
            "lower_quantile": C.GUARD_LOWER_Q,
            "upper_quantile": C.GUARD_UPPER_Q,
            "isolation_trees": C.GUARD_TREES,
            "contamination": C.GUARD_CONTAMINATION,
            "fitted_on": "charge-off training loans (2012 to 2014)",
        }

    severity = round(float(summary["severity"]), 4)
    meta.update({
        "model_version": f"lendwise-hgb-{datetime.now(timezone.utc):%Y.%m.%d}",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "features": X_COLS,
        "constraints": {"eligibility": list(C.ELIGIBILITY_CST), "chargeoff": list(C.CHARGEOFF_CST)},
        "hgb_params": C.HGB_PARAMS,
        "calibration": {"method": "sigmoid", "folds": C.CALIBRATION_FOLDS},
        "severity": severity,
        "thresholds": {
            "reject_eligibility": C.REJECT_ELIGIBILITY,
            "approve_eligibility": C.APPROVE_ELIGIBILITY,
            "reject_pd": C.REJECT_PD,
            "approve_pd": C.APPROVE_PD,
            "reject_el": round(C.REJECT_PD * severity, 2),
            "approve_el": round(C.APPROVE_PD * severity, 2),
        },
        "input_ranges": {
            "loan_amount": {"min": C.LOAN_MIN, "max": C.LOAN_MAX},
            "fico": {"min": C.FICO_MIN, "max": C.FICO_MAX},
            "dti": {"min": C.DTI_MIN, "max": C.DTI_MAX},
        },
        "counter_offer_step": C.COUNTER_OFFER_STEP,
        "data": summary,
        "environment": {
            "python": platform.python_version(),
            "scikit_learn": sklearn.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "seed": C.SEED,
        },
    })
    meta_path.write_text(json.dumps(meta, indent=2))
    log(f"saved artifacts to {ARTIFACTS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
