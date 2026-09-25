"""Glue between API, ML pipeline and persistence."""
from __future__ import annotations

import secrets
from datetime import timezone

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.ml import decision as dec
from app.ml.predictor import get_predictor
from app import email_templates as tpl
from app.emailer import queue_email
from app.models_db import Application, ApplicationMessage, OutboundEmail
from app.otp import token_matches
from app.schemas import ApplicantSummary, ApplicationCreate, ApplicationResult, EmailSummary, ThreadMessage


def _label(col: str, value: str) -> str:
    for o in get_predictor().metadata["options"][col]:
        if o["value"] == value:
            return o["label"]
    return value


def submit_application(db: Session, body: ApplicationCreate, background: BackgroundTasks | None = None) -> Application:
    predictor = get_predictor()
    review = get_settings().require_officer_review
    raw = body.to_model_row()
    pred = predictor.predict(raw)
    decision = dec.decide(pred.risk_class)
    factors = dec.indicative_factors(
        pred.engineered_features, raw, predictor.metadata["medians"], decision
    )
    warnings = body.range_warnings()
    if pred.is_demo:
        warnings.insert(0, "Demo mode: the ML model is not loaded, so this is a simulated decision, not a model output.")

    app_row = Application(
        access_token=secrets.token_urlsafe(32),
        full_name=body.full_name,
        email=body.email.lower(),
        phone=body.phone,
        phone_verified=token_matches(body.phone_verification_token, body.phone),
        loan_amount=body.loan_amount,
        tenure_months=body.tenure_months,
        purpose=body.purpose,
        income=body.income,
        age=body.age,
        experience=body.experience,
        marital_status=body.marital_status,
        house_ownership=body.house_ownership,
        car_ownership=body.car_ownership,
        profession=body.profession,
        city=body.city,
        state=body.state,
        current_job_years=body.current_job_years,
        current_house_years=body.current_house_years,
        engineered_features=pred.engineered_features,
        risk_class=pred.risk_class,
        default_probability=pred.default_probability,
        confidence=pred.confidence,
        risk_band=dec.risk_band(pred.default_probability),
        decision=decision,
        final_decision="PENDING" if review else decision,
        indicative_factors=factors,
        warnings=warnings,
        model_version=pred.model_version,
        is_demo=pred.is_demo,
        interest_rate=get_settings().demo_interest_rate,
        status="Pending Review" if review else "Decided",
    )
    db.add(app_row)
    db.flush()
    app_row.application_id = f"LW-{app_row.created_at.year}-{app_row.id:06d}"
    db.commit()
    db.refresh(app_row)
    queue_email(db, app_row.email, tpl.application_received(app_row), "application_received", background, app_row.application_id)
    if not review:
        send_decision_email(db, app_row, background)
    return app_row


def thread(db: Session | None, application_id: str) -> list[ThreadMessage]:
    if db is None:
        return []
    rows = db.scalars(
        select(ApplicationMessage).where(ApplicationMessage.application_id == application_id).order_by(ApplicationMessage.id)
    ).all()
    return [ThreadMessage(author=r.author, body=r.body, created_at=r.created_at) for r in rows]


def add_message(db: Session, application_id: str, author: str, body: str) -> None:
    db.add(ApplicationMessage(application_id=application_id, author=author, body=body))


def _emi(a: Application) -> float | None:
    return dec.estimate_emi(a.loan_amount, a.interest_rate, a.tenure_months) if a.final_decision == dec.APPROVED else None


def send_decision_email(db: Session, a: Application, background: BackgroundTasks | None = None, updated: bool = False) -> None:
    kind = "decision_update" if updated else "decision"
    queue_email(db, a.email, tpl.decision(a, _emi(a), updated=updated), kind, background, a.application_id)


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


def mask_phone(phone: str) -> str:
    return f"{phone[:2]}******{phone[-2:]}"


def to_result(a: Application, db: Session | None = None) -> ApplicationResult:
    emi = _emi(a)
    created = a.created_at if a.created_at.tzinfo else a.created_at.replace(tzinfo=timezone.utc)
    pending = a.final_decision == "PENDING"
    # Explain the officer's final decision (it may differ from the model's recommendation).
    factors = [] if pending else dec.indicative_factors(
        a.engineered_features,
        {"House_Ownership": a.house_ownership, "Car_Ownership": a.car_ownership},
        get_predictor().metadata["medians"],
        a.final_decision,
    )
    return ApplicationResult(
        application_id=a.application_id,
        decision=a.final_decision,
        # The model's view stays internal until an officer has decided.
        model_decision=None if pending else a.decision,
        status=a.status,
        risk_class=None if pending else a.risk_class,
        default_probability=None if pending else round(a.default_probability, 4),
        approval_score=None if pending else round(1 - a.default_probability, 4),
        confidence=None if pending else round(a.confidence, 4),
        risk_band=None if pending else a.risk_band,
        indicative_factors=factors,
        engineered_features={} if pending else a.engineered_features,
        warnings=a.warnings,
        estimated_emi=emi,
        interest_rate=a.interest_rate,
        model_version=a.model_version,
        is_demo=a.is_demo,
        timestamp=created,
        officer_note_present=bool(a.officer_note),
        phone_verified=bool(a.phone_verified),
        emails=application_emails(db, a.application_id) if db is not None else [],
        messages=thread(db, a.application_id),
        decided_at=None if pending else a.reviewed_at,
        applicant=ApplicantSummary(
            full_name=a.full_name,
            email=a.email,
            phone_masked=mask_phone(a.phone),
            age=a.age,
            marital_status=_label("Married/Single", a.marital_status),
            profession=_label("Profession", a.profession),
            experience=a.experience,
            current_job_years=a.current_job_years,
            income=a.income,
            state=_label("STATE", a.state),
            city=_label("CITY", a.city),
            house_ownership=_label("House_Ownership", a.house_ownership),
            current_house_years=a.current_house_years,
            car_ownership=_label("Car_Ownership", a.car_ownership),
            loan_amount=a.loan_amount,
            tenure_months=a.tenure_months,
            purpose=a.purpose,
        ),
    )
