"""Glue between the API, the screening engine and persistence."""
from __future__ import annotations

import secrets

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import email_templates as tpl
from app.emailer import queue_email
from app.ml.engine import eligibility_tier, risk_tier
from app.ml.registry import get_screener
from app.models_db import Application, ApplicationMessage, OutboundEmail
from app.schemas import ApplicantSummary, ApplicationCreate, ApplicationResult, EmailSummary, ScreeningOut, ThreadMessage


def submit_application(db: Session, body: ApplicationCreate, background: BackgroundTasks | None = None) -> Application:
    """Validate and screen the three inputs, then save the application for an officer to decide.
    Raises validator.InputError for invalid loan inputs (nothing is saved)."""
    result = get_screener().screen({"loan_amount": body.loan_amount, "fico": body.fico, "dti": body.dti})
    raw = result["raw"]
    pd_pct = raw["default_probability"]
    engine = get_screener().engine
    row = Application(
        access_token=secrets.token_urlsafe(32),
        full_name=body.full_name,
        email=body.email.lower(),
        purpose=body.purpose,
        loan_amount=result["inputs"]["loan_amount"],
        fico=result["inputs"]["fico"],
        dti=result["inputs"]["dti"],
        eligibility_score=raw["eligibility"],
        eligibility_tier=eligibility_tier(raw["eligibility"]),
        default_probability=pd_pct,
        expected_loss=float(engine.expected_loss(pd_pct)),
        risk_tier=risk_tier(pd_pct),
        guard_flagged=result["guard"]["flagged"],
        guard_reasons=result["guard"]["reasons"],
        recommendation=result["decision"],
        recommendation_reasons=result["reasons"],
        counter_offer=result["counter_offer"]["loan_amount"] if result["counter_offer"] else None,
        screening={k: v for k, v in result.items() if k not in ("raw", "elapsed_ms")},
        model_version=result["model_version"],
        final_decision="PENDING",
        status="Pending Review",
    )
    db.add(row)
    db.flush()
    row.application_id = f"LW-{row.created_at.year}-{row.id:06d}"
    db.commit()
    db.refresh(row)
    queue_email(db, row.email, tpl.application_received(row), "application_received", background, row.application_id)
    return row


def screening_of(a: Application) -> ScreeningOut:
    """The stored screening result, in the same shape the screening endpoint returns."""
    return ScreeningOut(**a.screening)


def thread(db: Session | None, application_id: str) -> list[ThreadMessage]:
    if db is None:
        return []
    rows = db.scalars(
        select(ApplicationMessage).where(ApplicationMessage.application_id == application_id).order_by(ApplicationMessage.id)
    ).all()
    return [ThreadMessage(author=r.author, body=r.body, created_at=r.created_at) for r in rows]


def add_message(db: Session, application_id: str, author: str, body: str) -> None:
    db.add(ApplicationMessage(application_id=application_id, author=author, body=body))


def send_decision_email(db: Session, a: Application, background: BackgroundTasks | None = None, updated: bool = False) -> None:
    kind = "decision_update" if updated else "decision"
    queue_email(db, a.email, tpl.decision(a, updated=updated), kind, background, a.application_id)


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:1]}{'*' * max(1, len(local) - 1)}@{domain}"


def application_emails(db: Session, application_id: str) -> list[EmailSummary]:
    rows = db.scalars(
        select(OutboundEmail).where(OutboundEmail.application_id == application_id).order_by(OutboundEmail.id)
    ).all()
    return [
        EmailSummary(id=r.id, kind=r.kind, subject=r.subject, to_masked=mask_email(r.to_email), created_at=r.created_at,
                     status=r.status, html=r.html)
        for r in rows
    ]


def to_result(a: Application, db: Session | None = None) -> ApplicationResult:
    pending = a.final_decision == "PENDING"
    return ApplicationResult(
        application_id=a.application_id,
        status=a.status,
        decision=a.final_decision,
        approved_amount=a.approved_amount,
        screening=screening_of(a),
        applicant=ApplicantSummary(
            full_name=a.full_name, email=a.email, purpose=a.purpose,
            loan_amount=a.loan_amount, fico=a.fico, dti=a.dti,
        ),
        timestamp=a.created_at,
        decided_at=None if pending else a.reviewed_at,
        emails=application_emails(db, a.application_id) if db is not None else [],
        messages=thread(db, a.application_id),
    )
