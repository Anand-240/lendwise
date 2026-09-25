import pytest

from app.ml import decision as dec


def test_class_mapping():
    assert dec.decide(0) == "APPROVED"
    assert dec.decide(1) == "REJECTED"


@pytest.mark.parametrize("p,band", [(0.0, "Low"), (0.2999, "Low"), (0.30, "Moderate"), (0.4999, "Moderate"), (0.5, "High"), (1.0, "High")])
def test_risk_band(p, band):
    assert dec.risk_band(p) == band


def test_emi_standard_formula():
    # 5,00,000 at 10.5% for 60 months ≈ 10,747
    assert dec.estimate_emi(500_000, 10.5, 60) == pytest.approx(10746.99, abs=0.5)
    assert dec.estimate_emi(120_000, 0, 12) == 10_000


def test_indicative_factors_for_rejection():
    medians = {"CURRENT_JOB_YRS": 6, "Income": 5_000_000, "Income_per_Experience": 450_000, "Experience": 10,
               "CURRENT_HOUSE_YRS": 12, "Career_Stability": 18, "Financial_Maturity": 270}
    features = {"CURRENT_JOB_YRS": 1, "Income": 4_000_000, "Income_per_Experience": 100_000, "Experience": 10,
                "CURRENT_HOUSE_YRS": 12, "Career_Stability": 13, "Financial_Maturity": 30}
    f = dec.indicative_factors(features, {"House_Ownership": "rented"}, medians, "REJECTED")
    assert len(f) == 3
    assert all(x["direction"] == "risk" for x in f)
    # Ranked by relative shortfall: financial maturity (-89%), job years (-83%), income per experience (-78%).
    assert f[0]["key"] == "Financial_Maturity"
    labels = [x["label"] for x in f]
    assert "Short time in current job" in labels
