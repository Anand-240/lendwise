"""Email sending. Every email is recorded in `outbound_emails`.

- Demo mode (no RESEND_API_KEY): the row is stored with status "demo" and shown in the app's
  outbox instead of being delivered.
- Live mode: the row is queued and delivered via the Resend API in a background task.
"""
from __future__ import annotations

import logging

import httpx
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.email_templates import Rendered
from app.models_db import OutboundEmail

log = logging.getLogger("lendwise.email")
RESEND_URL = "https://api.resend.com/emails"


def queue_email(
    db: Session,
    to: str,
    rendered: Rendered,
    kind: str,
    background: BackgroundTasks | None = None,
    application_id: str | None = None,
    message_id: int | None = None,
) -> OutboundEmail:
    live = get_settings().email_mode == "live"
    row = OutboundEmail(
        kind=kind,
        to_email=to,
        subject=rendered.subject,
        html=rendered.html,
        text=rendered.text,
        application_id=application_id,
        message_id=message_id,
        status="queued" if live else "demo",
        provider="resend" if live else "demo",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if live:
        if background is not None:
            background.add_task(deliver, row.id)
        else:
            deliver(row.id)
    return row


def send_via_resend(to: str, subject: str, html: str, text: str) -> str:
    """Returns the Resend message id; raises on failure."""
    s = get_settings()
    payload = {"from": s.email_from, "to": [to], "subject": subject, "html": html, "text": text}
    if s.email_reply_to:
        payload["reply_to"] = s.email_reply_to
    res = httpx.post(RESEND_URL, json=payload, headers={"Authorization": f"Bearer {s.resend_api_key}"}, timeout=15)
    if res.status_code >= 400:
        raise RuntimeError(f"Resend {res.status_code}: {res.text[:200]}")
    return str(res.json().get("id", ""))


def deliver(email_id: int) -> None:
    db = SessionLocal()
    try:
        row = db.get(OutboundEmail, email_id)
        if row is None or row.status not in ("queued", "failed"):
            return
        try:
            row.provider_id = send_via_resend(row.to_email, row.subject, row.html, row.text)
            row.status, row.error = "sent", None
        except Exception as e:  # never break the request flow because of email
            row.status, row.error = "failed", str(e)[:300]
            log.warning("Email %s failed (%s)", email_id, type(e).__name__)
        db.commit()
    finally:
        db.close()
