"""Business rules on top of the model output."""
from __future__ import annotations

from typing import Any, Mapping

APPROVED = "APPROVED"
REJECTED = "REJECTED"


def decide(risk_class: int) -> str:
    """The decision always comes from model.predict: 0 -> APPROVED, 1 -> REJECTED."""
    return APPROVED if int(risk_class) == 0 else REJECTED


def risk_band(default_probability: float) -> str:
    if default_probability < 0.30:
        return "Low"
    if default_probability < 0.50:
        return "Moderate"
    return "High"


def estimate_emi(principal: float, annual_rate_pct: float, tenure_months: int) -> float:
    r = annual_rate_pct / 12 / 100
    if r == 0:
        return round(principal / tenure_months, 2)
    growth = (1 + r) ** tenure_months
    return round(principal * r * growth / (growth - 1), 2)


# (feature, label when below median, label when at/above median, explanation)
_NUMERIC_FACTORS = [
    ("CURRENT_JOB_YRS", "Short time in current job", "Established in current job",
     "Years in your current job compared with typical applicants"),
    ("Income_per_Experience", "Low income relative to experience", "Strong income relative to experience",
     "Annual income per year of work experience"),
    ("Income", "Income below typical applicant level", "Income above typical applicant level",
     "Annual income compared with the training population"),
    ("Experience", "Limited total work experience", "Substantial work experience",
     "Total years of professional experience"),
    ("CURRENT_HOUSE_YRS", "Short time at current residence", "Long-standing residence",
     "Years at your current address"),
    ("Career_Stability", "Limited combined job and residence stability", "Strong combined job and residence stability",
     "Years in current job plus years at current address"),
    ("Financial_Maturity", "Early stage of financial maturity", "High financial maturity",
     "Age multiplied by years in current job"),
]


def indicative_factors(
    features: Mapping[str, Any], inputs: Mapping[str, Any], medians: Mapping[str, float], decision: str, limit: int = 3
) -> list[dict[str, Any]]:
    """Heuristic, human-readable factors: comparisons of the applicant's engineered
    features against training medians. These are *indicative*, not exact model
    explanations."""
    risks: list[tuple[float, dict[str, Any]]] = []
    strengths: list[tuple[float, dict[str, Any]]] = []

    for key, weak_label, strong_label, detail in _NUMERIC_FACTORS:
        median = float(medians.get(key, 0) or 0)
        if median <= 0:
            continue
        value = float(features[key])
        gap = (value - median) / median
        item = {"key": key, "value": round(value, 2), "median": round(median, 2), "detail": detail}
        if gap < -0.05:
            risks.append((-gap, {**item, "label": weak_label, "direction": "risk"}))
        elif gap > 0.05:
            strengths.append((gap, {**item, "label": strong_label, "direction": "strength"}))

    if inputs.get("House_Ownership") == "rented":
        risks.append((0.15, {"key": "House_Ownership", "label": "Rented accommodation", "direction": "risk",
                             "detail": "Renters show a higher default rate in the training data"}))
    elif inputs.get("House_Ownership") == "owned":
        strengths.append((0.15, {"key": "House_Ownership", "label": "Owns residence", "direction": "strength",
                                 "detail": "Home owners show a lower default rate in the training data"}))
    if inputs.get("Car_Ownership") == "no":
        risks.append((0.1, {"key": "Car_Ownership", "label": "No vehicle ownership", "direction": "risk",
                            "detail": "Applicants without a car show a slightly higher default rate"}))

    pool = risks if decision == REJECTED else strengths
    pool.sort(key=lambda t: t[0], reverse=True)
    factors = [f for _, f in pool[:limit]]
    if not factors and decision == REJECTED:
        factors = [{
            "key": "profile_pattern", "direction": "risk",
            "label": "Overall profile resembles higher-risk applicants",
            "detail": "The combination of profession, location and history matched patterns associated with default",
        }]
    return factors
