import csv
import io
import math
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.auth import create_token, require_officer, verify_credentials
from app.config import get_settings
from app import email_templates as tpl
from app.db import get_db
from app.emailer import queue_email
from app.middleware import RateLimiter, client_key
from app.ml.predictor import get_predictor
from app.services import add_message, send_decision_email, thread
from app.models_db import Application, ContactMessage, OutboundEmail, utcnow
from app.schemas import AdminApplication, AdminPage, AdminUpdate, AdminEmail, AdminEmailPage, ContactOut, ContactPage, LoginIn, LoginOut, MessageUpdate, ReplyIn, ReplyOut

router = APIRouter(prefix="/admin", tags=["officer"])
login_limiter = RateLimiter(10)

def _tz() -> ZoneInfo:
    return ZoneInfo(get_settings().business_timezone)


SORTABLE = {
    "created_at": Application.created_at,
    "default_probability": Application.default_probability,
    "loan_amount": Application.loan_amount,
    "income": Application.income,
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
    risk_band: str | None,
    status_: str | None,
    date_from: date | None,
    date_to: date | None,
) -> Select:
    stmt = select(Application)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Application.full_name.ilike(like), Application.application_id.ilike(like)))
    if decision:
        stmt = stmt.where(Application.final_decision == decision)
    if risk_band:
        stmt = stmt.where(Application.risk_band == risk_band)
    if status_:
        stmt = stmt.where(Application.status == status_)
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
        risk_band: Literal["Low", "Moderate", "High"] | None = None,
        status: Literal["Pending Review", "Info Requested", "Decided", "Overridden", "Under Review"] | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ):
        self.stmt = _filtered(q, decision, risk_band, status, date_from, date_to)


@router.get("/applications/export.csv")
def export_csv(filters: _Filters = Depends(), _: str = Depends(require_officer), db: Session = Depends(get_db)):
    rows = db.scalars(filters.stmt.order_by(Application.created_at.desc())).all()
    fields = [
        "application_id", "created_at", "full_name", "email", "phone", "loan_amount", "tenure_months", "purpose",
        "income", "age", "experience", "marital_status", "house_ownership", "car_ownership", "profession", "city",
        "state", "current_job_years", "current_house_years", "risk_class", "default_probability", "confidence",
        "risk_band", "decision", "final_decision", "status", "officer_note", "model_version", "is_demo",
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["model_decision" if f == "decision" else f for f in fields])
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
    sort: Literal["created_at", "default_probability", "loan_amount", "income", "full_name"] = "created_at",
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
    background: BackgroundTasks,
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
        queue_email(db, row.email, tpl.info_requested(row, body.message), "info_requested", background, row.application_id)
        return _detail(db, row)

    new_decision = "APPROVED" if body.action == "approve" else "REJECTED"
    against_model = new_decision != row.decision
    if against_model and (not body.note or len(body.note) < 5):
        raise RequestValidationError(
            [{"loc": ("body", "note"), "msg": "Add a note (at least 5 characters) explaining why you are going against the model.", "type": "value_error"}]
        )
    already_decided = row.final_decision in ("APPROVED", "REJECTED")
    changed = row.final_decision != new_decision
    row.final_decision = new_decision
    row.status = "Overridden" if against_model else "Decided"
    log(f"{'Approved' if new_decision == 'APPROVED' else 'Rejected'}{' (against model recommendation)' if against_model else ''}."
        + (f" {body.note}" if body.note else ""))
    if body.message:
        add_message(db, row.application_id, "officer", body.message)
    row.reviewed_at = utcnow()
    db.commit()
    db.refresh(row)
    if changed:
        # The applicant is told the outcome; the officer's internal note is never included.
        send_decision_email(db, row, background, updated=already_decided)
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
    replies: dict[int, list[ReplyOut]] = {}
    if rows:
        for e in db.scalars(
            select(OutboundEmail)
            .where(OutboundEmail.kind == "contact_reply", OutboundEmail.message_id.in_([r.id for r in rows]))
            .order_by(OutboundEmail.id)
        ):
            body = e.text.split("\n\n", 1)[1].rsplit("\n\nRegards,", 1)[0] if "\n\n" in e.text else e.text
            replies.setdefault(e.message_id, []).append(ReplyOut(created_at=e.created_at, body=body, status=e.status))
    items = [ContactOut.model_validate(r).model_copy(update={"replies": replies.get(r.id, [])}) for r in rows]
    return ContactPage(items=items, total=total, unresolved=unresolved)


@router.post("/messages/{message_id}/reply", response_model=AdminEmail, status_code=status.HTTP_201_CREATED)
def reply_to_message(
    message_id: int, body: ReplyIn, background: BackgroundTasks, _: str = Depends(require_officer), db: Session = Depends(get_db)
):
    msg = db.get(ContactMessage, message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    email = queue_email(db, msg.email, tpl.contact_reply(msg, body.body), "contact_reply", background, msg.application_id, msg.id)
    if body.resolve and not msg.resolved:
        msg.resolved = True
        db.commit()
    return email


@router.get("/emails", response_model=AdminEmailPage)
def list_emails(
    application_id: str | None = None,
    message_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    _: str = Depends(require_officer),
    db: Session = Depends(get_db),
) -> AdminEmailPage:
    stmt = select(OutboundEmail)
    if application_id:
        stmt = stmt.where(OutboundEmail.application_id == application_id.upper())
    if message_id:
        stmt = stmt.where(OutboundEmail.message_id == message_id)
    rows = db.scalars(stmt.order_by(OutboundEmail.id.desc()).limit(limit)).all()
    total = db.scalar(select(func.count()).select_from(OutboundEmail)) or 0
    return AdminEmailPage(items=[AdminEmail.model_validate(r) for r in rows], total=total, mode=get_settings().email_mode)


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
            Application.default_probability,
            Application.profession,
            Application.state,
            Application.risk_band,
            Application.status,
            Application.is_demo,
        )
    ).all()
    md = get_predictor().metadata["options"]
    labels = {col: {o["value"]: o["label"] for o in md[col]} for col in ("Profession", "STATE")}

    total = len(rows)
    approved = sum(1 for r in rows if r.final_decision == "APPROVED")
    rejected = sum(1 for r in rows if r.final_decision == "REJECTED")
    decided = approved + rejected
    awaiting = sum(1 for r in rows if r.final_decision == "PENDING")

    tz = _tz()
    today = datetime.now(tz).date()
    start = today - timedelta(days=days - 1)
    per_day: dict[date, Counter] = defaultdict(Counter)
    for r in rows:
        d = r.created_at.astimezone(tz).date()
        if d >= start:
            per_day[d][r.final_decision] += 1

    def group(attr: str, col: str, top: int = 10):
        g: dict[str, Counter] = defaultdict(Counter)
        for r in rows:
            if r.final_decision in ("APPROVED", "REJECTED"):
                g[getattr(r, attr)][r.final_decision] += 1
        out = [
            {
                "value": k,
                "label": labels[col].get(k, k),
                "total": c["APPROVED"] + c["REJECTED"],
                "approved": c["APPROVED"],
                "rejected": c["REJECTED"],
                "approval_rate": c["APPROVED"] / (c["APPROVED"] + c["REJECTED"]),
            }
            for k, c in g.items()
        ]
        return sorted(out, key=lambda x: (-x["total"], x["label"]))[:top]

    bins = [0] * 10
    for r in rows:
        bins[min(int(r.default_probability * 10), 9)] += 1

    return {
        "total": total,
        "approved": approved,
        "rejected": rejected,
        "approval_rate": approved / decided if decided else 0.0,
        "rejection_rate": rejected / decided if decided else 0.0,
        "awaiting_review": awaiting,
        "info_requested": sum(1 for r in rows if r.status == "Info Requested"),
        "model_would_approve": sum(1 for r in rows if r.final_decision == "PENDING" and r.default_probability < 0.5),
        "avg_default_probability": (sum(r.default_probability for r in rows) / total) if total else 0.0,
        "under_review": sum(1 for r in rows if r.status == "Under Review"),
        "overridden": sum(1 for r in rows if r.status == "Overridden"),
        "demo_count": sum(1 for r in rows if r.is_demo),
        "by_risk_band": {b: sum(1 for r in rows if r.risk_band == b) for b in ("Low", "Moderate", "High")},
        "per_day": [
            {
                "date": (start + timedelta(days=i)).isoformat(),
                "approved": per_day[start + timedelta(days=i)]["APPROVED"],
                "rejected": per_day[start + timedelta(days=i)]["REJECTED"],
            }
            for i in range(days)
        ],
        "probability_histogram": [
            {"bucket": f"{i * 10}–{(i + 1) * 10}%", "count": bins[i]} for i in range(10)
        ],
        "by_profession": group("profession", "Profession"),
        "by_state": group("state", "STATE"),
    }
