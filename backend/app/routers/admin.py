import csv
import io
import math
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.auth import create_token, require_officer, verify_credentials
from app.config import get_settings
from app.db import get_db
from app.middleware import RateLimiter, client_key
from app.services import add_message, thread
from app.models_db import Application, ContactMessage, utcnow
from app.schemas import AdminApplication, AdminPage, AdminUpdate, ContactOut, ContactPage, LoginIn, LoginOut, MessageUpdate

router = APIRouter(prefix="/admin", tags=["officer"])
login_limiter = RateLimiter(10)

def _tz() -> ZoneInfo:
    return ZoneInfo(get_settings().business_timezone)


SORTABLE = {
    "created_at": Application.created_at,
    "default_probability": Application.default_probability,
    "eligibility_score": Application.eligibility_score,
    "loan_amount": Application.loan_amount,
    "fico": Application.fico,
    "full_name": Application.full_name,
}


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request) -> LoginOut:
    wait = login_limiter.hit(client_key(request))
    if wait is not None:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Try again shortly.",
                            headers={"Retry-After": str(int(wait) + 1)})
    if not verify_credentials(body.email, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token, expires = create_token(body.email.lower())
    return LoginOut(access_token=token, expires_in=expires)


def _filtered(
    q: str | None,
    decision: str | None,
    recommendation: str | None,
    risk_tier: str | None,
    eligibility_tier: str | None,
    status_: str | None,
    flagged: bool | None,
    date_from: date | None,
    date_to: date | None,
) -> Select:
    stmt = select(Application)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Application.full_name.ilike(like), Application.application_id.ilike(like)))
    if decision:
        stmt = stmt.where(Application.final_decision == decision)
    if recommendation:
        stmt = stmt.where(Application.recommendation == recommendation)
    if risk_tier:
        stmt = stmt.where(Application.risk_tier == risk_tier)
    if eligibility_tier:
        stmt = stmt.where(Application.eligibility_tier == eligibility_tier)
    if status_:
        stmt = stmt.where(Application.status == status_)
    if flagged is not None:
        stmt = stmt.where(Application.guard_flagged.is_(flagged))
    if date_from:
        stmt = stmt.where(Application.created_at >= datetime.combine(date_from, time.min, tzinfo=_tz()))
    if date_to:
        stmt = stmt.where(Application.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=_tz()))
    return stmt


class _Filters:
    def __init__(
        self,
        q: str | None = Query(None, max_length=80, description="Search by applicant name or application ID"),
        decision: Literal["APPROVED", "REJECTED", "PENDING"] | None = None,
        recommendation: Literal["APPROVE", "REVIEW", "REJECT"] | None = None,
        risk_tier: Literal["Low", "Moderate", "High"] | None = None,
        eligibility_tier: Literal["Likely", "Borderline", "Unlikely"] | None = None,
        status: Literal["Pending Review", "Info Requested", "Decided", "Overridden"] | None = None,
        flagged: bool | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ):
        self.stmt = _filtered(q, decision, recommendation, risk_tier, eligibility_tier, status, flagged, date_from, date_to)


@router.get("/applications/export.csv")
def export_csv(filters: _Filters = Depends(), _: str = Depends(require_officer), db: Session = Depends(get_db)):
    rows = db.scalars(filters.stmt.order_by(Application.created_at.desc())).all()
    fields = [
        "application_id", "created_at", "full_name", "email", "purpose", "loan_amount", "fico", "dti",
        "eligibility_score", "eligibility_tier", "default_probability", "expected_loss", "risk_tier",
        "guard_flagged", "recommendation", "counter_offer", "final_decision", "approved_amount", "status",
        "officer_note", "model_version",
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(fields)
    for r in rows:
        values = []
        for f in fields:
            v = getattr(r, f)
            if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
                v = "'" + v  # neutralise spreadsheet formula injection
            values.append(v.isoformat() if isinstance(v, datetime) else v)
        writer.writerow(values)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="lendwise-applications-{stamp}.csv"'},
    )


@router.get("/applications", response_model=AdminPage)
def list_applications(
    filters: _Filters = Depends(),
    sort: Literal["created_at", "default_probability", "eligibility_score", "loan_amount", "fico", "full_name"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: str = Depends(require_officer),
    db: Session = Depends(get_db),
) -> AdminPage:
    total = db.scalar(select(func.count()).select_from(filters.stmt.subquery())) or 0
    col = SORTABLE[sort]
    stmt = filters.stmt.order_by(col.asc() if order == "asc" else col.desc(), Application.id.desc())
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return AdminPage(
        items=[AdminApplication.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


def _get(db: Session, application_id: str) -> Application:
    row = db.scalar(select(Application).where(Application.application_id == application_id.upper()))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return row


def _detail(db: Session, row: Application) -> AdminApplication:
    return AdminApplication.model_validate(row).model_copy(update={"messages": thread(db, row.application_id)})


@router.get("/applications/{application_id}", response_model=AdminApplication)
def get_application(application_id: str, _: str = Depends(require_officer), db: Session = Depends(get_db)):
    return _detail(db, _get(db, application_id))


@router.patch("/applications/{application_id}", response_model=AdminApplication)
def update_application(
    application_id: str,
    body: AdminUpdate,
    officer: str = Depends(require_officer),
    db: Session = Depends(get_db),
):
    row = _get(db, application_id)
    stamp = utcnow().strftime("%Y-%m-%d %H:%M UTC")

    def log(text: str) -> None:
        entry = f"[{stamp}] {officer}: {text}"
        row.officer_note = f"{row.officer_note}\n{entry}" if row.officer_note else entry

    if body.action == "request_info":
        row.status = "Info Requested"
        add_message(db, row.application_id, "officer", body.message)
        log(f"Requested more information. {body.note or ''}".strip())
        row.reviewed_at = utcnow()
        db.commit()
        db.refresh(row)
        return _detail(db, row)

    if body.action == "approve_counter_offer" and row.counter_offer is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This application has no counter-offer to approve.")
    new_decision = "REJECTED" if body.action == "reject" else "APPROVED"
    amount = None if new_decision == "REJECTED" else (row.counter_offer if body.action == "approve_counter_offer" else row.loan_amount)
    # Going against a clear APPROVE or REJECT recommendation is an override and needs a reason.
    # Approving the counter-offer follows the rules, because the rules approve that amount.
    against_model = (
        (row.recommendation == "APPROVE" and new_decision == "REJECTED")
        or (row.recommendation == "REJECT" and body.action == "approve")
    )
    if against_model and (not body.note or len(body.note) < 5):
        raise RequestValidationError(
            [{"loc": ("body", "note"), "msg": "Add a note (at least 5 characters) explaining why you are going against the recommendation.", "type": "value_error"}]
        )
    row.final_decision = new_decision
    row.approved_amount = amount
    row.status = "Overridden" if against_model else "Decided"
    verb = "Rejected" if new_decision == "REJECTED" else (
        f"Approved the counter-offer of ${amount:,.0f}" if body.action == "approve_counter_offer" else f"Approved ${amount:,.0f}"
    )
    log(f"{verb}{' (against the recommendation)' if against_model else ''}." + (f" {body.note}" if body.note else ""))
    if body.message:
        add_message(db, row.application_id, "officer", body.message)
    row.reviewed_at = utcnow()
    db.commit()
    db.refresh(row)
    return _detail(db, row)


@router.delete("/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: str, _: str = Depends(require_officer), db: Session = Depends(get_db)):
    """Permanently delete an application (e.g. an applicant's data-deletion request)."""
    db.delete(_get(db, application_id))
    db.commit()


@router.get("/messages", response_model=ContactPage)
def list_messages(
    resolved: bool | None = None,
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(require_officer),
    db: Session = Depends(get_db),
) -> ContactPage:
    stmt = select(ContactMessage)
    if resolved is not None:
        stmt = stmt.where(ContactMessage.resolved == resolved)
    rows = db.scalars(stmt.order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc()).limit(limit)).all()
    total = db.scalar(select(func.count()).select_from(ContactMessage)) or 0
    unresolved = db.scalar(select(func.count()).select_from(ContactMessage).where(ContactMessage.resolved.is_(False))) or 0
    items = [ContactOut.model_validate(r) for r in rows]
    return ContactPage(items=items, total=total, unresolved=unresolved)


@router.patch("/messages/{message_id}", response_model=ContactOut)
def update_message(message_id: int, body: MessageUpdate, _: str = Depends(require_officer), db: Session = Depends(get_db)):
    msg = db.get(ContactMessage, message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    msg.resolved = body.resolved
    db.commit()
    db.refresh(msg)
    return msg


@router.get("/stats")
def stats(days: int = Query(30, ge=7, le=365), _: str = Depends(require_officer), db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            Application.created_at,
            Application.final_decision,
            Application.recommendation,
            Application.default_probability,
            Application.eligibility_score,
            Application.eligibility_tier,
            Application.risk_tier,
            Application.guard_flagged,
            Application.counter_offer,
            Application.status,
        )
    ).all()

    total = len(rows)
    approved = sum(1 for r in rows if r.final_decision == "APPROVED")
    rejected = sum(1 for r in rows if r.final_decision == "REJECTED")
    decided = approved + rejected
    # Agreement: officer decisions on clear APPROVE / REJECT recommendations that followed them.
    clear = [r for r in rows if r.final_decision != "PENDING" and r.recommendation in ("APPROVE", "REJECT")]
    agreed = sum(1 for r in clear if (r.recommendation == "APPROVE") == (r.final_decision == "APPROVED"))

    tz = _tz()
    today = datetime.now(tz).date()
    start = today - timedelta(days=days - 1)
    per_day: dict[date, Counter] = defaultdict(Counter)
    for r in rows:
        d = r.created_at.astimezone(tz).date()
        if d >= start:
            per_day[d][r.final_decision] += 1

    edges = [0, 5, 10, 12, 15, 20, 22, 30, 100]
    bins = [0] * (len(edges) - 1)
    for r in rows:
        for i in range(len(bins)):
            if r.default_probability < edges[i + 1] or i == len(bins) - 1:
                bins[i] += 1
                break

    return {
        "total": total,
        "approved": approved,
        "rejected": rejected,
        "approval_rate": approved / decided if decided else 0.0,
        "rejection_rate": rejected / decided if decided else 0.0,
        "awaiting_review": sum(1 for r in rows if r.final_decision == "PENDING"),
        "info_requested": sum(1 for r in rows if r.status == "Info Requested"),
        "overridden": sum(1 for r in rows if r.status == "Overridden"),
        "flagged": sum(1 for r in rows if r.guard_flagged),
        "counter_offers": sum(1 for r in rows if r.counter_offer is not None),
        "agreement_rate": agreed / len(clear) if clear else None,
        "avg_default_probability": (sum(r.default_probability for r in rows) / total) if total else 0.0,
        "avg_eligibility": (sum(r.eligibility_score for r in rows) / total) if total else 0.0,
        "by_recommendation": {k: sum(1 for r in rows if r.recommendation == k) for k in ("APPROVE", "REVIEW", "REJECT")},
        "by_eligibility_tier": {k: sum(1 for r in rows if r.eligibility_tier == k) for k in ("Likely", "Borderline", "Unlikely")},
        "by_risk_tier": {k: sum(1 for r in rows if r.risk_tier == k) for k in ("Low", "Moderate", "High")},
        "per_day": [
            {
                "date": (start + timedelta(days=i)).isoformat(),
                "approved": per_day[start + timedelta(days=i)]["APPROVED"],
                "rejected": per_day[start + timedelta(days=i)]["REJECTED"],
                "pending": per_day[start + timedelta(days=i)]["PENDING"],
            }
            for i in range(days)
        ],
        "probability_histogram": [
            {"bucket": f"{edges[i]} to {edges[i + 1]}%" if i < len(bins) - 1 else f"{edges[i]}%+", "count": bins[i]}
            for i in range(len(bins))
        ],
    }
