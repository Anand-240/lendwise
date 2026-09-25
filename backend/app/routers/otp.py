from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.middleware import RateLimiter, client_key
from app.otp import OtpError, check_code, send_code
from app.schemas import OtpSendIn, OtpSendOut, OtpVerifyIn, OtpVerifyOut
from app.services import mask_phone

router = APIRouter(prefix="/otp", tags=["public"])
send_limiter = RateLimiter(10)
verify_limiter = RateLimiter(30)


def _throttle(limiter: RateLimiter, request: Request) -> None:
    wait = limiter.hit(client_key(request))
    if wait is not None:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please wait a moment and try again.",
                            headers={"Retry-After": str(int(wait) + 1)})


def _raise(e: OtpError):
    headers = {"Retry-After": str(e.retry_after)} if e.retry_after else None
    raise HTTPException(e.status, e.message, headers=headers) from None


@router.post("/send", response_model=OtpSendOut)
def send(body: OtpSendIn, request: Request, db: Session = Depends(get_db)) -> OtpSendOut:
    _throttle(send_limiter, request)
    try:
        row, demo_code = send_code(db, body.phone)
    except OtpError as e:
        _raise(e)
    s = get_settings()
    return OtpSendOut(
        verification_id=row.id, phone_masked=mask_phone(body.phone), expires_in=s.otp_ttl_seconds,
        resend_after=s.otp_resend_cooldown_seconds, mode=s.sms_mode, demo_code=demo_code,
    )


@router.post("/verify", response_model=OtpVerifyOut)
def verify(body: OtpVerifyIn, request: Request, db: Session = Depends(get_db)) -> OtpVerifyOut:
    _throttle(verify_limiter, request)
    try:
        token = check_code(db, body.verification_id, body.code)
    except OtpError as e:
        _raise(e)
    return OtpVerifyOut(verified=True, token=token, expires_in=get_settings().phone_token_ttl_minutes * 60)
