"""Decision rules, tiers and the counter-offer search (report Sections 4.4 and 4.8.4).

Uses simple stand-in models so the rules are tested on their own, without trained artifacts.
"""
import numpy as np
import pytest

from app.ml.engine import DecisionEngine, eligibility_tier, risk_tier
from app.ml.guard import RangeGuard


class Stub:
    def __init__(self, fn):
        self.fn = fn

    def predict_score(self, X):
        X = np.asarray(X, dtype=float)
        return np.array([self.fn(*row) for row in X])


# Eligibility falls as the loan grows; PD rises with the loan.
ELIG = Stub(lambda loan, fico, dti: 0.0 if fico < 660 else max(0.0, 95 - loan / 1000))
PD = Stub(lambda loan, fico, dti: 5 + loan / 1000)
NO_GUARD = RangeGuard({"loan_amount": (0, 1e9), "fico": (0, 1e9), "dti": (-1, 1e9)}, None)


@pytest.fixture
def engine():
    return DecisionEngine(ELIG, PD, NO_GUARD, severity=0.503)


def test_tiers():
    assert [eligibility_tier(x) for x in (0, 39.99, 40, 74.99, 75, 100)] == ["Unlikely", "Unlikely", "Borderline", "Borderline", "Likely", "Likely"]
    assert [risk_tier(x) for x in (0, 12, 12.01, 22, 22.01)] == ["Low", "Low", "Moderate", "Moderate", "High"]


def test_expected_loss_and_thresholds(engine):
    assert engine.expected_loss(10) == pytest.approx(5.03)
    assert round(engine.el_reject, 2) == 11.07 and round(engine.el_approve, 2) == 6.04


@pytest.mark.parametrize(
    "e,pd,flag,decision",
    [
        (39.9, 5, False, "REJECT"),     # eligibility below 40
        (39.9, 5, True, "REJECT"),      # the guard never rescues a failed eligibility screen
        (90, 22.1, False, "REJECT"),    # EL above 11.07%
        (90, 22.0, False, "REVIEW"),    # EL exactly at the reject line is not rejected
        (90, 12.0, False, "APPROVE"),   # e >= 75 and EL <= 6.04%
        (75, 12.0, False, "APPROVE"),
        (74.9, 5, False, "REVIEW"),     # borderline eligibility
        (90, 12.1, False, "REVIEW"),    # moderate risk
        (90, 5, True, "REVIEW"),        # flagged cases are never approved automatically
    ],
)
def test_decision_rules(engine, e, pd, flag, decision):
    assert engine.decide(e, pd, flag).decision == decision


def test_counter_offer_is_largest_approved_amount_in_500_steps(engine):
    # loan 15,000: e = 80 but PD = 20 (moderate risk), so review. Approval needs PD <= 12 (loan <= 7,000).
    result = engine.evaluate({"loan_amount": 15000, "fico": 700, "dti": 10})
    assert result["decision"] == "REVIEW"
    offer = result["counter_offer"]
    assert offer["loan_amount"] == 7000
    assert offer["charge_off"]["probability"] == 12.0 and offer["eligibility"]["tier"] == "Likely"


def test_rejected_application_also_gets_a_counter_offer(engine):
    result = engine.evaluate({"loan_amount": 30000, "fico": 700, "dti": 10})  # PD 35%: rejected
    assert result["decision"] == "REJECT" and result["counter_offer"]["loan_amount"] == 7000


def test_counter_offer_keeps_the_requested_cents_offset(engine):
    offer = engine.evaluate({"loan_amount": 7250.5, "fico": 700, "dti": 10})["counter_offer"]
    assert offer["loan_amount"] == 6750.5


def test_no_counter_offer_when_nothing_smaller_is_approved(engine):
    result = engine.evaluate({"loan_amount": 15000, "fico": 650, "dti": 10})
    assert result["decision"] == "REJECT" and result["counter_offer"] is None
    # Unlikely applications do not show the charge-off risk (Section 5.4.2).
    assert result["eligibility"]["tier"] == "Unlikely" and result["charge_off"] is None


def test_approved_application_has_no_counter_offer(engine):
    result = engine.evaluate({"loan_amount": 5000, "fico": 700, "dti": 10})
    assert result["decision"] == "APPROVE" and result["counter_offer"] is None
    assert result["charge_off"] == {"probability": 10.0, "tier": "Low", "expected_loss": 5.03}


def test_guard_flags_out_of_range_inputs():
    guard = RangeGuard({"loan_amount": (1000, 35000), "fico": (660, 820), "dti": (0, 35)}, None)
    reasons = guard.check([[15000, 700, 15], [36000, 700, 15], [15000, 840, 40]])
    assert reasons[0] == [] and len(reasons[1]) == 1 and len(reasons[2]) == 2
    assert "outside the range" in reasons[1][0]
