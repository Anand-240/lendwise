from typing import Any

from fastapi import APIRouter

from app.ml.registry import get_screener
from app.schemas import PURPOSES

router = APIRouter(tags=["public"])


@router.get("/metadata")
def metadata() -> dict[str, Any]:
    """Model card: inputs, rules, data and every evaluation number shown on the website."""
    s = get_screener()
    md = s.metadata
    return {
        "mode": s.mode,
        "model_version": s.model_version,
        "trained_at": md.get("trained_at"),
        "features": md.get("features"),
        "input_ranges": md.get("input_ranges"),
        "constraints": md.get("constraints"),
        "hgb_params": md.get("hgb_params"),
        "calibration": md.get("calibration"),
        "severity": md.get("severity"),
        "thresholds": md.get("thresholds"),
        "counter_offer_step": md.get("counter_offer_step"),
        "guard": md.get("guard"),
        "data": md.get("data"),
        "metrics": md.get("metrics"),
        "environment": md.get("environment"),
        "evaluation": s.evaluation(),
        "acceptance": s.acceptance(),
        "purposes": list(PURPOSES),
    }
