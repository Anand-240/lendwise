"""Database tables.

Tables use an `lw_` prefix. The earlier Random Forest version stored applicants under different
names (`applications` and so on); those tables are left untouched, and the new
ones are created next to them on first start.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Stores UTC; always returns timezone-aware datetimes (SQLite drops tzinfo)."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Application(Base):
    __tablename__ = "lw_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    application_id: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    access_token: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)

    # Applicant (PII: never logged)
    full_name: Mapped[str] = mapped_column(String(80), index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    purpose: Mapped[str] = mapped_column(String(32))  # recorded only, not a model input

    # The three model inputs, as validated
    loan_amount: Mapped[float] = mapped_column(Float)
    fico: Mapped[int] = mapped_column(Integer)
    dti: Mapped[float] = mapped_column(Float)

    # Screening result
    eligibility_score: Mapped[float] = mapped_column(Float)
    eligibility_tier: Mapped[str] = mapped_column(String(12), index=True)
    default_probability: Mapped[float] = mapped_column(Float)  # percent, 0 to 100
    expected_loss: Mapped[float] = mapped_column(Float)  # percent of principal
    risk_tier: Mapped[str] = mapped_column(String(12), index=True)
    guard_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    guard_reasons: Mapped[list] = mapped_column(JSON)
    recommendation: Mapped[str] = mapped_column(String(10), index=True)  # APPROVE | REVIEW | REJECT, immutable
    recommendation_reasons: Mapped[list] = mapped_column(JSON)
    counter_offer: Mapped[float | None] = mapped_column(Float, nullable=True)
    screening: Mapped[dict] = mapped_column(JSON)  # full result, exactly as the screening endpoint returned it
    model_version: Mapped[str] = mapped_column(String(40))

    # Officer workflow: the officer makes the final decision.
    final_decision: Mapped[str] = mapped_column(String(10), default="PENDING", index=True)  # PENDING | APPROVED | REJECTED
    approved_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="Pending Review", index=True)
    officer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class ApplicationMessage(Base):
    """Applicant-visible conversation on an application (officer questions and applicant replies)."""

    __tablename__ = "lw_application_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    application_id: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    author: Mapped[str] = mapped_column(String(12))  # officer | applicant
    body: Mapped[str] = mapped_column(Text)


class ContactMessage(Base):
    __tablename__ = "lw_contact_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254))
    topic: Mapped[str] = mapped_column(String(20))
    application_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
