"""Glue between the API, the screening engine and persistence."""
from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ml.engine import eligibility_tier, risk_tier
from app.ml.registry import get_screener
from app.models_db import Application, ApplicationMessage
from app.schemas import ApplicantSummary, ApplicationCreate, ApplicationResult, ScreeningOut, ThreadMessage


def submit_application(db: Session, body: ApplicationCreate) -> Application:
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
        messages=thread(db, a.application_id),
    )
