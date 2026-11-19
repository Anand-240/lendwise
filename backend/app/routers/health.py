from fastapi import APIRouter

from app.db import database_status
from app.ml.registry import get_screener
from app.schemas import HealthOut

router = APIRouter(tags=["public"])


@router.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    s = get_screener()
    return HealthOut(
        status="ok", model_loaded=s.ready, mode=s.mode, model_version=s.model_version,
        database=database_status(),
    )
