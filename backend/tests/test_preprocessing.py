import json

import numpy as np
import pandas as pd
import pytest

from app.ml import preprocessing as pp
from tests.conftest import ARTIFACTS, needs_data, needs_model

FEATURES = json.loads((ARTIFACTS / "feature_columns.json").read_text())

BASE_INPUT = {
    "Income": 5_000_000,
    "Age": 35,
    "Experience": 10,
    "Married/Single": "single",
    "House_Ownership": "rented",
    "Car_Ownership": "no",
    "Profession": "Software_Developer",
    "CITY": "Tiruchirappalli[10]",
    "STATE": "Tamil_Nadu",
    "CURRENT_JOB_YRS": 5,
    "CURRENT_HOUSE_YRS": 12,
}


def test_feature_columns_shape_and_prefix():
    assert len(FEATURES) == 414
    assert FEATURES[:12] == pp.BASE_FEATURES


def test_encode_single_outputs_414_columns_in_model_order():
    frame, _ = pp.encode_single(BASE_INPUT, FEATURES)
    assert frame.shape == (1, 414)
    assert list(frame.columns) == FEATURES


def test_bracketed_city_is_mapped():
    frame, _ = pp.encode_single(BASE_INPUT, FEATURES)
    assert "CITY_Tiruchirappalli10" in FEATURES
    assert frame.at[0, "CITY_Tiruchirappalli10"] == 1.0
    assert frame.filter(like="CITY_").to_numpy().sum() == 1


def test_baseline_categories_encode_to_all_zero():
    md = json.loads((ARTIFACTS / "metadata.json").read_text())
    b = md["baselines"]
    inputs = {
        **BASE_INPUT,
        "Married/Single": b["Married/Single"],
        "House_Ownership": b["House_Ownership"],
        "Car_Ownership": b["Car_Ownership"],
        "Profession": b["Profession"],
        "CITY": b["CITY"],
        "STATE": b["STATE"],
        "Age": 25,  # Age_Group baseline "20s"
        "Experience": 3,
        "CURRENT_JOB_YRS": 2,
    }
    frame, _ = pp.encode_single(inputs, FEATURES)
    for prefix in ["Married/Single_", "House_Ownership_", "Car_Ownership_", "Profession_", "CITY_", "STATE_", "Age_Group_"]:
        assert frame.filter(like=prefix).to_numpy().sum() == 0, prefix


@pytest.mark.parametrize("age,expected", [(21, "20s"), (30, "20s"), (31, "30s"), (40, "30s"), (41, "40s"), (60, "50s"), (61, "60+"), (79, "60+")])
def test_age_group_edges(age, expected):
    assert pp.age_group(age) == expected
    _, features = pp.encode_single({**BASE_INPUT, "Age": age, "Experience": 0, "CURRENT_JOB_YRS": 0}, FEATURES)
    assert features["Age_Group"] == expected


def test_age_20_is_outside_bins():
    assert pp.age_group(20) is None
    with pytest.raises(ValueError):
        pp.encode_single({**BASE_INPUT, "Age": 20, "Experience": 0, "CURRENT_JOB_YRS": 0}, FEATURES)


def test_engineered_features_values():
    _, f = pp.encode_single(BASE_INPUT, FEATURES)
    assert f["Income_per_Experience"] == pytest.approx(5_000_000 / 11)
    assert f["Career_Stability"] == 17
    assert f["Experience_Ratio"] == pytest.approx(10 / 35)
    assert f["Financial_Maturity"] == 175
    assert f["Long_Term_Resident"] == 1
    assert f["Career_Start_Age"] == 25
    assert f["Stable_Employee"] == 1


@needs_data
def test_batch_columns_match_model(dataset):
    X = pp.batch_encode(dataset.drop(columns=["Id"]))
    assert list(X.columns) == FEATURES


@needs_model
@needs_data
def test_parity_single_row_vs_batch(predictor, dataset):
    """Single-row inference must reproduce the batch (get_dummies) pipeline exactly."""
    raw = dataset.drop(columns=["Id"])
    X = pp.batch_encode(raw)
    X[pp.NUMERIC_COLS] = predictor.scaler.transform(X[pp.NUMERIC_COLS])
    X = X.reindex(columns=FEATURES).astype(float)

    rng = np.random.default_rng(7)
    idx = rng.choice(len(raw), size=200, replace=False)
    batch_proba = predictor.model.predict_proba(X.iloc[idx])

    single = []
    for i in idx:
        row = raw.iloc[i][pp.RAW_INPUT_COLUMNS].to_dict()
        Xi, _ = pp.transform_single(row, FEATURES, predictor.scaler)
        np.testing.assert_array_equal(Xi.to_numpy(), X.iloc[[i]].to_numpy())
        single.append(predictor.model.predict_proba(Xi)[0])
    np.testing.assert_array_equal(np.array(single), batch_proba)
