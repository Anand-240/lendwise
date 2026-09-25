import hmac

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.middleware import RateLimiter, client_key
from app.models_db import Application
from app.schemas import ApplicantReplyIn, ApplicationCreate, ApplicationCreated, ApplicationResult
from app.otp import token_matches
from app.services import add_message, submit_application, to_result

router = APIRouter(prefix="/applications", tags=["public"])

submit_limiter = RateLimiter(get_settings().rate_limit_per_minute)
global_submit_limiter = RateLimiter(get_settings().rate_limit_global_per_minute)
lookup_limiter = RateLimiter(30)


def _throttle(limiter: RateLimiter, request: Request, key: str | None = None) -> None:
    wait = limiter.hit(key or client_key(request))
    if wait is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(int(wait) + 1)},
        )


NOT_FOUND = "No application matches those details."


@router.post("", response_model=ApplicationCreated, status_code=status.HTTP_201_CREATED)
def create_application(body: ApplicationCreate, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    _throttle(global_submit_limiter, request, key="*")
    _throttle(submit_limiter, request)
    if get_settings().require_phone_verification and not token_matches(body.phone_verification_token, body.phone):
        raise RequestValidationError(
            [{"loc": ("body", "phone_verification_token"), "msg": "Please verify your mobile number with the one-time code.", "type": "value_error"}]
        )
    row = submit_application(db, body, background)
    return ApplicationCreated(**to_result(row, db).model_dump(), access_token=row.access_token)


@router.get("/{application_id}/status", response_model=ApplicationResult)
def application_status(
    application_id: str,
    request: Request,
    email: str = Query(min_length=3, max_length=254),
    db: Session = Depends(get_db),
):
    _throttle(lookup_limiter, request)
    row = db.scalar(select(Application).where(Application.application_id == application_id.strip().upper()))
    if row is None or not hmac.compare_digest(row.email, email.strip().lower()):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return to_result(row, db)


@router.get("/{application_id}", response_model=ApplicationResult)
def application_by_token(
    application_id: str,
    request: Request,
    x_access_token: str = Header(min_length=16, max_length=128),
    db: Session = Depends(get_db),
):
    """Fetch a decision using the private access token issued at submission (used by the
    decision page via an httpOnly cookie)."""
    _throttle(lookup_limiter, request)
    row = db.scalar(select(Application).where(Application.application_id == application_id.strip().upper()))
    if row is None or not hmac.compare_digest(row.access_token, x_access_token):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return to_result(row, db)


@router.post("/{application_id}/reply", response_model=ApplicationResult)
def applicant_reply(
    application_id: str,
    body: ApplicantReplyIn,
    request: Request,
    x_access_token: str | None = Header(default=None, max_length=128),
    db: Session = Depends(get_db),
):
    """The applicant answers an officer's request for more information. Authorised by the private
    access token (same browser) or by the email the application was made with."""
    _throttle(lookup_limiter, request)
    row = db.scalar(select(Application).where(Application.application_id == application_id.strip().upper()))
    token_ok = bool(row and x_access_token and hmac.compare_digest(row.access_token, x_access_token))
    email_ok = bool(row and body.email and hmac.compare_digest(row.email, body.email.strip().lower()))
    if row is None or not (token_ok or email_ok):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if row.status != "Info Requested":
        raise HTTPException(status_code=409, detail="This application isn’t waiting for more information right now.")
    add_message(db, row.application_id, "applicant", body.message)
    row.status = "Pending Review"
    db.commit()
    db.refresh(row)
    return to_result(row, db)
