"""Pure preprocessing functions that replicate the training notebook exactly.

Nothing in here holds state; the fitted scaler and the feature column list are
passed in by the caller (see predictor.py).
"""
from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

CATEGORICAL = [
    "Married/Single",
    "House_Ownership",
    "Car_Ownership",
    "Profession",
    "CITY",
    "STATE",
    "Age_Group",
]

# Only these columns are scaled. Long_Term_Resident / Stable_Employee are binary and left as-is.
NUMERIC_COLS = [
    "Income",
    "Age",
    "Experience",
    "CURRENT_JOB_YRS",
    "CURRENT_HOUSE_YRS",
    "Income_per_Experience",
    "Career_Stability",
    "Experience_Ratio",
    "Financial_Maturity",
    "Career_Start_Age",
]

# The first 12 model columns, in model order (numeric + binary engineered flags).
BASE_FEATURES = [
    "Income",
    "Age",
    "Experience",
    "CURRENT_JOB_YRS",
    "CURRENT_HOUSE_YRS",
    "Income_per_Experience",
    "Career_Stability",
    "Experience_Ratio",
    "Financial_Maturity",
    "Long_Term_Resident",
    "Career_Start_Age",
    "Stable_Employee",
]

# Raw model inputs as they appear in the dataset (API field name -> dataset column).
RAW_INPUT_COLUMNS = [
    "Income",
    "Age",
    "Experience",
    "Married/Single",
    "House_Ownership",
    "Car_Ownership",
    "Profession",
    "CITY",
    "STATE",
    "CURRENT_JOB_YRS",
    "CURRENT_HOUSE_YRS",
]

AGE_BINS = [20, 30, 40, 50, 60, 80]
AGE_LABELS = ["20s", "30s", "40s", "50s", "60+"]

_BAD_CHARS = re.compile(r"[\[\]<]")


def clean_column_name(name: str) -> str:
    """Remove the characters the notebook stripped from one-hot column names."""
    return _BAD_CHARS.sub("", str(name))


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Income_per_Experience"] = df["Income"] / (df["Experience"] + 1)
    df["Age_Group"] = pd.cut(df["Age"], bins=AGE_BINS, labels=AGE_LABELS)
    df["Career_Stability"] = df["CURRENT_JOB_YRS"] + df["CURRENT_HOUSE_YRS"]
    df["Experience_Ratio"] = df["Experience"] / df["Age"]
    df["Financial_Maturity"] = df["Age"] * df["CURRENT_JOB_YRS"]
    df["Long_Term_Resident"] = (df["CURRENT_HOUSE_YRS"] >= 12).astype(int)
    df["Career_Start_Age"] = df["Age"] - df["Experience"]
    df["Stable_Employee"] = (df["CURRENT_JOB_YRS"] >= 5).astype(int)
    return df


def age_group(age: float) -> str | None:
    """Age_Group label exactly as pd.cut produces it (right-inclusive bins)."""
    value = pd.cut(pd.Series([age]), bins=AGE_BINS, labels=AGE_LABELS).iloc[0]
    return None if pd.isna(value) else str(value)


def batch_encode(df: pd.DataFrame) -> pd.DataFrame:
    """Training-time pipeline: engineer features, one-hot encode, clean names.

    `df` must contain the raw dataset columns (Risk_Flag / Id optional).
    """
    df = engineer_features(df)
    X = df.drop(columns=[c for c in ("Risk_Flag", "Id") if c in df.columns])
    X = pd.get_dummies(X, columns=CATEGORICAL, drop_first=True)
    X.columns = [clean_column_name(c) for c in X.columns]
    return X


def build_raw_frame(inputs: Mapping[str, Any]) -> pd.DataFrame:
    """One-row DataFrame of raw model inputs, keyed by dataset column names."""
    return pd.DataFrame([{col: inputs[col] for col in RAW_INPUT_COLUMNS}])


def encode_single(
    inputs: Mapping[str, Any], feature_columns: Sequence[str]
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Encode one applicant into an unscaled row over `feature_columns`.

    Never calls get_dummies on a single row (that would drop the wrong baseline).
    Returns (unscaled one-row float frame, engineered feature dict for display).
    """
    engineered = engineer_features(build_raw_frame(inputs))
    row = engineered.iloc[0]

    index = {name: i for i, name in enumerate(feature_columns)}
    vector = np.zeros(len(feature_columns), dtype=float)

    for col in BASE_FEATURES:
        vector[index[col]] = float(row[col])

    for col in CATEGORICAL:
        value = row[col]
        if pd.isna(value):
            raise ValueError(f"{col} could not be derived for the given inputs")
        name = clean_column_name(f"{col}_{value}")
        # Unknown name means the value is the dropped-first baseline: leave all zeros.
        if name in index:
            vector[index[name]] = 1.0

    frame = pd.DataFrame([vector], columns=list(feature_columns))
    features = {
        col: (row[col].item() if hasattr(row[col], "item") else row[col])
        for col in BASE_FEATURES
    }
    features["Age_Group"] = str(row["Age_Group"])
    return frame, features


def scale(frame: pd.DataFrame, scaler) -> pd.DataFrame:
    """Apply the fitted StandardScaler to NUMERIC_COLS only."""
    frame = frame.copy()
    frame[NUMERIC_COLS] = scaler.transform(frame[NUMERIC_COLS])
    return frame.astype(float)


def transform_single(
    inputs: Mapping[str, Any], feature_columns: Sequence[str], scaler
) -> tuple[pd.DataFrame, dict[str, Any]]:
    frame, features = encode_single(inputs, feature_columns)
    return scale(frame, scaler)[list(feature_columns)], features
