import httpx
import pytest
from fastapi.testclient import TestClient

from app import emailer, otp
from app.config import get_settings
from app.main import app
from app.models_db import PhoneVerification
from tests.test_api import VALID

PHONE = "9123456789"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def token(client):
    r = client.post("/api/v1/admin/login", json={"email": "officer@test.dev", "password": "Sup3r-Secret!"})
    return r.json()["access_token"]


def _fresh_phone(i: int) -> str:
    """Distinct valid mobile numbers per test so OTP cooldowns don't interact."""
    return f"98{i:08d}"


def test_otp_demo_flow(client):
    phone = _fresh_phone(1)
    r = client.post("/api/v1/otp/send", json={"phone": phone})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "demo" and len(body["demo_code"]) == 6 and body["phone_masked"].startswith("98")
    # cooldown
    again = client.post("/api/v1/otp/send", json={"phone": phone})
    assert again.status_code == 429 and "Retry-After" in again.headers
    wrong = "000000" if body["demo_code"] != "000000" else "111111"
    bad = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": wrong})
    assert bad.status_code == 400 and "attempts left" in bad.json()["error"]["message"]
    ok = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": body["demo_code"]})
    assert ok.status_code == 200 and ok.json()["verified"] is True
    tok = ok.json()["token"]
    assert otp.token_matches(tok, phone) and not otp.token_matches(tok, _fresh_phone(2))
    reuse = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": body["demo_code"]})
    assert reuse.status_code == 409


def test_otp_lockout_after_max_attempts(client):
    phone = _fresh_phone(3)
    body = client.post("/api/v1/otp/send", json={"phone": phone}).json()
    wrong = "000000" if body["demo_code"] != "000000" else "111111"
    codes = [client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": wrong}).status_code
             for _ in range(get_settings().otp_max_attempts + 1)]
    assert codes[-1] == 429
    right = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": body["demo_code"]})
    assert right.status_code == 429  # locked even with the right code


def test_otp_expired(client):
    from datetime import timedelta

    from app.db import SessionLocal
    from app.models_db import utcnow

    body = client.post("/api/v1/otp/send", json={"phone": _fresh_phone(4)}).json()
    db = SessionLocal()
    row = db.get(PhoneVerification, body["verification_id"])
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    db.close()
    r = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": body["demo_code"]})
    assert r.status_code == 410


def test_submission_requires_verified_phone(client):
    missing = client.post("/api/v1/applications", json={**VALID, "phone_verification_token": None})
    assert missing.status_code == 422
    assert missing.json()["error"]["details"][0]["field"] == "phone_verification_token"
    other = client.post("/api/v1/applications", json={**VALID, "phone_verification_token": otp.issue_token(PHONE)})
    assert other.status_code == 422  # token for a different number
    forged = client.post("/api/v1/applications", json={**VALID, "phone_verification_token": "x.y.z"})
    assert forged.status_code == 422


def test_application_emails_in_demo_outbox(client, token):
    h = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/v1/applications", json={**VALID, "full_name": "Mail Tester", "email": "mail@example.com"}).json()
    assert created["phone_verified"] is True
    kinds = [e["kind"] for e in created["emails"]]
    assert kinds == ["application_received", "decision"]
    assert all(e["status"] == "demo" and e["to_masked"].startswith("m") and "*" in e["to_masked"] for e in created["emails"])
    assert created["application_id"] in created["emails"][0]["html"]

    aid = created["application_id"]
    flipped = "REJECTED" if created["decision"] == "APPROVED" else "APPROVED"
    client.patch(f"/api/v1/admin/applications/{aid}", json={"decision": flipped, "note": "Internal secret note"}, headers=h)
    outbox = client.get("/api/v1/admin/emails", params={"application_id": aid}, headers=h).json()
    assert outbox["mode"] == "demo"
    update = [e for e in outbox["items"] if e["kind"] == "decision_update"]
    assert len(update) == 1 and "Internal secret note" not in update[0]["html"]  # officer note never leaks
    # a note-only change (no decision/status change) sends nothing new
    client.patch(f"/api/v1/admin/applications/{aid}", json={"decision": flipped, "note": "Same decision again"}, headers=h)
    again = client.get("/api/v1/admin/emails", params={"application_id": aid}, headers=h).json()
    assert len([e for e in again["items"] if e["kind"] == "decision_update"]) == 1
    status = client.get(f"/api/v1/applications/{aid}/status", params={"email": "mail@example.com"}).json()
    assert [e["kind"] for e in status["emails"]] == ["application_received", "decision", "decision_update"]


def test_contact_ack_and_officer_reply(client, token):
    h = {"Authorization": f"Bearer {token}"}
    ref = client.post("/api/v1/contact", json={"name": "Reply Tester", "email": "reply@example.com", "topic": "Other",
                                               "message": "Hello <script>alert(1)</script> team"}).json()["reference"]
    inbox = client.get("/api/v1/admin/messages", headers=h).json()
    msg = next(m for m in inbox["items"] if m["reference"] == ref)
    ack = client.get("/api/v1/admin/emails", params={"message_id": msg["id"]}, headers=h).json()["items"]
    assert ack[0]["kind"] == "contact_ack" and "<script>" not in ack[0]["html"] and "&lt;script&gt;" in ack[0]["html"]
    assert client.post(f"/api/v1/admin/messages/{msg['id']}/reply", json={"body": "hi"}, headers=h).status_code == 422
    r = client.post(f"/api/v1/admin/messages/{msg['id']}/reply", json={"body": "Thanks, we have looked into it."}, headers=h)
    assert r.status_code == 201 and r.json()["kind"] == "contact_reply" and r.json()["to_email"] == "reply@example.com"
    after = client.get("/api/v1/admin/messages", params={"resolved": True}, headers=h).json()
    m2 = next(m for m in after["items"] if m["id"] == msg["id"])
    assert m2["resolved"] is True and m2["replies"][0]["body"] == "Thanks, we have looked into it."
    assert client.post("/api/v1/admin/messages/999999/reply", json={"body": "Hello there"}, headers=h).status_code == 404


def test_live_email_delivery_via_resend(monkeypatch):
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


def test_live_otp_via_twilio(client, monkeypatch):
    s = get_settings()
    for k, v in {"twilio_account_sid": "AC1", "twilio_auth_token": "tok", "twilio_verify_service_sid": "VA1"}.items():
        monkeypatch.setattr(s, k, v)
    calls = []

    def fake_post(url, data, auth, timeout):
        calls.append((url, data, auth))
        if url.endswith("/VerificationCheck"):
            return httpx.Response(200, json={"status": "approved" if data["Code"] == "424242" else "pending"})
        return httpx.Response(201, json={"status": "pending"})

    monkeypatch.setattr(otp.httpx, "post", fake_post)
    body = client.post("/api/v1/otp/send", json={"phone": _fresh_phone(5)}).json()
    assert body["mode"] == "live" and body["demo_code"] is None
    assert calls[0][0].endswith("/VA1/Verifications") and calls[0][1] == {"To": "+919800000005", "Channel": "sms"}
    assert calls[0][2] == ("AC1", "tok")
    bad = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": "111111"})
    assert bad.status_code == 400
    ok = client.post("/api/v1/otp/verify", json={"verification_id": body["verification_id"], "code": "424242"})
    assert ok.status_code == 200 and otp.token_matches(ok.json()["token"], "9800000005")


def test_health_reports_modes(client):
    h = client.get("/api/v1/health").json()
    assert h["email_mode"] == "demo" and h["sms_mode"] == "demo"
