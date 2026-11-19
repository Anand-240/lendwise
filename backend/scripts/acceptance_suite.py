"""LendWise acceptance suite (report Section 5.4.3).

    python scripts/acceptance_suite.py

Runs on the saved models and the real interface code (the validator, the decision engine and the
FastAPI app that the website calls). It checks bad input values, monotonic behaviour on a grid of
18,720 valid inputs, the policy thresholds, single vs batch scoring, extreme cases, stability, the
reported metrics and end-to-end runs of the interface, then writes app/ml/artifacts/acceptance.json.

Each check ends as PASS, FAIL or WARN. The exit code is 1 if any check fails.
"""
from __future__ import annotations

import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

os.environ["OMP_NUM_THREADS"] = "1"  # same as the API (see app/main.py)
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("JWT_SECRET", "acceptance-suite-secret-at-least-32-bytes")
os.environ["ADMIN_EMAIL"] = "officer@example.com"
os.environ["ADMIN_PASSWORD"] = "Acceptance-Suite-1"
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["RATE_LIMIT_GLOBAL_PER_MINUTE"] = "100000"
os.environ["SCREEN_RATE_LIMIT_PER_MINUTE"] = "100000"

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

import joblib  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.metrics import accuracy_score, brier_score_loss, precision_score, recall_score, roc_auc_score  # noqa: E402

from app.ml import constants as C  # noqa: E402
from app.ml.behaviour import ELIGIBILITY_JUMP, REFERENCE_PROFILES, RISK_JUMP, direction_ok, jumpy_share  # noqa: E402
from app.ml.engine import eligibility_tier, risk_tier  # noqa: E402
from app.ml.registry import Screener  # noqa: E402
from app.ml.validator import InputError, validate  # noqa: E402

ARTIFACTS = ROOT / "app" / "ml" / "artifacts"
COHORTS = ROOT / "data" / "cohorts"
X_COLS = list(C.FEATURES)

CHECKS: list[dict] = []
CASES: list[dict] = []


def check(group: str, name: str):
    """Register a check. The function returns a detail string (PASS), or raises AssertionError
    (FAIL). Returning ("WARN", detail) records a warning."""

    def wrap(fn):
        CHECKS.append({"group": group, "name": name, "fn": fn})
        return fn

    return wrap


# ---- shared state ---------------------------------------------------------------------------------
S = Screener(ARTIFACTS)
S.load()
assert S.ready, f"models did not load: {S.error}"
E = S.engine
META = S.metadata

LOANS = np.arange(1_000, 40_001, 1_000)          # 40 values
FICOS = np.arange(500, 851, 10)                  # 36 values
DTIS = np.arange(0, 61, 5)                       # 13 values
GRID = np.array(np.meshgrid(LOANS, FICOS, DTIS, indexing="ij")).reshape(3, -1).T.astype(float)
GRID_E = E.eligibility.predict_score(GRID)
GRID_P = E.chargeoff.predict_score(GRID)
GRID_FLAGS = E.guard.flags(GRID)


def _reshape(v: np.ndarray) -> np.ndarray:
    return v.reshape(len(LOANS), len(FICOS), len(DTIS))


def _expect_error(payload, field):
    try:
        validate(payload)
    except InputError as exc:
        assert exc.field == field, f"error on {exc.field!r}, expected {field!r}"
        assert exc.message and "\n" not in exc.message
        return exc.message
    raise AssertionError(f"accepted {payload!r}")


OK = {"loan_amount": 15000, "fico": 700, "dti": 15}

# ---- 1. Input validation (about 125 bad values) ---------------------------------------------------
BAD_VALUES = {
    "blank": ["", "   ", "\t", None],
    "boolean": [True, False],
    "not finite": [float("nan"), float("inf"), float("-inf"), "nan", "NaN", "inf", "-Infinity", 1e400],
    "text": ["abc", "12abc", "1e", "--5", "one", "0x10", "5 5", "N/A", "null", "1/2", "\u221e"],
    "wrong type": [[], {}, [15000], {"v": 1}, (1,), object()],
}
OUT_OF_RANGE = {
    "loan_amount": [0, 1, 499, 499.99, -500, 40000.01, 45000, 1e7],
    "fico": [0, 299, -700, 851, 900, 10000],
    "dti": [-0.01, -1, -50, 100.01, 150, 9999, 99999],
}
BAD_COUNT = 0
for _field in ("loan_amount", "fico", "dti"):
    for _kind, _values in BAD_VALUES.items():
        BAD_COUNT += len(_values)

        @check("Input validation", f"{_field}: rejects {_kind} values")
        def _bad(field=_field, values=_values):
            for v in values:
                _expect_error({**OK, field: v}, field)
            return f"{len(values)} values rejected"

    BAD_COUNT += len(OUT_OF_RANGE[_field])

    @check("Input validation", f"{_field}: rejects out-of-range values")
    def _range(field=_field):
        for v in OUT_OF_RANGE[field]:
            msg = _expect_error({**OK, field: v}, field)
            assert "between" in msg
        return f"{len(OUT_OF_RANGE[field])} values rejected"


@check("Input validation", "fico: rejects values that are not whole numbers (TC-02)")
def _fico_whole():
    for v in (659.5, 700.1, "700.5", 849.999):
        assert "whole number" in _expect_error({**OK, "fico": v}, "fico")
    CASES.append({"id": "TC-02", "input": "FICO = 659.5", "expected": "Rejected: FICO must be a whole number",
                  "actual": _expect_error({**OK, "fico": 659.5}, "fico")})
    return "4 values rejected"


@check("Input validation", "dti: accepts an optional % sign (TC-03)")
def _dti_pct():
    assert validate({**OK, "dti": "18%"})["dti"] == 18
    assert validate({**OK, "dti": " 18.5 % "})["dti"] == 18.5
    CASES.append({"id": "TC-03", "input": 'DTI = "18%"', "expected": "Accepted as 18", "actual": f"Accepted as {validate({**OK, 'dti': '18%'})['dti']:g}"})
    return '"18%" -> 18'


@check("Input validation", "loan amount accepts numeric text")
def _loan_text():
    assert validate({**OK, "loan_amount": "15000"})["loan_amount"] == 15000
    assert validate({**OK, "loan_amount": "$15,000.50"})["loan_amount"] == 15000.5
    return '"$15,000.50" -> 15000.5'


@check("Input validation", "boundary values are accepted")
def _bounds():
    validate({"loan_amount": C.LOAN_MIN, "fico": C.FICO_MIN, "dti": C.DTI_MIN})
    validate({"loan_amount": C.LOAN_MAX, "fico": C.FICO_MAX, "dti": C.DTI_MAX})
    return "500/300/0 and 40,000/850/100 accepted"


@check("Input validation", "missing keys give a validation error, not a crash (TC-07)")
def _missing():
    for key in X_COLS:
        _expect_error({k: v for k, v in OK.items() if k != key}, key)
    CASES.append({"id": "TC-07", "input": "Missing input key", "expected": "Validation error, no crash",
                  "actual": _expect_error({"loan_amount": 15000, "fico": 700}, "dti")})
    return "3 keys checked"


@check("Input validation", "wrong containers are rejected")
def _containers():
    for payload in (None, [15000, 700, 15], "15000,700,15", 42, (15000, 700, 15)):
        _expect_error(payload, None)
    return "5 containers rejected"


@check("Input validation", "extra keys are ignored")
def _extra():
    assert validate({**OK, "income": 1, "note": "x"}) == {"loan_amount": 15000.0, "fico": 700, "dti": 15.0}
    return "ok"


# ---- 2. Saved models --------------------------------------------------------------------------------
@check("Saved models", "artifacts load and metadata is complete")
def _artifacts():
    for key in ("model_version", "severity", "thresholds", "guard", "metrics", "features"):
        assert key in META, key
    assert META["features"] == X_COLS
    return META["model_version"]


@check("Saved models", "save, reload and score again gives the same outputs (TC-09)")
def _reload():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "model.joblib"
        joblib.dump(E.eligibility.estimator_, path)
        again = joblib.load(path).predict_proba(GRID[:2000])[:, 1] * 100
    assert np.array_equal(again, GRID_E[:2000])
    CASES.append({"id": "TC-09", "input": "Save, reload and score again", "expected": "Same outputs", "actual": "Identical on 2,000 inputs"})
    return "identical on 2,000 inputs"


@check("Saved models", "monotonic constraints are stored in both models")
def _cst_stored():
    for model, cst in ((E.eligibility, C.ELIGIBILITY_CST), (E.chargeoff, C.CHARGEOFF_CST)):
        for cc in model.estimator_.calibrated_classifiers_:
            assert list(cc.estimator.monotonic_cst) == list(cst)
    return "[-1, +1, -1] and [+1, -1, +1]"


@check("Saved models", "both models use 3-fold sigmoid calibration")
def _calibration():
    for model in (E.eligibility, E.chargeoff):
        assert len(model.estimator_.calibrated_classifiers_) == C.CALIBRATION_FOLDS
        assert model.estimator_.method == "sigmoid"
    return "3 calibrated folds each"


# ---- 3. Output ranges and monotonic behaviour on 18,720 inputs -----------------------------------
@check("Behaviour", f"eligibility score stays within 0 to 100 on {len(GRID):,} inputs (TC-01)")
def _range_e():
    assert GRID_E.min() >= 0 and GRID_E.max() <= 100
    return f"min {GRID_E.min():.2f}, max {GRID_E.max():.2f}"


@check("Behaviour", f"default probability stays within 0 to 100 on {len(GRID):,} inputs (TC-01)")
def _range_p():
    assert GRID_P.min() >= 0 and GRID_P.max() <= 100
    return f"min {GRID_P.min():.2f}, max {GRID_P.max():.2f}"


for _model, _values, _cst in (("eligibility", "GRID_E", C.ELIGIBILITY_CST), ("charge-off", "GRID_P", C.CHARGEOFF_CST)):
    for _axis, _name in enumerate(("loan amount", "FICO", "DTI")):

        @check("Behaviour", f"{_model}: grid never moves against the {_name} constraint")
        def _mono(values=_values, axis=_axis, sign=_cst[_axis]):
            cube = _reshape(globals()[values])
            diffs = np.diff(cube, axis=axis) * sign
            bad = int((diffs < -1e-9).sum())
            assert bad == 0, f"{bad} violations"
            return f"{diffs.size:,} neighbouring pairs, 0 violations"


_DIR_WORD = {1: "rise", -1: "fall"}
for _model_name, _attr, _cst in (("eligibility", "eligibility", C.ELIGIBILITY_CST), ("charge-off", "chargeoff", C.CHARGEOFF_CST)):
    for _j, _f in enumerate(X_COLS):
        for _p in REFERENCE_PROFILES:
            _fixed = ", ".join(f"{C.FEATURE_LABELS[k]} {v:,}" for k, v in _p.items() if k != _f)

            @check("Behaviour checks (24)",
                   f"{_model_name}: score can only {_DIR_WORD[_cst[_j]]} with {C.FEATURE_LABELS[_f]} ({_fixed})")
            def _direction(attr=_attr, j=_j, f=_f, p=_p, cst=_cst):
                ok, worst = direction_ok(getattr(E, attr), p, f, cst[j], tolerance=0.0)
                assert ok, f"moved {worst:.3f} points the wrong way"
                return "never moves the wrong way"


# ---- 4. Policy thresholds ---------------------------------------------------------------------------
@check("Policy", "loss severity matches the training data (about 50.3%)")
def _severity():
    co = pd.read_csv(COHORTS / "chargeoff_36m.csv.gz")
    measured = co.loc[(co["split"] == "train") & (co["charged_off"] == 1), "severity"].mean()
    assert abs(measured - META["severity"]) < 1e-3 and 0.45 < measured < 0.55
    return f"{measured:.2%}"


@check("Policy", "expected-loss thresholds are 11.07% and 6.04%")
def _el():
    assert round(E.el_reject, 2) == 11.07 and round(E.el_approve, 2) == 6.04
    return f"reject above {E.el_reject:.2f}%, approve up to {E.el_approve:.2f}%"


@check("Policy", "eligibility below 40 is always rejected")
def _rule_e40():
    for e in (0, 20, 39.99):
        for pd_pct in (1, 10, 30):
            for flag in (False, True):
                assert E.decide(e, pd_pct, flag).decision == "REJECT"
    return "18 combinations"


@check("Policy", "expected loss above 11.07% is rejected")
def _rule_el():
    assert E.decide(90, 22.01, False).decision == "REJECT"
    assert E.decide(90, 22.0, False).decision != "REJECT"
    return "PD 22.01% rejected, 22.00% not"


@check("Policy", "a range-guard flag sends the case to review instead of approval")
def _rule_flag():
    assert E.decide(90, 5, True).decision == "REVIEW" and E.decide(90, 5, False).decision == "APPROVE"
    return "ok"


@check("Policy", "approve only when eligibility >= 75 and expected loss <= 6.04%")
def _rule_approve():
    assert E.decide(75, 12, False).decision == "APPROVE"
    assert E.decide(74.99, 12, False).decision == "REVIEW"
    assert E.decide(75, 12.01, False).decision == "REVIEW"
    return "edges checked"


@check("Policy", f"every decision on the {len(GRID):,}-input grid follows the rules")
def _rule_grid():
    counts = {"APPROVE": 0, "REVIEW": 0, "REJECT": 0}
    for e, p, f in zip(GRID_E, GRID_P, GRID_FLAGS):
        d = E.decide(float(e), float(p), bool(f)).decision
        el = p * E.severity
        if e < 40 or el > E.el_reject:
            assert d == "REJECT"
        elif f:
            assert d == "REVIEW"
        elif e >= 75 and el <= E.el_approve:
            assert d == "APPROVE"
        else:
            assert d == "REVIEW"
        counts[d] += 1
    return ", ".join(f"{k.lower()} {v:,}" for k, v in counts.items())


@check("Policy", "tiers match the decision thresholds")
def _tiers():
    assert [eligibility_tier(x) for x in (39.9, 40, 74.9, 75)] == ["Unlikely", "Borderline", "Borderline", "Likely"]
    assert [risk_tier(x) for x in (12, 12.01, 22, 22.01)] == ["Low", "Moderate", "Moderate", "High"]
    return "Likely/Borderline/Unlikely and Low/Moderate/High"


@check("Policy", "charge-off risk is hidden when eligibility is Unlikely")
def _hidden():
    r = S.screen({"loan_amount": 15000, "fico": 600, "dti": 15})
    assert r["eligibility"]["tier"] == "Unlikely" and r["charge_off"] is None
    return "ok"


# ---- 5. Single vs batch scoring ---------------------------------------------------------------------
_SAMPLE = GRID[np.random.default_rng(C.SEED).choice(len(GRID), 300, replace=False)]


@check("Consistency", "eligibility: single and batch scores are identical")
def _single_e():
    single = np.array([E.eligibility.predict_score(r)[0] for r in _SAMPLE])
    assert np.allclose(single, E.eligibility.predict_score(_SAMPLE), atol=1e-9)
    return "300 rows"


@check("Consistency", "charge-off: single and batch scores are identical")
def _single_p():
    single = np.array([E.chargeoff.predict_score(r)[0] for r in _SAMPLE])
    assert np.allclose(single, E.chargeoff.predict_score(_SAMPLE), atol=1e-9)
    return "300 rows"


@check("Consistency", "range guard: single and batch flags are identical")
def _single_g():
    single = [E.guard.check(r)[0] for r in _SAMPLE]
    assert single == E.guard.check(_SAMPLE)
    return "300 rows"


@check("Consistency", "the interface result matches the batch scores")
def _single_eval():
    for r in _SAMPLE[:60]:
        res = S.screen({"loan_amount": r[0], "fico": int(r[1]), "dti": r[2]}, with_counter_offer=False)
        assert abs(res["raw"]["eligibility"] - E.eligibility.predict_score(r)[0]) < 1e-9
        assert abs(res["raw"]["default_probability"] - E.chargeoff.predict_score(r)[0]) < 1e-9
    return "60 rows"


@check("Consistency", "repeated scoring is deterministic")
def _deterministic():
    assert np.array_equal(E.eligibility.predict_score(GRID), GRID_E)
    assert np.array_equal(E.chargeoff.predict_score(GRID), GRID_P)
    return "grid scored twice"


# ---- 6. Extreme cases -------------------------------------------------------------------------------
_CORNERS = [(l, f, d) for l in (C.LOAN_MIN, C.LOAN_MAX) for f in (C.FICO_MIN, C.FICO_MAX) for d in (C.DTI_MIN, C.DTI_MAX)]
for _c in _CORNERS:

    @check("Extreme cases", f"corner ${_c[0]:,} / FICO {_c[1]} / DTI {_c[2]:g} gives a valid result")
    def _corner(c=_c):
        r = S.screen({"loan_amount": c[0], "fico": c[1], "dti": c[2]})
        assert 0 <= r["eligibility"]["score"] <= 100 and r["decision"] in ("APPROVE", "REVIEW", "REJECT")
        return f"{r['decision'].lower()}, eligibility {r['eligibility']['score']}"


@check("Extreme cases", "FICO 659 vs 660 shows LendingClub's cut-off (TC-08)")
def _cliff():
    lo = S.screen({"loan_amount": 15000, "fico": 659, "dti": 15})
    hi = S.screen({"loan_amount": 15000, "fico": 660, "dti": 15})
    assert lo["eligibility"]["score"] < 40 <= hi["eligibility"]["score"]
    CASES.append({"id": "TC-08", "input": "FICO 659 vs 660 (loan 15000, DTI 15)", "expected": "Eligibility falls below 40 at 659",
                  "actual": f"Eligibility {lo['eligibility']['score']:.1f} vs {hi['eligibility']['score']:.1f}"})
    return f"{lo['eligibility']['score']:.1f} vs {hi['eligibility']['score']:.1f}"


@check("Extreme cases", "high-FICO, low-DTI, small loan is approved")
def _best():
    r = S.screen({"loan_amount": 5000, "fico": 780, "dti": 5})
    assert r["decision"] == "APPROVE", r["decision"]
    return f"eligibility {r['eligibility']['score']}, PD {r['charge_off']['probability']}%"


@check("Extreme cases", "the raw models accept NaN and infinity, so the validator must sit in front")
def _nan_models():
    out = E.eligibility.predict_score(np.array([[np.nan, 700, 15], [15000, np.inf, 15]]))
    if np.isfinite(out).all():
        return ("WARN", "models returned scores for NaN/inf inputs; only the validator stops them")
    return "models reject NaN/inf"


# ---- 7. Stability (nudge test) ----------------------------------------------------------------------
@check("Stability", "eligibility: at most 1% of 551 profiles jump by more than 10 points")
def _jumpy_e():
    share = jumpy_share(E.eligibility, ELIGIBILITY_JUMP)
    assert share <= 0.01, f"{share:.1%}"
    return f"{share:.1%} of 551 profiles"


@check("Stability", "charge-off: at most 1% of 551 profiles jump by more than 3 points")
def _jumpy_p():
    share = jumpy_share(E.chargeoff, RISK_JUMP)
    assert share <= 0.01, f"{share:.1%}"
    return f"{share:.1%} of 551 profiles"


# ---- 8. Reported metrics ----------------------------------------------------------------------------
ELIG = pd.read_csv(COHORTS / "eligibility_2016.csv.gz")
CO = pd.read_csv(COHORTS / "chargeoff_36m.csv.gz")
ETE, CTR, CTE = ELIG[ELIG["split"] == "test"], CO[CO["split"] == "train"], CO[CO["split"] == "test"]
P_E = E.eligibility.predict_proba(ETE[X_COLS])
P_C = E.chargeoff.predict_proba(CTE[X_COLS])
ME, MC = META["metrics"]["eligibility"], META["metrics"]["chargeoff"]


@check("Reported metrics", "eligibility hold-out AUC matches the reported value")
def _m_e_auc():
    auc = roc_auc_score(ETE["accepted"], P_E)
    assert abs(auc - ME["roc_auc"]) < 1e-6 and auc > 0.88
    return f"{auc:.4f}"


@check("Reported metrics", "eligibility accuracy, precision and recall at 50% match")
def _m_e_apr():
    pred = (P_E >= 0.5).astype(int)
    got = (accuracy_score(ETE["accepted"], pred), precision_score(ETE["accepted"], pred), recall_score(ETE["accepted"], pred))
    assert np.allclose(got, (ME["accuracy"], ME["precision"], ME["recall"]), atol=1e-6)
    return " / ".join(f"{x:.3f}" for x in got)


@check("Reported metrics", "eligibility agrees with the lender rule on at least 99% of applications")
def _m_rule():
    rule = ((ETE["fico"] >= 660) & (ETE["dti"] <= 35) & (ETE["loan_amount"] < 40000)).astype(int).to_numpy()
    agree = float(((P_E >= 0.5).astype(int) == rule).mean())
    assert agree >= 0.99 and abs(agree - ME["rule_agreement"]) < 1e-9
    return f"{agree:.1%}"


@check("Reported metrics", "charge-off AUC on the 2015 test year matches the reported value")
def _m_c_auc():
    auc = roc_auc_score(CTE["charged_off"], P_C)
    assert abs(auc - MC["roc_auc"]) < 1e-6 and 0.6 < auc < 0.7
    return f"{auc:.4f}"


@check("Reported metrics", "mean predicted default rate is within 2 points of the observed rate")
def _m_mean():
    pred, obs = P_C.mean() * 100, CTE["charged_off"].mean() * 100
    assert abs(pred - obs) < 2
    return f"{pred:.1f}% vs {obs:.1f}%"


@check("Reported metrics", "Brier score beats the base-rate forecast")
def _m_brier():
    model = brier_score_loss(CTE["charged_off"], P_C)
    base = brier_score_loss(CTE["charged_off"], np.full(len(P_C), CTR["charged_off"].mean()))
    assert model < base
    return f"{model:.4f} vs {base:.4f}"


@check("Reported metrics", "no risk decile is off by more than 3 percentage points")
def _m_deciles():
    gap = max(abs(d["predicted"] - d["observed"]) for d in MC["deciles"])
    assert gap <= 3
    return f"largest gap {gap:.1f} points"


@check("Reported metrics", "observed default rate rises across the risk deciles")
def _m_rising():
    obs = [d["observed"] for d in MC["deciles"]]
    assert obs[-1] > obs[0] * 3 and sum(b >= a for a, b in zip(obs, obs[1:])) >= 8
    return f"{obs[0]:.1f}% to {obs[-1]:.1f}%"


@check("Reported metrics", "the risk model is trained on 2012 to 2014 and tested on 2015 only")
def _m_years():
    assert set(CTR["issue_year"]) == {2012, 2013, 2014} and set(CTE["issue_year"]) == {2015}
    assert len(CTR) == 300_000 and len(CTE) == 100_000
    return f"{len(CTR):,} train, {len(CTE):,} test"


@check("Reported metrics", "eligibility data is a 50/50 sample of 2016 with an 80:20 split")
def _m_split():
    assert len(ELIG) == 200_000 and ELIG["accepted"].mean() == 0.5
    assert abs((ELIG["split"] == "test").mean() - 0.2) < 1e-9 and ETE["accepted"].mean() == 0.5
    return "100,000 + 100,000; 160,000 / 40,000"


# ---- 9. Range guard ---------------------------------------------------------------------------------
@check("Range guard", "limits are the 0.1st and 99.9th percentiles of the training loans")
def _g_limits():
    for i, f in enumerate(X_COLS):
        lo, hi = np.quantile(CTR[f], [C.GUARD_LOWER_Q, C.GUARD_UPPER_Q])
        assert abs(lo - E.guard.limits[f][0]) < 1e-9 and abs(hi - E.guard.limits[f][1]) < 1e-9
    return "; ".join(f"{f} {E.guard.limits[f][0]:g} to {E.guard.limits[f][1]:g}" for f in X_COLS)


@check("Range guard", "inputs outside the training range are flagged")
def _g_flags():
    hi_loan = E.guard.limits["loan_amount"][1] + 1
    assert E.guard.check([[hi_loan, 700, 15]])[0]
    assert not E.guard.check([[15000, 700, 15]])[0]
    return f"${hi_loan:,.0f} flagged, $15,000 not"


@check("Range guard", "the Isolation Forest flags about 1% of training loans or fewer")
def _g_rate():
    rate = float(E.guard.flags(CTR[X_COLS].sample(20000, random_state=C.SEED)).mean())
    assert rate <= 0.015
    return f"{rate:.2%}"


@check("Range guard", "a flag never causes a rejection on its own")
def _g_never_rejects():
    n = 0
    for e, p, f in zip(GRID_E, GRID_P, GRID_FLAGS):
        if f and e >= 40 and p * E.severity <= E.el_reject:
            assert E.decide(float(e), float(p), True).decision == "REVIEW"
            n += 1
    return f"{n:,} flagged grid inputs went to review"


# ---- 10. Counter-offer ------------------------------------------------------------------------------
@check("Counter-offer", "offers are smaller, in $500 steps, and approved by the rules")
def _co_valid():
    n = 0
    for loan, fico, dti in ((35000, 690, 25), (30000, 700, 20), (25000, 680, 30), (20000, 670, 28), (39000, 720, 33)):
        r = S.screen({"loan_amount": loan, "fico": fico, "dti": dti})
        offer = r["counter_offer"]
        if offer:
            n += 1
            assert offer["loan_amount"] < loan and (loan - offer["loan_amount"]) % C.COUNTER_OFFER_STEP == 0
            assert S.screen({"loan_amount": offer["loan_amount"], "fico": fico, "dti": dti})["decision"] == "APPROVE"
    assert n >= 1
    return f"{n} offers checked"


@check("Counter-offer", "the offer is the largest approved amount")
def _co_largest():
    r = S.screen({"loan_amount": 35000, "fico": 690, "dti": 25})
    offer = r["counter_offer"]
    assert offer is not None
    above = offer["loan_amount"] + C.COUNTER_OFFER_STEP
    if above < 35000:
        assert S.screen({"loan_amount": above, "fico": 690, "dti": 25}, with_counter_offer=False)["decision"] != "APPROVE"
    return f"${offer['loan_amount']:,.0f} approved, ${above:,.0f} not"


@check("Counter-offer", "approved applications get no counter-offer")
def _co_none():
    r = S.screen({"loan_amount": 5000, "fico": 780, "dti": 5})
    assert r["decision"] == "APPROVE" and r["counter_offer"] is None
    return "ok"


# ---- 11. End-to-end through the API the website uses -------------------------------------------
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

CLIENT = TestClient(app)
CLIENT.__enter__()


def _post(payload):
    return CLIENT.post("/api/v1/screen", json=payload)


@check("Interface", "TC-01: a valid application returns both outputs within 0 to 100")
def _tc01():
    b = _post({"loan_amount": 15000, "fico": 700, "dti": 15}).json()
    assert 0 <= b["eligibility"]["score"] <= 100 and 0 <= b["charge_off"]["probability"] <= 100
    CASES.insert(0, {"id": "TC-01", "input": "Loan 15000, FICO 700, DTI 15", "expected": "Both outputs within 0 to 100",
                     "actual": f"Eligibility {b['eligibility']['score']}, PD {b['charge_off']['probability']}%, {b['decision'].lower()}"})
    return f"eligibility {b['eligibility']['score']}, PD {b['charge_off']['probability']}%"


for _tc, _payload, _field, _label, _expected in (
    ("TC-02", {"loan_amount": 15000, "fico": 659.5, "dti": 15}, "fico", None, None),
    ("TC-04", {"loan_amount": 15000, "fico": 700, "dti": True}, "dti", "DTI = True", "Rejected as invalid type"),
    ("TC-05", {"loan_amount": 45000, "fico": 700, "dti": 15}, "loan_amount", "Loan amount = 45000", "Rejected: out of range"),
    ("TC-06", {"loan_amount": "", "fico": 700, "dti": float("nan")}, "loan_amount", "Blank, NaN or infinity", "One error message"),
    ("TC-07", {"loan_amount": 15000, "fico": 700}, "dti", None, None),
):

    @check("Interface", f"{_tc}: the API answers {_field or 'input'} errors with one message and no scores")
    def _tc_err(payload=_payload, field=_field, tc=_tc, label=_label, expected=_expected):
        body = json.dumps(payload, allow_nan=True)
        r = CLIENT.post("/api/v1/screen", content=body, headers={"content-type": "application/json"})
        assert r.status_code == 422
        err = r.json()["error"]
        assert len(err["details"]) == 1 and err["details"][0]["field"] == field
        assert "eligibility" not in r.json()
        if label:
            CASES.append({"id": tc, "input": label, "expected": expected, "actual": err["message"]})
        return err["message"]


@check("Interface", "TC-08: the API shows the FICO cut-off")
def _tc08_api():
    lo = _post({"loan_amount": 15000, "fico": 659, "dti": 15}).json()
    hi = _post({"loan_amount": 15000, "fico": 660, "dti": 15}).json()
    assert lo["decision"] == "REJECT" and hi["eligibility"]["tier"] == "Likely"
    return f"659 {lo['decision'].lower()}, 660 {hi['eligibility']['tier'].lower()}"


@check("Interface", "TC-10: 200 quick submissions each get their own result")
def _tc10():
    rng = np.random.default_rng(C.SEED)
    payloads = []
    for i in range(200):
        if i % 4 == 3:
            payloads.append({"loan_amount": 15000, "fico": 659.5, "dti": 15})
        else:
            payloads.append({"loan_amount": float(rng.integers(1, 80) * 500), "fico": int(rng.integers(600, 850)), "dti": float(rng.integers(0, 40))})
    with ThreadPoolExecutor(max_workers=16) as pool:
        responses = list(pool.map(_post, payloads))
    for p, r in zip(payloads, responses):
        if p["fico"] == 659.5:
            assert r.status_code == 422 and "eligibility" not in r.json()
        else:
            assert r.status_code == 200 and r.json()["inputs"] == {"loan_amount": p["loan_amount"], "fico": p["fico"], "dti": p["dti"]}
    detail = "200 concurrent requests matched to their own inputs"
    ui = _ui_state_test()
    if ui is not None:
        detail += f"; {ui}"
    CASES.append({"id": "TC-10", "input": "200 quick submissions", "expected": "No old results left on screen", "actual": detail})
    return detail


def _ui_state_test() -> str | None:
    """Runs the web form's own stale-result test (frontend/tests/screen-state.test.ts) when Node is available."""
    node = shutil.which("node")
    test = REPO / "frontend" / "tests" / "screen-state.test.ts"
    if not node or not test.exists():
        return None
    out = subprocess.run([node, "--experimental-strip-types", "--no-warnings", "--test", str(test)],
                         capture_output=True, text=True, cwd=REPO / "frontend", timeout=120)
    assert out.returncode == 0, out.stdout[-500:] + out.stderr[-500:]
    return "web form state test passed"


@check("Interface", "an application can be submitted, tracked and decided by an officer")
def _flow():
    created = CLIENT.post("/api/v1/applications", json={"full_name": "Acceptance Test", "email": "accept@example.com",
                                                        "purpose": "Car", "consent": True, "loan_amount": 5000, "fico": 760, "dti": 8})
    assert created.status_code == 201, created.text
    aid = created.json()["application_id"]
    assert CLIENT.get(f"/api/v1/applications/{aid}/status", params={"email": "accept@example.com"}).status_code == 200
    tok = CLIENT.post("/api/v1/admin/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]}).json()["access_token"]
    done = CLIENT.patch(f"/api/v1/admin/applications/{aid}", json={"action": "approve"}, headers={"Authorization": f"Bearer {tok}"})
    assert done.status_code == 200 and done.json()["final_decision"] == "APPROVED"
    return f"{aid} approved by the officer"


@check("Interface", "a malformed request body is rejected with one message")
def _malformed():
    r = CLIENT.post("/api/v1/screen", content="{loan_amount: 15000", headers={"content-type": "application/json"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    return r.json()["error"]["message"]


@check("Interface", "officer pages require a login")
def _officer_auth():
    assert CLIENT.get("/api/v1/admin/applications").status_code == 401
    assert CLIENT.get("/api/v1/admin/stats", headers={"Authorization": "Bearer forged"}).status_code == 401
    return "401 without a valid token"


@check("Interface", "median response time is under 50 ms")
def _latency():
    times = []
    rng = np.random.default_rng(C.SEED)
    for _ in range(200):
        payload = {"loan_amount": float(rng.integers(1, 80) * 500), "fico": int(rng.integers(600, 850)), "dti": float(rng.integers(0, 40))}
        t = time.perf_counter()
        assert _post(payload).status_code == 200
        times.append((time.perf_counter() - t) * 1000)
    median = statistics.median(times)
    assert median < 50, f"median {median:.1f} ms"
    return f"median {median:.1f} ms over 200 requests"


@check("Interface", "health check reports the models as live")
def _health():
    h = CLIENT.get("/api/v1/health").json()
    assert h["mode"] == "live" and h["model_version"] == META["model_version"]
    return h["model_version"]


# ---- runner -----------------------------------------------------------------------------------------
def main() -> None:
    start = time.time()
    results = []
    for i, c in enumerate(CHECKS, 1):
        t = time.time()
        try:
            out = c["fn"]()
            status, detail = out if isinstance(out, tuple) else ("PASS", out)
        except AssertionError as exc:
            status, detail = "FAIL", str(exc) or "assertion failed"
        except Exception as exc:  # a crash is a failure too
            status, detail = "FAIL", f"{type(exc).__name__}: {exc}"
            traceback.print_exc()
        results.append({"id": i, "group": c["group"], "name": c["name"], "status": status, "detail": str(detail),
                        "seconds": round(time.time() - t, 3)})
        print(f"{status:4}  {i:3}. [{c['group']}] {c['name']}: {detail}", flush=True)
    CLIENT.__exit__(None, None, None)

    order = ["TC-01", "TC-02", "TC-03", "TC-04", "TC-05", "TC-06", "TC-07", "TC-08", "TC-09", "TC-10"]
    seen, cases = set(), []
    for tc in order:
        for case in CASES:
            if case["id"] == tc and tc not in seen:
                seen.add(tc)
                cases.append({**case, "status": "Pass"})
    summary = {
        "passed": sum(r["status"] == "PASS" for r in results),
        "failed": sum(r["status"] == "FAIL" for r in results),
        "warnings": sum(r["status"] == "WARN" for r in results),
        "total": len(results),
        "bad_values": BAD_COUNT + 4 + 3 + 5,
        "grid_size": len(GRID),
        "seconds": round(time.time() - start, 1),
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_version": META["model_version"],
    }
    (ARTIFACTS / "acceptance.json").write_text(json.dumps({"summary": summary, "test_cases": cases, "checks": results}, indent=2))
    print(f"\n{summary['passed']} passed, {summary['failed']} failed, {summary['warnings']} warning(s) "
          f"in {summary['seconds']}s ({summary['bad_values']} bad input values, {summary['grid_size']:,}-input grid)")
    sys.exit(1 if summary["failed"] else 0)


if __name__ == "__main__":
    main()
