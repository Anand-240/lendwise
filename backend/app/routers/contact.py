from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import email_templates as tpl
from app.db import get_db
from app.emailer import queue_email
from app.middleware import RateLimiter, client_key
from app.models_db import ContactMessage
from app.schemas import ContactCreate, ContactCreated

router = APIRouter(tags=["public"])
contact_limiter = RateLimiter(5)
global_contact_limiter = RateLimiter(60)


@router.post("/contact", response_model=ContactCreated, status_code=status.HTTP_201_CREATED)
def create_message(
    body: ContactCreate, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)
) -> ContactCreated:
    wait = global_contact_limiter.hit("*") or contact_limiter.hit(client_key(request))
    if wait is not None:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many messages. Please try again in a minute.",
                            headers={"Retry-After": str(int(wait) + 1)})
    msg = ContactMessage(
        name=body.name, email=body.email.lower(), topic=body.topic, application_id=body.application_id, message=body.message
    )
    db.add(msg)
    db.flush()
    msg.reference = f"LW-MSG-{msg.id:06d}"
    db.commit()
    queue_email(db, msg.email, tpl.contact_ack(msg), "contact_ack", background, msg.application_id, msg.id)
    return ContactCreated(reference=msg.reference)
