from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request, status

from app.config import get_settings
from app.middleware import RateLimiter, client_key
from app.ml.registry import get_screener
from app.schemas import ScreenIn, ScreeningOut

router = APIRouter(tags=["public"])
screen_limiter = RateLimiter(get_settings().screen_rate_limit_per_minute)


@router.post(
    "/screen",
    response_model=ScreeningOut,
    openapi_extra={"requestBody": {"content": {"application/json": {"schema": ScreenIn.model_json_schema()}}}},
)
def screen(request: Request, payload: Any = Body(...)) -> ScreeningOut:
    """Screen one application from loan amount, FICO score and DTI. Nothing is stored.

    Invalid input returns 422 with a single error message and nothing is scored.
    """
    wait = screen_limiter.hit(client_key(request))
    if wait is not None:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please wait a moment and try again.",
                            headers={"Retry-After": str(int(wait) + 1)})
    screener = get_screener()
    if not screener.ready:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The screening models are not available right now.")
    return ScreeningOut(**screener.screen(payload))
