import httpx

from app import emailer
from app.config import get_settings
from tests.conftest import needs_models
from tests.test_api import APPLICANT


@needs_models
def test_application_emails_in_demo_outbox(client, officer):
    created = client.post("/api/v1/applications", json={**APPLICANT, "full_name": "Mail Tester", "email": "mail@example.com",
                                                        "loan_amount": 5000, "dti": 10}).json()
    # Only the receipt goes out on submission; the decision email waits for the officer.
    assert [e["kind"] for e in created["emails"]] == ["application_received"]
    e = created["emails"][0]
    assert e["status"] == "demo" and e["to_masked"].startswith("m") and "*" in e["to_masked"]
    assert created["application_id"] in e["html"] and "$5,000" in e["html"] and "loan officer will review" in e["html"]

    aid = created["application_id"]
    client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "approve", "note": "Internal secret note"}, headers=officer)
    outbox = client.get("/api/v1/admin/emails", params={"application_id": aid}, headers=officer).json()
    assert outbox["mode"] == "demo"
    decision_mails = [m for m in outbox["items"] if m["kind"] == "decision"]
    assert len(decision_mails) == 1 and "Internal secret note" not in decision_mails[0]["html"]
    # Repeating the same decision sends nothing new.
    client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "approve"}, headers=officer)
    again = client.get("/api/v1/admin/emails", params={"application_id": aid}, headers=officer).json()
    assert len([m for m in again["items"] if m["kind"] in ("decision", "decision_update")]) == 1
    # Changing it later sends an update.
    client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "reject", "note": "Changed after re-check"}, headers=officer)
    status = client.get(f"/api/v1/applications/{aid}/status", params={"email": "mail@example.com"}).json()
    assert [m["kind"] for m in status["emails"]] == ["application_received", "decision", "decision_update"]


def test_contact_ack_and_officer_reply(client, officer):
    ref = client.post("/api/v1/contact", json={"name": "Reply Tester", "email": "reply@example.com", "topic": "Other",
                                               "message": "Hello <script>alert(1)</script> team"}).json()["reference"]
    inbox = client.get("/api/v1/admin/messages", headers=officer).json()
    msg = next(m for m in inbox["items"] if m["reference"] == ref)
    ack = client.get("/api/v1/admin/emails", params={"message_id": msg["id"]}, headers=officer).json()["items"]
    assert ack[0]["kind"] == "contact_ack" and "<script>" not in ack[0]["html"] and "&lt;script&gt;" in ack[0]["html"]
    assert client.post(f"/api/v1/admin/messages/{msg['id']}/reply", json={"body": "hi"}, headers=officer).status_code == 422
    r = client.post(f"/api/v1/admin/messages/{msg['id']}/reply", json={"body": "Thanks, we have looked into it."}, headers=officer)
    assert r.status_code == 201 and r.json()["kind"] == "contact_reply" and r.json()["to_email"] == "reply@example.com"
    after = client.get("/api/v1/admin/messages", params={"resolved": True}, headers=officer).json()
    m2 = next(m for m in after["items"] if m["id"] == msg["id"])
    assert m2["resolved"] is True and m2["replies"][0]["body"] == "Thanks, we have looked into it."
    assert client.post("/api/v1/admin/messages/999999/reply", json={"body": "Hello there"}, headers=officer).status_code == 404


def test_live_email_delivery_via_resend(client, monkeypatch):
    sent = {}

    def fake_post(url, json, headers, timeout):
        sent.update(url=url, json=json, auth=headers["Authorization"])
        return httpx.Response(200, json={"id": "re_123"})

    monkeypatch.setattr(get_settings(), "resend_api_key", "re_test_key")
    monkeypatch.setattr(emailer.httpx, "post", fake_post)
    from app.db import SessionLocal
    from app.email_templates import Rendered

    db = SessionLocal()
    row = emailer.queue_email(db, "live@example.com", Rendered("Subj", "<p>x</p>", "x"), "test")
    db.refresh(row)
    assert row.status == "sent" and row.provider == "resend" and row.provider_id == "re_123"
    assert sent["url"] == emailer.RESEND_URL and sent["auth"] == "Bearer re_test_key" and sent["json"]["to"] == ["live@example.com"]

    monkeypatch.setattr(emailer.httpx, "post", lambda *a, **k: httpx.Response(422, json={"message": "bad"}))
    failed = emailer.queue_email(db, "live@example.com", Rendered("Subj", "<p>x</p>", "x"), "test")
    db.refresh(failed)
    assert failed.status == "failed" and "Resend 422" in failed.error
    db.close()
