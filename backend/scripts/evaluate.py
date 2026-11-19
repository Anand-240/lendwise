"""Evaluation results beyond the headline metrics (report Section 5.4.4).

    python scripts/evaluate.py

Writes app/ml/artifacts/evaluation.json with:
  * variants A to D (constraints and regularisation) with AUC and the share of jumpy profiles
  * the 24 behaviour checks for unconstrained and constrained models
  * the audit of the first eligibility model (where the AUC of 0.99 came from)
  * AUC inside FICO, loan amount and DTI bands for the charge-off model
  * twelve algorithms compared on the same three inputs
  * the charge-off AUC with extra application fields (if data/cohorts/chargeoff_extended.csv.gz exists)
  * the loss severity regression check
"""
from __future__ import annotations

import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis, QuadraticDiscriminantAnalysis
from sklearn.ensemble import (
    AdaBoostClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import r2_score, roc_auc_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ml import constants as C  # noqa: E402
from app.ml.behaviour import ELIGIBILITY_JUMP, RISK_JUMP, behaviour_failures, jumpy_share, nudge_profiles  # noqa: E402
from app.ml.layer_model import LayerModel  # noqa: E402

COHORTS = ROOT / "data" / "cohorts"
ARTIFACTS = ROOT / "app" / "ml" / "artifacts"
X_COLS = list(C.FEATURES)

DEFAULT_HGB = {"max_iter": 100, "max_leaf_nodes": 31, "min_samples_leaf": 20, "l2_regularization": 0.0}
HEAVY_HGB = {"max_iter": 150, "max_leaf_nodes": 4, "min_samples_leaf": 5000, "l2_regularization": 50.0}
VARIANTS = {
    "A": ("Baseline (no constraints)", None, DEFAULT_HGB),
    "B": ("Monotonic constraints only", "cst", DEFAULT_HGB),
    "C": ("Constraints + regularisation (chosen)", "cst", {}),
    "D": ("Heavier regularisation", "cst", HEAVY_HGB),
}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def variants(elig: pd.DataFrame, co: pd.DataFrame, profiles: np.ndarray) -> tuple[list[dict], dict]:
    out, behaviour = [], {}
    etr, ete = elig[elig["split"] == "train"], elig[elig["split"] == "test"]
    ctr, cte = co[co["split"] == "train"], co[co["split"] == "test"]
    for key, (label, cst, params) in VARIANTS.items():
        row = {"variant": key, "label": label}
        for name, tr, te, target, model_cst, limit in (
            ("eligibility", etr, ete, "accepted", C.ELIGIBILITY_CST, ELIGIBILITY_JUMP),
            ("chargeoff", ctr, cte, "charged_off", C.CHARGEOFF_CST, RISK_JUMP),
        ):
            t = time.time()
            m = LayerModel(params=params, monotonic_cst=model_cst if cst else None)
            m.fit(tr[X_COLS], tr[target])
            row[f"{name}_auc"] = float(roc_auc_score(te[target], m.predict_proba(te[X_COLS])))
            row[f"{name}_jumpy"] = jumpy_share(m, limit, profiles)
            if key in ("A", "C"):
                behaviour.setdefault(key, []).extend(f"{name}: {x}" for x in behaviour_failures(m, model_cst))
            log(f"variant {key} {name}: AUC {row[f'{name}_auc']:.4f}, jumpy {row[f'{name}_jumpy']:.1%} ({time.time() - t:.0f}s)")
        out.append(row)
    checks = 2 * len(X_COLS) * 4
    return out, {
        "checks": checks,
        "unconstrained_failed": len(behaviour.get("A", [])),
        "constrained_failed": len(behaviour.get("C", [])),
        "unconstrained_failures": behaviour.get("A", []),
    }


def audit(elig: pd.DataFrame) -> dict:
    """Retrain the first, unconstrained eligibility model with different inputs (Figure 5.4)."""
    df = elig.copy()
    for col in ("emp_length", "state", "purpose"):
        df[col] = df[col].fillna("missing").astype("category")
    tr, te = df[df["split"] == "train"], df[df["split"] == "test"]

    def auc(cols: list[str], rows: pd.Series | None = None) -> float:
        a, b = (tr, te) if rows is None else (tr[rows.loc[tr.index]], te[rows.loc[te.index]])
        m = HistGradientBoostingClassifier(categorical_features="from_dtype", random_state=C.SEED)
        m.fit(a[cols], a["accepted"])
        return float(roc_auc_score(b["accepted"], m.predict_proba(b[cols])[:, 1]))

    full = ["loan_amount", "fico", "dti", "emp_length", "state", "purpose"]
    no_emp = ["loan_amount", "fico", "dti", "state", "purpose"]
    rows = [
        ("All features (incl. employment length)", auc(full)),
        ("Without employment length", auc(no_emp)),
        ("FICO alone", auc(["fico"])),
        ("Without emp. length, FICO >= 660 only", auc(no_emp, df["fico"] >= 660)),
        ("Employment length alone", auc(["emp_length"])),
        ("Loan amount and DTI only", auc(["loan_amount", "dti"])),
    ]
    without_purpose = auc(["loan_amount", "fico", "dti", "emp_length", "state"])
    for label, value in rows:
        log(f"audit: {label}: {value:.4f}")
    rejected = elig[elig["accepted"] == 0]
    # FICO is recorded differently too: the accepted file keeps the low end of a 5-point range
    # (660, 665, ...) while the rejected file has every whole number.
    accepted = elig[elig["accepted"] == 1]
    plain = LayerModel(monotonic_cst=None).fit(tr[X_COLS], tr["accepted"])
    probe = np.array([[5_000, 700, 10], [5_000, 701, 10]], dtype=float)
    p700, p701 = plain.predict_score(probe)
    return {
        "fico_multiple_of_5": {
            "accepted": float((accepted["fico"] % 5 == 0).mean()),
            "rejected": float((rejected["fico"] % 5 == 0).mean()),
            "unconstrained_700": float(p700),
            "unconstrained_701": float(p701),
        },
        "rows": [{"label": k, "auc": v} for k, v in rows],
        "purpose_adds": rows[0][1] - without_purpose,
        "three_inputs_unconstrained": auc(["loan_amount", "fico", "dti"]),
        "rejected_emp_lt_1y_share": float((rejected["emp_length"] == "< 1 year").mean()),
        "accepted_emp_lt_1y_share": float((elig.loc[elig["accepted"] == 1, "emp_length"] == "< 1 year").mean()),
    }


def subgroups(co: pd.DataFrame) -> list[dict]:
    from app.ml.layer_model import ChargeOffModel

    tr, te = co[co["split"] == "train"], co[co["split"] == "test"].copy()
    m = ChargeOffModel().fit(tr[X_COLS], tr["charged_off"])
    te["p"] = m.predict_proba(te[X_COLS])
    bands = {
        "FICO": ("fico", [(660, 679), (680, 699), (700, 719), (720, 749), (750, 850)], "{lo} to {hi}"),
        "Loan amount": ("loan_amount", [(0, 4_999), (5_000, 14_999), (15_000, 24_999), (25_000, 40_000)], "${lo:,} to ${hi:,}"),
        "DTI": ("dti", [(0, 9.99), (10, 19.99), (20, 29.99), (30, 100)], "{lo:g} to {hi:g}"),
    }
    out = []
    for group, (col, ranges, fmt) in bands.items():
        for lo, hi in ranges:
            part = te[(te[col] >= lo) & (te[col] <= hi)]
            if part["charged_off"].nunique() < 2 or len(part) < 500:
                continue
            out.append({
                "group": group, "band": fmt.format(lo=lo, hi=hi), "rows": len(part),
                "default_rate": float(part["charged_off"].mean() * 100),
                "auc": float(roc_auc_score(part["charged_off"], part["p"])),
            })
    return out


def algorithms(co: pd.DataFrame) -> list[dict]:
    tr, te = co[co["split"] == "train"], co[co["split"] == "test"]
    Xtr, ytr, Xte, yte = tr[X_COLS].to_numpy(), tr["charged_off"].to_numpy(), te[X_COLS].to_numpy(), te["charged_off"].to_numpy()
    scaled = lambda est: make_pipeline(StandardScaler(), est)  # noqa: E731
    candidates = {
        "Logistic regression": scaled(LogisticRegression(max_iter=1000)),
        "Linear discriminant analysis": LinearDiscriminantAnalysis(),
        "Quadratic discriminant analysis": QuadraticDiscriminantAnalysis(),
        "Gaussian naive Bayes": GaussianNB(),
        "Decision tree": DecisionTreeClassifier(max_depth=6, min_samples_leaf=500, random_state=C.SEED),
        "Random forest": RandomForestClassifier(n_estimators=150, min_samples_leaf=500, n_jobs=-1, random_state=C.SEED),
        "Extra trees": ExtraTreesClassifier(n_estimators=150, min_samples_leaf=500, n_jobs=-1, random_state=C.SEED),
        "AdaBoost": AdaBoostClassifier(n_estimators=100, random_state=C.SEED),
        "Gradient boosting": GradientBoostingClassifier(n_estimators=150, max_depth=3, random_state=C.SEED),
        "k-nearest neighbours (k=500, 60,000-loan sample)": "knn",
        "Neural network (MLP)": scaled(MLPClassifier(hidden_layer_sizes=(16, 8), max_iter=50, early_stopping=True, random_state=C.SEED)),
        "Histogram gradient boosting (LendWise)": None,
    }
    out = []
    for name, est in candidates.items():
        t = time.time()
        if est is None:
            from app.ml.layer_model import ChargeOffModel

            p = ChargeOffModel().fit(Xtr, ytr).predict_proba(Xte)
        elif est == "knn":
            # Exact k-NN over 300,000 loans is too slow to be practical; a stratified sample is enough.
            idx = np.random.default_rng(C.SEED).choice(len(Xtr), 60_000, replace=False)
            knn = scaled(KNeighborsClassifier(n_neighbors=500, n_jobs=-1)).fit(Xtr[idx], ytr[idx])
            p = knn.predict_proba(Xte)[:, 1]
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                p = est.fit(Xtr, ytr).predict_proba(Xte)[:, 1]
        out.append({"algorithm": name, "auc": float(roc_auc_score(yte, p))})
        log(f"algorithm {name}: AUC {out[-1]['auc']:.4f} ({time.time() - t:.0f}s)")
    return out


def extended_inputs() -> dict | None:
    path = COHORTS / "chargeoff_extended.csv.gz"
    if not path.exists():
        return None
    df = pd.read_csv(path)
    for col in ("emp_length", "home_ownership"):
        df[col] = df[col].fillna("missing").astype("category")
    cols = [c for c in df.columns if c not in ("charged_off", "split")]
    tr, te = df[df["split"] == "train"], df[df["split"] == "test"]
    m = HistGradientBoostingClassifier(categorical_features="from_dtype", random_state=C.SEED,
                                       **{k: v for k, v in C.HGB_PARAMS.items() if k != "random_state"})
    m.fit(tr[cols], tr["charged_off"])
    value = float(roc_auc_score(te["charged_off"], m.predict_proba(te[cols])[:, 1]))
    log(f"extended inputs ({len(cols)} fields): AUC {value:.4f}")
    return {"auc": value, "fields": cols}


def severity_check(co: pd.DataFrame) -> dict:
    bad = co[co["charged_off"] == 1].dropna(subset=["severity"])
    tr, te = bad[bad["split"] == "train"], bad[bad["split"] == "test"]
    reg = HistGradientBoostingRegressor(max_iter=150, max_leaf_nodes=8, min_samples_leaf=500, random_state=C.SEED)
    reg.fit(tr[X_COLS], tr["severity"])
    r2_model = float(r2_score(te["severity"], reg.predict(te[X_COLS])))
    r2_mean = float(r2_score(te["severity"], np.full(len(te), tr["severity"].mean())))
    return {"mean_severity": float(tr["severity"].mean()), "r2_regression": r2_model, "r2_mean": r2_mean,
            "r2_gain": r2_model - r2_mean}


def main() -> None:
    t0 = time.time()
    elig = pd.read_csv(COHORTS / "eligibility_2016.csv.gz")
    co = pd.read_csv(COHORTS / "chargeoff_36m.csv.gz")
    profiles = nudge_profiles()

    result: dict = {}
    result["variants"], result["behaviour"] = variants(elig, co, profiles)
    result["nudge"] = {"profiles": len(profiles), "loan_pct": 1, "fico_points": 1, "dti_points": 0.5,
                       "eligibility_limit": ELIGIBILITY_JUMP, "risk_limit": RISK_JUMP}
    result["audit"] = audit(elig)
    result["subgroups"] = subgroups(co)
    result["algorithms"] = algorithms(co)
    aucs = [a["auc"] for a in result["algorithms"]]
    result["algorithms_range"] = {"min": min(aucs), "max": max(aucs)}
    result["extended_inputs"] = extended_inputs()
    result["severity"] = severity_check(co)
    result["seconds"] = round(time.time() - t0, 1)
    (ARTIFACTS / "evaluation.json").write_text(json.dumps(result, indent=2))
    log(f"saved evaluation.json in {result['seconds']}s")


if __name__ == "__main__":
    main()
