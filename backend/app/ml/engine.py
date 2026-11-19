"""Decision layer (report Sections 4.4 and 4.8.4): tiers, expected loss, rules and counter-offer.

Flow for one application (Figure 4.5):

1. eligibility score e < 40                     -> REJECT
2. expected loss EL = PD x severity > 11.07%    -> REJECT   (PD above 22%)
3. range guard flag                             -> REVIEW   (never approved automatically)
4. e >= 75 and EL <= 6.04%                      -> APPROVE  (PD up to 12%)
5. anything else                                -> REVIEW

Whenever the result is REJECT or REVIEW, smaller loan amounts are tried in $500 steps and the
largest amount that would be approved is offered instead.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.ml.constants import (
    APPROVE,
    APPROVE_ELIGIBILITY,
    APPROVE_PD,
    COUNTER_OFFER_STEP,
    LOAN_MIN,
    REJECT,
    REJECT_ELIGIBILITY,
    REJECT_PD,
    REVIEW,
)
from app.ml.guard import RangeGuard
from app.ml.layer_model import LayerModel


# ---- Tiering -----------------------------------------------------------------------------------
def eligibility_tier(score: float) -> str:
    if score >= APPROVE_ELIGIBILITY:
        return "Likely"
    if score >= REJECT_ELIGIBILITY:
        return "Borderline"
    return "Unlikely"


def risk_tier(pd_pct: float) -> str:
    if pd_pct <= APPROVE_PD:
        return "Low"
    if pd_pct <= REJECT_PD:
        return "Moderate"
    return "High"


@dataclass
class Thresholds:
    reject_eligibility: float = REJECT_ELIGIBILITY
    approve_eligibility: float = APPROVE_ELIGIBILITY
    reject_pd: float = REJECT_PD
    approve_pd: float = APPROVE_PD


@dataclass
class Scored:
    eligibility: np.ndarray
    pd: np.ndarray
    guard_reasons: list[list[str]]


@dataclass
class Outcome:
    decision: str
    reasons: list[str] = field(default_factory=list)


class DecisionEngine:
    def __init__(self, eligibility: LayerModel, chargeoff: LayerModel, guard: RangeGuard,
                 severity: float, thresholds: Thresholds | None = None):
        self.eligibility = eligibility
        self.chargeoff = chargeoff
        self.guard = guard
        self.severity = severity  # share of principal lost on a charged-off loan (0 to 1)
        self.t = thresholds or Thresholds()

    # Expected loss in percent of principal, from PD in percent (Eq. 4.3).
    def expected_loss(self, pd_pct: float | np.ndarray):
        return pd_pct * self.severity

    @property
    def el_reject(self) -> float:
        return self.t.reject_pd * self.severity

    @property
    def el_approve(self) -> float:
        return self.t.approve_pd * self.severity

    def score(self, rows: np.ndarray) -> Scored:
        """Score many [loan_amount, fico, dti] rows in one pass."""
        return Scored(
            eligibility=self.eligibility.predict_score(rows),
            pd=self.chargeoff.predict_score(rows),
            guard_reasons=self.guard.check(rows),
        )

    def decide(self, e: float, pd_pct: float, flagged: bool) -> Outcome:
        if e < self.t.reject_eligibility:
            return Outcome(REJECT, [f"Eligibility score {e:.1f} is below {self.t.reject_eligibility:g}."])
        el = self.expected_loss(pd_pct)
        if el > self.el_reject:
            return Outcome(REJECT, [f"Expected loss {el:.2f}% is above {self.el_reject:.2f}% (default probability above {self.t.reject_pd:g}%)."])
        if flagged:
            return Outcome(REVIEW, ["The range guard flagged the inputs, so a reviewer must check this case."])
        if e >= self.t.approve_eligibility and el <= self.el_approve:
            return Outcome(APPROVE, [f"Eligibility score is at least {self.t.approve_eligibility:g} and expected loss is at most {self.el_approve:.2f}%."])
        reasons = []
        if e < self.t.approve_eligibility:
            reasons.append(f"Eligibility score {e:.1f} is between {self.t.reject_eligibility:g} and {self.t.approve_eligibility:g}.")
        if el > self.el_approve:
            reasons.append(f"Expected loss {el:.2f}% is between {self.el_approve:.2f}% and {self.el_reject:.2f}%.")
        return Outcome(REVIEW, reasons)

    def decide_rows(self, rows: np.ndarray) -> tuple[Scored, list[Outcome]]:
        s = self.score(rows)
        outcomes = [self.decide(float(e), float(p), bool(g)) for e, p, g in zip(s.eligibility, s.pd, s.guard_reasons)]
        return s, outcomes

    # ---- Counter-offer search ---------------------------------------------------------------------
    @staticmethod
    def offer_amounts(loan_amount: float) -> list[float]:
        """Smaller amounts to try, largest first, in $500 steps down to the $500 minimum."""
        amounts = []
        a = loan_amount - COUNTER_OFFER_STEP
        while a >= LOAN_MIN:
            amounts.append(round(a, 2))
            a -= COUNTER_OFFER_STEP
        return amounts

    def _first_approved(self, amounts: list[float], s: Scored, outcomes: list[Outcome], offset: int = 0) -> dict[str, Any] | None:
        for i, amount in enumerate(amounts):  # largest first
            j = i + offset
            if outcomes[j].decision == APPROVE:
                return {
                    "loan_amount": amount,
                    "eligibility": self._eligibility_part(float(s.eligibility[j])),
                    "charge_off": self._risk_part(float(s.pd[j])),
                }
        return None

    def counter_offer(self, loan_amount: float, fico: int, dti: float) -> dict[str, Any] | None:
        """Largest amount below the request, in $500 steps, that the rules would approve."""
        amounts = self.offer_amounts(loan_amount)
        if not amounts:
            return None
        s, outcomes = self.decide_rows(np.array([[amt, fico, dti] for amt in amounts], dtype=float))
        return self._first_approved(amounts, s, outcomes)

    def _eligibility_part(self, e: float) -> dict[str, Any]:
        return {"score": round(e, 1), "tier": eligibility_tier(e)}

    def _risk_part(self, pd_pct: float) -> dict[str, Any]:
        return {
            "probability": round(pd_pct, 2),
            "tier": risk_tier(pd_pct),
            "expected_loss": round(float(self.expected_loss(pd_pct)), 2),
        }

    # ---- One application, end to end --------------------------------------------------------------
    def evaluate(self, clean: dict[str, Any], *, with_counter_offer: bool = True) -> dict[str, Any]:
        """Screen validated inputs (see validator.validate) and return the full result."""
        start = time.perf_counter()
        loan, fico, dti = clean["loan_amount"], clean["fico"], clean["dti"]
        # The application and every counter-offer candidate are scored in one batch: each model
        # call has a fixed cost, so one call for 80 rows is about as fast as one call for 1 row.
        amounts = self.offer_amounts(loan) if with_counter_offer else []
        rows = np.array([[loan, fico, dti]] + [[a, fico, dti] for a in amounts], dtype=float)
        s, outcomes = self.decide_rows(rows)
        outcome = outcomes[0]
        e, pd_pct, guard_reasons = float(s.eligibility[0]), float(s.pd[0]), s.guard_reasons[0]
        offer = None
        if outcome.decision in (REJECT, REVIEW):
            offer = self._first_approved(amounts, s, outcomes, offset=1)
        unlikely = eligibility_tier(e) == "Unlikely"
        return {
            "inputs": dict(clean),
            "eligibility": self._eligibility_part(e),
            # Charge-off risk is only shown when the application is not Unlikely (Section 5.4.2).
            "charge_off": None if unlikely else self._risk_part(pd_pct),
            "decision": outcome.decision,
            "reasons": outcome.reasons,
            "guard": {"flagged": bool(guard_reasons), "reasons": guard_reasons},
            "counter_offer": offer,
            "raw": {"eligibility": e, "default_probability": pd_pct},
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 2),
        }
