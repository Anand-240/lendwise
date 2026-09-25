from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.ml.predictor import get_predictor

Purpose = Literal["Personal", "Home", "Vehicle", "Education", "Business", "Medical", "Other"]
Decision = Literal["APPROVED", "REJECTED"]
FinalDecision = Literal["APPROVED", "REJECTED", "PENDING"]
Status = Literal["Pending Review", "Info Requested", "Decided", "Overridden", "Under Review"]

PHONE_RE = re.compile(r"^[6-9]\d{9}$")

# API field -> dataset column for the categorical model inputs.
CATEGORICAL_FIELDS = {
    "marital_status": "Married/Single",
    "house_ownership": "House_Ownership",
    "car_ownership": "Car_Ownership",
    "profession": "Profession",
    "state": "STATE",
    "city": "CITY",
}
# API field -> dataset column for numeric inputs that get soft range warnings.
NUMERIC_FIELDS = {
    "income": "Income",
    "age": "Age",
    "experience": "Experience",
    "current_job_years": "CURRENT_JOB_YRS",
    "current_house_years": "CURRENT_HOUSE_YRS",
}


class ModelInputs(BaseModel):
    """The 11 raw inputs the model uses. Category values are RAW dataset strings."""

    income: int = Field(ge=0, le=100_000_000, description="Annual income in INR")
    age: int = Field(ge=21, le=79)
    experience: int = Field(ge=0, le=61, description="Total years of work experience")
    marital_status: str
    house_ownership: str
    car_ownership: str
    profession: str
    city: str
    state: str
    current_job_years: int = Field(ge=0, le=61)
    current_house_years: int = Field(ge=0, le=79)

    @model_validator(mode="after")
    def _consistency(self) -> "ModelInputs":
        md = get_predictor().metadata
        errors = []
        for field, col in CATEGORICAL_FIELDS.items():
            allowed = {o["value"] for o in md["options"][col]}
            if getattr(self, field) not in allowed:
                errors.append(f"{field}: '{getattr(self, field)}' is not a recognised value")
        if self.experience > self.age - 18:
            errors.append("experience: cannot exceed age minus 18")
        if self.current_job_years > self.experience:
            errors.append("current_job_years: cannot exceed total experience")
        if self.state in md["state_to_cities"] and self.city not in md["state_to_cities"][self.state]:
            errors.append("city: does not belong to the selected state")
        if errors:
            raise ValueError("; ".join(errors))
        return self

    def to_model_row(self) -> dict[str, Any]:
        row: dict[str, Any] = {col: getattr(self, f) for f, col in CATEGORICAL_FIELDS.items()}
        row.update({col: getattr(self, f) for f, col in NUMERIC_FIELDS.items()})
        return row

    def range_warnings(self) -> list[str]:
        ranges = get_predictor().metadata["ranges"]
        warnings = []
        for field, col in NUMERIC_FIELDS.items():
            r = ranges.get(col)
            value = getattr(self, field)
            if r and not (r["min"] <= value <= r["max"]):
                warnings.append(
                    f"{field.replace('_', ' ').capitalize()} ({value:,}) is outside the range seen in "
                    f"training data ({r['min']:,.0f}–{r['max']:,.0f}); the prediction may be less reliable."
                )
        return warnings


class ApplicationCreate(ModelInputs):
    full_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str
    loan_amount: int = Field(ge=10_000, le=10_000_000)
    tenure_months: int = Field(ge=6, le=360)
    purpose: Purpose
    consent: bool
    phone_verification_token: str | None = Field(default=None, max_length=2000)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = re.sub(r"\s+", " ", v).strip()
        if len(v) < 2:
            raise ValueError("must be at least 2 characters")
        if not re.fullmatch(r"[A-Za-z][A-Za-z .'\-]*", v):
            raise ValueError("may contain letters, spaces, dots, apostrophes and hyphens only")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = re.sub(r"[\s\-]", "", v)
        if v.startswith("+91"):
            v = v[3:]
        if not PHONE_RE.fullmatch(v):
            raise ValueError("must be a 10-digit Indian mobile number starting with 6-9")
        return v

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("consent is required to process the application")
        return v


class Factor(BaseModel):
    key: str
    label: str
    direction: Literal["risk", "strength"]
    detail: str | None = None
    value: float | None = None
    median: float | None = None


class ApplicantSummary(BaseModel):
    full_name: str
    email: str
    phone_masked: str
    age: int
    marital_status: str
    profession: str
    experience: int
    current_job_years: int
    income: int
    state: str
    city: str
    house_ownership: str
    current_house_years: int
    car_ownership: str
    loan_amount: int
    tenure_months: int
    purpose: str


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
    """Applicant-facing view. While the application awaits an officer, model outputs are withheld."""

    application_id: str
    decision: FinalDecision
    model_decision: Decision | None
    status: Status
    risk_class: int | None
    default_probability: float | None
    approval_score: float | None
    confidence: float | None
    risk_band: Literal["Low", "Moderate", "High"] | None
    indicative_factors: list[Factor]
    engineered_features: dict[str, Any]
    warnings: list[str]
    estimated_emi: float | None
    interest_rate: float
    model_version: str
    is_demo: bool
    timestamp: datetime
    applicant: ApplicantSummary
    officer_note_present: bool = False
    phone_verified: bool = False
    emails: list[EmailSummary] = []
    messages: list[ThreadMessage] = []
    decided_at: datetime | None = None


class ApplicationCreated(ApplicationResult):
    access_token: str


class HealthOut(BaseModel):
    status: str
    model_loaded: bool
    mode: Literal["live", "demo"]
    model_version: str
    email_mode: Literal["live", "demo"]
    sms_mode: Literal["live", "demo"]


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
    phone: str
    loan_amount: int
    tenure_months: int
    purpose: str
    income: int
    age: int
    experience: int
    marital_status: str
    house_ownership: str
    car_ownership: str
    profession: str
    city: str
    state: str
    current_job_years: int
    current_house_years: int
    engineered_features: dict[str, Any]
    risk_class: int
    default_probability: float
    confidence: float
    risk_band: str
    decision: str
    final_decision: str
    indicative_factors: list[dict[str, Any]]
    warnings: list[str]
    model_version: str
    is_demo: bool
    interest_rate: float
    status: str
    officer_note: str | None
    reviewed_at: datetime | None
    phone_verified: bool
    messages: list[ThreadMessage] = []


class AdminPage(BaseModel):
    items: list[AdminApplication]
    total: int
    page: int
    page_size: int
    pages: int


class AdminUpdate(BaseModel):
    """Officer action. `note` is internal; `message` is shown and emailed to the applicant."""

    action: Literal["approve", "reject", "request_info"]
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
    replies: list["ReplyOut"] = []


class ReplyOut(BaseModel):
    created_at: datetime
    body: str
    status: str


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


class OtpSendIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = re.sub(r"[\s\-]", "", v)
        if v.startswith("+91"):
            v = v[3:]
        if not PHONE_RE.fullmatch(v):
            raise ValueError("must be a 10-digit Indian mobile number starting with 6-9")
        return v


class OtpSendOut(BaseModel):
    verification_id: str
    phone_masked: str
    expires_in: int
    resend_after: int
    mode: Literal["live", "demo"]
    demo_code: str | None = None


class OtpVerifyIn(BaseModel):
    verification_id: str = Field(min_length=10, max_length=64)
    code: str = Field(pattern=r"^\d{6}$")


class OtpVerifyOut(BaseModel):
    verified: bool
    token: str
    expires_in: int


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

ContactOut.model_rebuild()
