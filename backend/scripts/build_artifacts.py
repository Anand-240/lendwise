"""Rebuild the StandardScaler the notebook never saved, verify it against the
trained model, and write scaler.pkl, feature_columns.json and metadata.json.

Usage (from backend/):  python scripts/build_artifacts.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.ml.preprocessing import (  # noqa: E402
    CATEGORICAL,
    NUMERIC_COLS,
    clean_column_name,
    engineer_features,
)

DATA_PATH = BACKEND / "data" / "Training Data.csv"
ARTIFACTS = BACKEND / "app" / "ml" / "artifacts"
MODEL_PATH = Path(os.getenv("MODEL_PATH", ARTIFACTS / "model.pkl"))
if not MODEL_PATH.is_absolute():
    MODEL_PATH = BACKEND / MODEL_PATH
KAGGLE_DATASET = "subhamjain/loan-prediction-based-on-customer-behavior"

EXPECTED = {"accuracy": 0.893, "precision": 0.546, "recall": 0.768, "f1": 0.638, "roc_auc": 0.851}
ACCURACY_TOLERANCE = 0.01

# Raw inputs shown as form fields, with the dataset column behind each.
NUMERIC_INPUTS = ["Income", "Age", "Experience", "CURRENT_JOB_YRS", "CURRENT_HOUSE_YRS"]
ENGINEERED_NUMERIC = [c for c in NUMERIC_COLS if c not in NUMERIC_INPUTS]
FORM_CATEGORICAL = [c for c in CATEGORICAL if c != "Age_Group"]


def fail(msg: str) -> None:
    print(f"\n[FAIL] {msg}", file=sys.stderr)
    sys.exit(1)


def ensure_dataset() -> None:
    if DATA_PATH.exists():
        return
    if os.getenv("KAGGLE_USERNAME") and os.getenv("KAGGLE_KEY"):
        print(f"Dataset missing; downloading {KAGGLE_DATASET} via the Kaggle API ...")
        from kaggle.api.kaggle_api_extended import KaggleApi

        api = KaggleApi()
        api.authenticate()
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        api.dataset_download_file(KAGGLE_DATASET, "Training Data.csv", path=str(DATA_PATH.parent))
        zipped = DATA_PATH.parent / "Training%20Data.csv.zip"
        for candidate in (zipped, DATA_PATH.with_suffix(".csv.zip")):
            if candidate.exists():
                import zipfile

                with zipfile.ZipFile(candidate) as zf:
                    zf.extractall(DATA_PATH.parent)
                candidate.unlink()
        if DATA_PATH.exists():
            return
        fail("Kaggle download finished but 'Training Data.csv' was not found.")
    fail(
        f"Training data not found at {DATA_PATH}.\n"
        f"  Either download 'Training Data.csv' from https://www.kaggle.com/datasets/{KAGGLE_DATASET}\n"
        "  and place it at backend/data/Training Data.csv, or set KAGGLE_USERNAME and KAGGLE_KEY\n"
        "  so this script can download it for you."
    )


FRIENDLY_LABELS = {
    "norent_noown": "Neither owned nor rented",
    "owned": "Owned",
    "rented": "Rented",
    "married": "Married",
    "single": "Single",
    "yes": "Yes",
    "no": "No",
}


def display_label(raw: str) -> str:
    if raw in FRIENDLY_LABELS:
        return FRIENDLY_LABELS[raw]
    label = re.sub(r"\[\d+\]", "", str(raw)).replace("_", " ")
    label = re.sub(r"\s+", " ", label).strip()
    return label[:1].upper() + label[1:]


def build_options(df: pd.DataFrame) -> dict[str, list[dict[str, str]]]:
    options: dict[str, list[dict[str, str]]] = {}
    for col in FORM_CATEGORICAL:
        values = sorted(df[col].dropna().unique().tolist(), key=lambda v: display_label(v).lower())
        items = [{"value": v, "label": display_label(v)} for v in values]
        counts = pd.Series([i["label"] for i in items]).value_counts()
        for item in items:
            if counts[item["label"]] > 1:
                if col == "CITY":
                    states = df.loc[df["CITY"] == item["value"], "STATE"].unique()
                    item["label"] = f"{item['label']} ({display_label(states[0])})"
                elif col == "STATE":
                    # The dominant spelling keeps the plain label; rarer variants list their cities.
                    siblings = [i["value"] for i in items if i["label"] == item["label"]]
                    sizes = {v: df.loc[df["STATE"] == v, "CITY"].nunique() for v in siblings}
                    if sizes[item["value"]] < max(sizes.values()):
                        cities = sorted(display_label(c) for c in df.loc[df["STATE"] == item["value"], "CITY"].unique())
                        item["label"] = f"{item['label']} ({', '.join(cities[:3])})"
                else:
                    item["label"] = f"{item['label']} ({item['value']})"
        # Still ambiguous after appending state: fall back to the raw value.
        counts = pd.Series([i["label"] for i in items]).value_counts()
        for item in items:
            if counts[item["label"]] > 1:
                item["label"] = f"{item['label']} [{item['value']}]"
        options[col] = items
    return options


def main() -> None:
    ensure_dataset()
    if not MODEL_PATH.exists():
        fail(f"Model not found at {MODEL_PATH}")

    print(f"Loading dataset: {DATA_PATH}")
    raw = pd.read_csv(DATA_PATH)
    raw.columns = raw.columns.str.strip()
    raw = raw.drop(columns=["Id"])
    print(f"  rows={len(raw):,}  cols={raw.shape[1]}")

    df = engineer_features(raw)
    X = df.drop("Risk_Flag", axis=1)
    y = df["Risk_Flag"]
    X = pd.get_dummies(X, columns=CATEGORICAL, drop_first=True)
    X.columns = [clean_column_name(c) for c in X.columns]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler().fit(X_train[NUMERIC_COLS])
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, ARTIFACTS / "scaler.pkl")
    print(f"Saved scaler -> {ARTIFACTS / 'scaler.pkl'}")

    print(f"Loading model: {MODEL_PATH}")
    model = joblib.load(MODEL_PATH)
    model_cols = list(model.feature_names_in_)

    if list(X_train.columns) != model_cols:
        missing = [c for c in model_cols if c not in X_train.columns]
        extra = [c for c in X_train.columns if c not in model_cols]
        print("Column mismatch between rebuilt features and model.feature_names_in_")
        print(f"  missing from rebuild ({len(missing)}): {missing[:20]}")
        print(f"  extra in rebuild     ({len(extra)}): {extra[:20]}")
        if not missing and not extra:
            first = next(i for i, (a, b) in enumerate(zip(X_train.columns, model_cols)) if a != b)
            print(f"  same set, order differs first at index {first}: {X_train.columns[first]} vs {model_cols[first]}")
        fail("Feature columns do not match the model.")
    print(f"Column check passed: {len(model_cols)} columns in identical order.")

    X_test_scaled = X_test.copy()
    X_test_scaled[NUMERIC_COLS] = scaler.transform(X_test_scaled[NUMERIC_COLS])
    X_test_scaled = X_test_scaled.reindex(columns=model_cols).astype(float)

    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]
    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred)),
        "recall": float(recall_score(y_test, y_pred)),
        "f1": float(f1_score(y_test, y_pred)),
        "roc_auc": float(roc_auc_score(y_test, y_prob)),
    }

    print("\nHold-out test metrics (n = {:,})".format(len(y_test)))
    print(f"  {'metric':<10}{'actual':>10}{'expected':>10}")
    for k, v in metrics.items():
        print(f"  {k:<10}{v:>10.4f}{EXPECTED[k]:>10.3f}")

    if abs(metrics["accuracy"] - EXPECTED["accuracy"]) > ACCURACY_TOLERANCE:
        fail(
            f"Accuracy {metrics['accuracy']:.4f} deviates from expected {EXPECTED['accuracy']} "
            f"by more than {ACCURACY_TOLERANCE}. The rebuilt scaler/pipeline does not match training."
        )
    print("Accuracy within tolerance.")
    print(
        "Note: the notebook's ROC AUC of 0.851 was computed with a stale y_prob left over from the\n"
        "      XGBoost cell (0.85052748...). The Random Forest's true hold-out ROC AUC is shown above."
    )

    (ARTIFACTS / "feature_columns.json").write_text(json.dumps(model_cols, indent=1))

    city_state = (
        raw[["CITY", "STATE"]].drop_duplicates().sort_values(["STATE", "CITY"])
    )
    city_to_state: dict[str, list[str]] = {}
    for city, state in city_state.itertuples(index=False):
        city_to_state.setdefault(city, []).append(state)
    state_to_cities: dict[str, list[str]] = {}
    for city, state in city_state.itertuples(index=False):
        state_to_cities.setdefault(state, []).append(city)

    train_raw = df.loc[X_train.index]
    medians = {c: float(train_raw[c].median()) for c in NUMERIC_COLS}
    ranges = {
        c: {"min": float(raw[c].min()), "max": float(raw[c].max())} for c in NUMERIC_INPUTS
    }
    baselines = {}
    for col in CATEGORICAL:
        values = sorted(df[col].dropna().astype(str).unique())
        if col == "Age_Group":
            values = [v for v in ["20s", "30s", "40s", "50s", "60+"] if v in values]
        baselines[col] = values[0]

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": f"rf-{model.n_estimators}t-{len(model_cols)}f",
        "n_features": len(model_cols),
        "training_rows": int(len(raw)),
        "test_rows": int(len(y_test)),
        "default_rate": float(y.mean()),
        "options": build_options(raw),
        "city_to_states": city_to_state,
        "state_to_cities": state_to_cities,
        "ranges": ranges,
        "medians": medians,
        "baselines": baselines,
        "metrics": metrics,
        "metrics_note": (
            "Hold-out test split (20%, stratified, random_state=42). The sprint notebook reported "
            "ROC AUC 0.851, which was a stale XGBoost probability vector; the value here is the "
            "Random Forest's own ROC AUC."
        ),
    }
    (ARTIFACTS / "metadata.json").write_text(json.dumps(metadata, indent=1))
    print(f"Wrote {ARTIFACTS / 'feature_columns.json'}")
    print(f"Wrote {ARTIFACTS / 'metadata.json'}")
    multi = {c: s for c, s in city_to_state.items() if len(s) > 1}
    if multi:
        print(f"Note: {len(multi)} cities appear in more than one state (kept as valid pairs).")
    print("\nDone.")


if __name__ == "__main__":
    main()
