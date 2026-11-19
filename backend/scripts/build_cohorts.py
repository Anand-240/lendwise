"""Build the two LendWise datasets from the raw LendingClub files (report Section 4.7, Table 4.1).

Inputs (download with scripts/download_data.py):
    data/raw/accepted_2007_to_2018Q4.csv.gz   about 2.26 million funded loans
    data/raw/rejected_2007_to_2018Q4.csv.gz   about 27.6 million rejected applications

Outputs:
    data/cohorts/eligibility_2016.csv.gz       100,000 accepted + 100,000 rejected applications from 2016
    data/cohorts/chargeoff_36m.csv.gz          36-month Fully Paid / Charged Off loans, 2012 to 2015
    data/cohorts/chargeoff_extended.csv.gz     the same loans with extra bureau fields (audit only, not in git)
    data/cohorts/summary.json                  counts, base rates and loss severity

Data preparation (Section 5.4.1): rejected-file columns are renamed to match the accepted file,
the % sign is removed from DTI, the low end of the FICO range is used, and any row with a missing
input or a DTI outside 0 to 100 is dropped.

Usage:  python scripts/build_cohorts.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ml.constants import SEED  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "cohorts"
ACCEPTED = RAW / "accepted_2007_to_2018Q4.csv.gz"
REJECTED = RAW / "rejected_2007_to_2018Q4.csv.gz"

ELIGIBILITY_PER_CLASS = 100_000
CHARGEOFF_TRAIN_MAX = 300_000
CHARGEOFF_TEST_MAX = 100_000

ACCEPTED_COLS = [
    "loan_amnt", "funded_amnt", "term", "issue_d", "loan_status", "dti", "fico_range_low",
    "emp_length", "addr_state", "purpose", "total_rec_prncp", "recoveries", "collection_recovery_fee",
    # extra bureau and income fields, used only for the "more inputs" comparison in the audit
    "annual_inc", "home_ownership", "revol_util", "revol_bal", "inq_last_6mths", "delinq_2yrs",
    "open_acc", "total_acc", "pub_rec", "earliest_cr_line", "mort_acc", "pub_rec_bankruptcies",
]
EXTENDED_NUMERIC = [
    "annual_inc", "revol_util", "revol_bal", "inq_last_6mths", "delinq_2yrs", "open_acc",
    "total_acc", "pub_rec", "mort_acc", "pub_rec_bankruptcies",
]

# The rejected file stores the purpose as a free-text loan title; map titles onto the accepted
# file's purpose codes so the audit can compare them.
TITLE_TO_PURPOSE = {
    "debt consolidation": "debt_consolidation", "debt_consolidation": "debt_consolidation",
    "credit card refinancing": "credit_card", "credit_card": "credit_card",
    "home improvement": "home_improvement", "home_improvement": "home_improvement",
    "major purchase": "major_purchase", "major_purchase": "major_purchase",
    "car financing": "car", "car": "car",
    "medical expenses": "medical", "medical": "medical",
    "moving and relocation": "moving", "moving": "moving",
    "business": "small_business", "business loan": "small_business", "small_business": "small_business",
    "vacation": "vacation", "home buying": "house", "house": "house",
    "green loan": "renewable_energy", "renewable_energy": "renewable_energy",
    "wedding": "wedding", "educational": "educational", "other": "other",
}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def clean_inputs(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows with a missing input or a DTI outside 0 to 100."""
    df = df.dropna(subset=["loan_amount", "fico", "dti"])
    return df[(df["dti"] >= 0) & (df["dti"] <= 100)]


def read_accepted() -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """Return (2016 applications, 36-month 2012 to 2015 finished loans, raw 2016 count)."""
    elig, risk = [], []
    raw_2016 = 0
    reader = pd.read_csv(ACCEPTED, usecols=ACCEPTED_COLS, chunksize=250_000, low_memory=False)
    for i, ch in enumerate(reader):
        ch = ch.dropna(subset=["issue_d"])
        year = pd.to_numeric(ch["issue_d"].str[-4:], errors="coerce")
        ch = ch.assign(
            issue_year=year,
            loan_amount=pd.to_numeric(ch["loan_amnt"], errors="coerce"),
            fico=pd.to_numeric(ch["fico_range_low"], errors="coerce"),
            dti=pd.to_numeric(ch["dti"], errors="coerce"),
        )
        y16 = ch[ch["issue_year"] == 2016]
        raw_2016 += len(y16)
        elig.append(clean_inputs(y16)[["loan_amount", "fico", "dti", "emp_length", "addr_state", "purpose"]]
                    .rename(columns={"addr_state": "state"}))
        mask = (
            ch["term"].astype(str).str.strip().eq("36 months")
            & ch["issue_year"].between(2012, 2015)
            & ch["loan_status"].isin(["Fully Paid", "Charged Off"])
        )
        risk.append(clean_inputs(ch[mask]))
        log(f"accepted chunk {i + 1}: {len(y16):,} from 2016, {int(mask.sum()):,} finished 36-month loans")
    return pd.concat(elig, ignore_index=True), pd.concat(risk, ignore_index=True), raw_2016


def read_rejected_2016() -> tuple[pd.DataFrame, int]:
    parts, raw_2016 = [], 0
    reader = pd.read_csv(REJECTED, chunksize=2_000_000, dtype=str)
    for i, ch in enumerate(reader):
        ch = ch[ch["Application Date"].str[:4] == "2016"]
        raw_2016 += len(ch)
        if ch.empty:
            continue
        df = pd.DataFrame({
            "loan_amount": pd.to_numeric(ch["Amount Requested"], errors="coerce"),
            "fico": pd.to_numeric(ch["Risk_Score"], errors="coerce"),
            "dti": pd.to_numeric(ch["Debt-To-Income Ratio"].str.rstrip("%"), errors="coerce"),
            "emp_length": ch["Employment Length"],
            "state": ch["State"],
            "purpose": ch["Loan Title"].str.strip().str.lower().map(TITLE_TO_PURPOSE).fillna("other"),
        })
        parts.append(clean_inputs(df))
        log(f"rejected chunk {i + 1}: {len(ch):,} from 2016")
    return pd.concat(parts, ignore_index=True), raw_2016


def build_eligibility(acc16: pd.DataFrame, rej16: pd.DataFrame) -> pd.DataFrame:
    acc = acc16.sample(n=ELIGIBILITY_PER_CLASS, random_state=SEED).assign(accepted=1)
    rej = rej16.sample(n=ELIGIBILITY_PER_CLASS, random_state=SEED).assign(accepted=0)
    df = pd.concat([acc, rej], ignore_index=True)
    train_idx, _ = train_test_split(df.index, test_size=0.2, stratify=df["accepted"], random_state=SEED)
    df["split"] = np.where(df.index.isin(train_idx), "train", "test")
    return df.sample(frac=1.0, random_state=SEED).reset_index(drop=True)


def severity_of(charged_off: pd.DataFrame) -> pd.Series:
    """Share of principal lost on a charged-off loan: principal not repaid, less recoveries."""
    funded = charged_off["funded_amnt"].astype(float)
    lost = funded - charged_off["total_rec_prncp"].astype(float) - charged_off["recoveries"].astype(float)
    return (lost / funded).clip(0, 1)


def credit_history_months(issue_d: pd.Series, earliest: pd.Series) -> pd.Series:
    issued = pd.to_datetime(issue_d, format="%b-%Y", errors="coerce")
    first = pd.to_datetime(earliest, format="%b-%Y", errors="coerce")
    return ((issued - first).dt.days / 30.44).round(0)


def build_chargeoff(risk: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    risk = risk.assign(charged_off=(risk["loan_status"] == "Charged Off").astype(int))
    train = risk[risk["issue_year"].between(2012, 2014)]
    test = risk[risk["issue_year"] == 2015]
    if len(train) > CHARGEOFF_TRAIN_MAX:
        train = train.sample(n=CHARGEOFF_TRAIN_MAX, random_state=SEED)
    if len(test) > CHARGEOFF_TEST_MAX:
        test = test.sample(n=CHARGEOFF_TEST_MAX, random_state=SEED)
    df = pd.concat([train.assign(split="train"), test.assign(split="test")], ignore_index=True)
    df["severity"] = np.where(df["charged_off"] == 1, severity_of(df), np.nan)
    df["credit_history_months"] = credit_history_months(df["issue_d"], df["earliest_cr_line"])
    df["revol_util"] = pd.to_numeric(df["revol_util"].astype(str).str.rstrip("%"), errors="coerce")
    core = df[["loan_amount", "fico", "dti", "charged_off", "issue_year", "split", "severity"]].copy()
    extended = df[["loan_amount", "fico", "dti", "charged_off", "split", "emp_length", "home_ownership",
                   "credit_history_months", *EXTENDED_NUMERIC]].copy()
    return core, extended


def main() -> None:
    for f in (ACCEPTED, REJECTED):
        if not f.exists():
            sys.exit(f"Missing {f.relative_to(ROOT)}. Run: python scripts/download_data.py")
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    acc16, risk, acc16_raw = read_accepted()
    rej16, rej16_raw = read_rejected_2016()
    log(f"2016 after cleaning: {len(acc16):,} accepted, {len(rej16):,} rejected")

    elig = build_eligibility(acc16, rej16)
    core, extended = build_chargeoff(risk)

    # Model columns only, plus the three fields the audit needs.
    elig.to_csv(OUT / "eligibility_2016.csv.gz", index=False, float_format="%.6g")
    core.to_csv(OUT / "chargeoff_36m.csv.gz", index=False, float_format="%.6g")
    extended.to_csv(OUT / "chargeoff_extended.csv.gz", index=False, float_format="%.6g")

    rej_sample = elig[elig["accepted"] == 0]
    summary = {
        "source": "LendingClub accepted and rejected loan files, 2007 to 2018 Q4 (Kaggle: wordsforthewise/lending-club)",
        "eligibility": {
            "rows": len(elig),
            "train_rows": int((elig["split"] == "train").sum()),
            "test_rows": int((elig["split"] == "test").sum()),
            "accepted_2016_raw": int(acc16_raw),
            "rejected_2016_raw": int(rej16_raw),
            "accepted_2016_clean": len(acc16),
            "rejected_2016_clean": len(rej16),
            "real_acceptance_rate": acc16_raw / (acc16_raw + rej16_raw),
            "rejected_emp_lt_1y_share": float((rej_sample["emp_length"] == "< 1 year").mean()),
        },
        "chargeoff": {
            "train_rows": int((core["split"] == "train").sum()),
            "test_rows": int((core["split"] == "test").sum()),
            "train_rate": float(core.loc[core["split"] == "train", "charged_off"].mean()),
            "test_rate": float(core.loc[core["split"] == "test", "charged_off"].mean()),
            "train_years": "2012 to 2014",
            "test_year": "2015",
        },
        "severity": float(core.loc[(core["split"] == "train") & (core["charged_off"] == 1), "severity"].mean()),
        "seed": SEED,
        "build_seconds": round(time.time() - t0, 1),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    log(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
