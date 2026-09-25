from fastapi import APIRouter

from app.config import get_settings
from app.ml.predictor import get_predictor
from app.schemas import HealthOut

router = APIRouter(tags=["public"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    p = get_predictor()
    s = get_settings()
    return HealthOut(
        status="ok", model_loaded=p.mode == "live", mode=p.mode, model_version=p.model_version,
        email_mode=s.email_mode, sms_mode=s.sms_mode,
    )
