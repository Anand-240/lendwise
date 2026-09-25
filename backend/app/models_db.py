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
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    application_id: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    access_token: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)

    # Applicant (PII: never logged)
    full_name: Mapped[str] = mapped_column(String(80), index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    phone: Mapped[str] = mapped_column(String(10))
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Loan details (recorded, NOT model inputs)
    loan_amount: Mapped[int] = mapped_column(Integer)
    tenure_months: Mapped[int] = mapped_column(Integer)
    purpose: Mapped[str] = mapped_column(String(20))

    # The 11 raw model inputs
    income: Mapped[int] = mapped_column(Integer)
    age: Mapped[int] = mapped_column(Integer)
    experience: Mapped[int] = mapped_column(Integer)
    marital_status: Mapped[str] = mapped_column(String(20))
    house_ownership: Mapped[str] = mapped_column(String(20))
    car_ownership: Mapped[str] = mapped_column(String(5))
    profession: Mapped[str] = mapped_column(String(64), index=True)
    city: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(64), index=True)
    current_job_years: Mapped[int] = mapped_column(Integer)
    current_house_years: Mapped[int] = mapped_column(Integer)

    # Model output
    engineered_features: Mapped[dict] = mapped_column(JSON)
    risk_class: Mapped[int] = mapped_column(Integer)
    default_probability: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    risk_band: Mapped[str] = mapped_column(String(10), index=True)
    decision: Mapped[str] = mapped_column(String(10), index=True)  # original model decision, immutable
    final_decision: Mapped[str] = mapped_column(String(10), index=True)  # after any officer override
    indicative_factors: Mapped[list] = mapped_column(JSON)
    warnings: Mapped[list] = mapped_column(JSON)
    model_version: Mapped[str] = mapped_column(String(40))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    interest_rate: Mapped[float] = mapped_column(Float)

    # Officer workflow
    status: Mapped[str] = mapped_column(String(20), default="Decided", index=True)
    officer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254))
    topic: Mapped[str] = mapped_column(String(20))
    application_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)



class OutboundEmail(Base):
    """Every email the platform sends. In demo mode rows are kept as a viewable outbox."""

    __tablename__ = "outbound_emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    to_email: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(200))
    html: Mapped[str] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)
    application_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    message_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(12), default="queued")  # queued | sent | failed | demo
    provider: Mapped[str] = mapped_column(String(12))  # resend | demo
    provider_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)


class PhoneVerification(Base):
    __tablename__ = "phone_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    phone: Mapped[str] = mapped_column(String(10), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    provider: Mapped[str] = mapped_column(String(12))  # twilio | demo
    code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
