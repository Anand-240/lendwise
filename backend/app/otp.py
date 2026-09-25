"""Phone OTP verification.

- Demo mode (no Twilio credentials): a 6-digit code is generated here, stored hashed, and returned
  to the client so it can be shown on screen (no SMS is sent).
- Live mode: Twilio Verify sends and checks the code; we only keep the attempt record.

A successful check returns a short-lived signed token that must accompany the application.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import jwt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models_db import PhoneVerification, utcnow

TWILIO_BASE = "https://verify.twilio.com/v2/Services"
TOKEN_AUDIENCE = "lendwise:phone-verified"


class OtpError(Exception):
    def __init__(self, status: int, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.status, self.message, self.retry_after = status, message, retry_after


def _hash(verification_id: str, code: str) -> str:
    return hashlib.sha256(f"{verification_id}:{code}:{get_settings().jwt_secret}".encode()).hexdigest()


def _twilio(path: str, data: dict) -> dict:
    s = get_settings()
    res = httpx.post(
        f"{TWILIO_BASE}/{s.twilio_verify_service_sid}/{path}",
        data=data,
        auth=(s.twilio_account_sid, s.twilio_auth_token),
        timeout=15,
    )
    if res.status_code >= 400:
        raise OtpError(502, "We couldn’t send or check the code right now. Please try again shortly.")
    return res.json()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def send_code(db: Session, phone: str) -> tuple[PhoneVerification, str | None]:
    s = get_settings()
    now = utcnow()
    last = db.scalar(select(PhoneVerification).where(PhoneVerification.phone == phone).order_by(PhoneVerification.created_at.desc()))
    if last is not None:
        wait = s.otp_resend_cooldown_seconds - (now - _aware(last.created_at)).total_seconds()
        if wait > 0:
            raise OtpError(429, f"Please wait {int(wait) + 1} seconds before requesting another code.", int(wait) + 1)
    sent_last_hour = db.scalar(
        select(func.count()).select_from(PhoneVerification).where(
            PhoneVerification.phone == phone, PhoneVerification.created_at >= now - timedelta(hours=1)
        )
    ) or 0
    if sent_last_hour >= s.otp_max_sends_per_hour:
        raise OtpError(429, "Too many codes requested for this number. Please try again in an hour.", 3600)

    vid = str(uuid.uuid4())
    demo_code: str | None = None
    if s.sms_mode == "live":
        _twilio("Verifications", {"To": f"+91{phone}", "Channel": "sms"})
        code_hash = None
    else:
        demo_code = f"{secrets.randbelow(10**6):06d}"
        code_hash = _hash(vid, demo_code)
    row = PhoneVerification(
        id=vid, phone=phone, provider="twilio" if s.sms_mode == "live" else "demo", code_hash=code_hash,
        expires_at=now + timedelta(seconds=s.otp_ttl_seconds),
    )
    db.add(row)
    db.commit()
    return row, demo_code


def check_code(db: Session, verification_id: str, code: str) -> str:
    """Returns a signed phone-verification token on success."""
    s = get_settings()
    row = db.get(PhoneVerification, verification_id)
    if row is None:
        raise OtpError(404, "This code request wasn’t found. Please request a new code.")
    if row.verified_at is not None:
        raise OtpError(409, "This number is already verified. Request a new code to verify again.")
    if _aware(row.expires_at) < utcnow():
        raise OtpError(410, "This code has expired. Please request a new one.")
    if row.attempts >= s.otp_max_attempts:
        raise OtpError(429, "Too many incorrect attempts. Please request a new code.")

    row.attempts += 1
    if row.provider == "twilio":
        ok = _twilio("VerificationCheck", {"To": f"+91{row.phone}", "Code": code}).get("status") == "approved"
    else:
        ok = hmac.compare_digest(row.code_hash or "", _hash(row.id, code))
    if not ok:
        db.commit()
        left = s.otp_max_attempts - row.attempts
        raise OtpError(400, f"That code isn’t right. {left} attempt{'s' if left != 1 else ''} left." if left else
                       "Too many incorrect attempts. Please request a new code.")
    row.verified_at = utcnow()
    db.commit()
    return issue_token(row.phone)


def issue_token(phone: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"phone": phone, "aud": TOKEN_AUDIENCE, "iat": now, "exp": now + timedelta(minutes=s.phone_token_ttl_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def token_matches(token: str | None, phone: str) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], audience=TOKEN_AUDIENCE)
    except jwt.PyJWTError:
        return False
    return hmac.compare_digest(str(payload.get("phone", "")), phone)
