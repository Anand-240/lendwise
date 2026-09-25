"""Officer authentication: single admin account from env, HS256 JWT."""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

ALGORITHM = "HS256"
_bearer = HTTPBearer(auto_error=False)


@lru_cache
def _admin_password_hash() -> bytes:
    pw = get_settings().admin_password
    if pw.startswith(("$2a$", "$2b$", "$2y$")):
        return pw.encode()
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt())


def verify_credentials(email: str, password: str) -> bool:
    s = get_settings()
    email_ok = hmac.compare_digest(email.strip().lower(), s.admin_email.strip().lower())
    # Always run bcrypt so response time doesn't reveal whether the email matched.
    pw_ok = bcrypt.checkpw(password.encode()[:72], _admin_password_hash())
    return email_ok and pw_ok


def create_token(subject: str) -> tuple[str, int]:
    s = get_settings()
    expires = s.jwt_expire_minutes * 60
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "role": "officer", "iat": now, "exp": now + timedelta(seconds=expires)}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM), expires


def require_officer(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None or creds.scheme.lower() != "bearer":
        raise unauthorized
    try:
        payload = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise unauthorized from None
    if payload.get("role") != "officer":
        raise unauthorized
    return str(payload["sub"])
