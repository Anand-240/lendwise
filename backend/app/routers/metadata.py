from typing import Any

from fastapi import APIRouter

from app.config import get_settings
from app.ml.predictor import get_predictor

router = APIRouter(tags=["public"])

FIELD_NAMES = {
    "Married/Single": "marital_status",
    "House_Ownership": "house_ownership",
    "Car_Ownership": "car_ownership",
    "Profession": "profession",
    "STATE": "state",
    "CITY": "city",
}
RANGE_NAMES = {
    "Income": "income",
    "Age": "age",
    "Experience": "experience",
    "CURRENT_JOB_YRS": "current_job_years",
    "CURRENT_HOUSE_YRS": "current_house_years",
}


@router.get("/metadata")
def metadata() -> dict[str, Any]:
    p = get_predictor()
    md = p.metadata
    return {
        "mode": p.mode,
        "model_version": p.model_version,
        "options": {FIELD_NAMES[k]: v for k, v in md["options"].items()},
        "state_to_cities": md["state_to_cities"],
        "ranges": {RANGE_NAMES[k]: v for k, v in md["ranges"].items()},
        "metrics": md["metrics"],
        "metrics_note": md.get("metrics_note"),
        "training_rows": md.get("training_rows"),
        "test_rows": md.get("test_rows"),
        "n_features": md.get("n_features"),
        "interest_rate": get_settings().demo_interest_rate,
        "purposes": ["Personal", "Home", "Vehicle", "Education", "Business", "Medical", "Other"],
        "limits": {
            "loan_amount": {"min": 10_000, "max": 10_000_000},
            "tenure_months": {"min": 6, "max": 360},
            "age": {"min": 21, "max": 79},
        },
    }
