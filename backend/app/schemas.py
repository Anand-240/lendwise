from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Purpose = Literal[
    "Debt consolidation", "Credit card refinancing", "Home improvement", "Major purchase",
    "Car", "Medical", "Business", "Other",
]
PURPOSES: tuple[str, ...] = Purpose.__args__  # type: ignore[attr-defined]
Recommendation = Literal["APPROVE", "REVIEW", "REJECT"]
FinalDecision = Literal["APPROVED", "REJECTED", "PENDING"]
Status = Literal["Pending Review", "Info Requested", "Decided", "Overridden"]


# ---- Screening ------------------------------------------------------------------------------------
class ScreenIn(BaseModel):
    """Documentation only: the endpoint accepts any JSON and runs the report's validator on it."""

    loan_amount: float | str = Field(description="US dollars, 500 to 40,000. Numbers or numeric text such as \"15,000\".")
    fico: int | str = Field(description="Whole number, 300 to 850.")
    dti: float | str = Field(description="Debt-to-income ratio in percent, 0 to 100. An optional % sign is allowed.")


class Eligibility(BaseModel):
    score: float
    tier: Literal["Likely", "Borderline", "Unlikely"]


class ChargeOff(BaseModel):
    probability: float
    tier: Literal["Low", "Moderate", "High"]
    expected_loss: float


class Guard(BaseModel):
    flagged: bool
    reasons: list[str]


class CounterOffer(BaseModel):
    loan_amount: float
    eligibility: Eligibility
    charge_off: ChargeOff


class ScreenInputs(BaseModel):
    loan_amount: float
    fico: int
    dti: float


class ScreeningOut(BaseModel):
    inputs: ScreenInputs
    eligibility: Eligibility
    charge_off: ChargeOff | None
    decision: Recommendation
    reasons: list[str]
    guard: Guard
    counter_offer: CounterOffer | None
    model_version: str
    elapsed_ms: float | None = None


# ---- Applications ---------------------------------------------------------------------------------
class ApplicationCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    purpose: Purpose
    consent: bool
    # Validated by app.ml.validator (Table A.1) so the API, the form and the tests share one rule set.
    loan_amount: Any = None
    fico: Any = None
    dti: Any = None

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = re.sub(r"\s+", " ", v).strip()
        if len(v) < 2:
            raise ValueError("must be at least 2 characters")
        if not re.fullmatch(r"[A-Za-z][A-Za-z .'\-]*", v):
            raise ValueError("may contain letters, spaces, dots, apostrophes and hyphens only")
        return v

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("consent is required to process the application")
        return v


class ApplicantSummary(BaseModel):
    full_name: str
    email: str
    purpose: str
    loan_amount: float
    fico: int
    dti: float


class EmailSummary(BaseModel):
    id: int
    kind: str
    subject: str
    to_masked: str
    created_at: datetime
    status: str
    html: str


class ThreadMessage(BaseModel):
    author: Literal["officer", "applicant"]
    body: str
    created_at: datetime


class ApplicationResult(BaseModel):
    """Applicant-facing view: the screening result plus the officer's final decision."""

    application_id: str
    status: Status
    decision: FinalDecision
    approved_amount: float | None
    screening: ScreeningOut
    applicant: ApplicantSummary
    timestamp: datetime
    decided_at: datetime | None = None
    emails: list[EmailSummary] = []
    messages: list[ThreadMessage] = []


class ApplicationCreated(ApplicationResult):
    access_token: str


class HealthOut(BaseModel):
    status: str
    model_loaded: bool
    mode: Literal["live", "unavailable"]
    model_version: str
    database: Literal["ok", "unavailable"]
    email_mode: Literal["live", "demo"]


# ---- Officer --------------------------------------------------------------------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AdminApplication(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: str
    created_at: datetime
    updated_at: datetime
    full_name: str
    email: str
    purpose: str
    loan_amount: float
    fico: int
    dti: float
    eligibility_score: float
    eligibility_tier: str
    default_probability: float
    expected_loss: float
    risk_tier: str
    guard_flagged: bool
    guard_reasons: list[str]
    recommendation: str
    recommendation_reasons: list[str]
    counter_offer: float | None
    model_version: str
    final_decision: str
    approved_amount: float | None
    status: str
    officer_note: str | None
    reviewed_at: datetime | None
    messages: list[ThreadMessage] = []


class AdminPage(BaseModel):
    items: list[AdminApplication]
    total: int
    page: int
    page_size: int
    pages: int


class AdminUpdate(BaseModel):
    """Officer action. `note` is internal; `message` is shown and emailed to the applicant."""

    action: Literal["approve", "approve_counter_offer", "reject", "request_info"]
    note: str | None = Field(default=None, max_length=2000)
    message: str | None = Field(default=None, max_length=2000)

    @field_validator("note", "message")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None

    @model_validator(mode="after")
    def _requirements(self) -> "AdminUpdate":
        if self.action == "request_info" and (not self.message or len(self.message) < 10):
            raise ValueError("message: describe what you need from the applicant (at least 10 characters)")
        return self


class ApplicantReplyIn(BaseModel):
    message: str = Field(min_length=5, max_length=2000)
    email: EmailStr | None = None

    @field_validator("message")
    @classmethod
    def _strip_msg(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("please write at least 5 characters")
        return v


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    topic: Literal["Application", "Decision", "Privacy", "Other"]
    application_id: str | None = Field(default=None, max_length=32)
    message: str = Field(min_length=10, max_length=2000)

    @field_validator("name", "message")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("is too short")
        return v

    @field_validator("application_id")
    @classmethod
    def _app_id(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not re.fullmatch(r"LW-\d{4}-\d{6}", v):
            raise ValueError("must look like LW-2026-000123")
        return v


class ContactCreated(BaseModel):
    reference: str


class ReplyOut(BaseModel):
    created_at: datetime
    body: str
    status: str


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    created_at: datetime
    name: str
    email: str
    topic: str
    application_id: str | None
    message: str
    resolved: bool
    replies: list[ReplyOut] = []


class ContactPage(BaseModel):
    items: list[ContactOut]
    total: int
    unresolved: int


class MessageUpdate(BaseModel):
    resolved: bool


class ReplyIn(BaseModel):
    body: str = Field(min_length=5, max_length=5000)
    resolve: bool = True

    @field_validator("body")
    @classmethod
    def _strip_body(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("a reply of at least 5 characters is required")
        return v


class AdminEmail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    kind: str
    to_email: str
    subject: str
    html: str
    text: str
    application_id: str | None
    message_id: int | None
    status: str
    provider: str
    error: str | None


class AdminEmailPage(BaseModel):
    items: list[AdminEmail]
    total: int
    mode: Literal["live", "demo"]
