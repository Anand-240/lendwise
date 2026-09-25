import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ml.predictor import get_predictor
from app.otp import issue_token
from tests.conftest import needs_model

VALID = {
    "full_name": "Asha Verma",
    "email": "asha@example.com",
    "phone": "9876543210",
    "age": 35,
    "marital_status": "single",
    "profession": "Software_Developer",
    "experience": 10,
    "current_job_years": 5,
    "income": 5_000_000,
    "state": "Tamil_Nadu",
    "city": "Tiruchirappalli[10]",
    "house_ownership": "rented",
    "current_house_years": 12,
    "car_ownership": "no",
    "loan_amount": 500_000,
    "tenure_months": 60,
    "purpose": "Personal",
    "consent": True,
    "phone_verification_token": issue_token("9876543210"),
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def token(client):
    r = client.post("/api/v1/admin/login", json={"email": "officer@test.dev", "password": "Sup3r-Secret!"})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.headers["X-Request-ID"]
    body = r.json()
    assert body["mode"] in ("live", "demo")


def test_metadata(client):
    r = client.get("/api/v1/metadata")
    assert r.status_code == 200
    md = r.json()
    assert {"profession", "city", "state"} <= md["options"].keys()
    assert "Tiruchirappalli[10]" in md["state_to_cities"]["Tamil_Nadu"]
    assert md["metrics"]["accuracy"] > 0.88


@needs_model
def test_submit_valid_returns_201(client):
    r = client.post("/api/v1/applications", json=VALID)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["application_id"].startswith("LW-")
    assert body["decision"] in ("APPROVED", "REJECTED")
    assert body["decision"] == ("APPROVED" if body["risk_class"] == 0 else "REJECTED")
    assert abs(body["approval_score"] + body["default_probability"] - 1) < 1e-6
    assert body["is_demo"] is False
    assert body["access_token"]
    assert (body["estimated_emi"] is not None) == (body["decision"] == "APPROVED")
    assert body["applicant"]["phone_masked"] == "98******10"


def test_out_of_range_generates_warning(client):
    r = client.post("/api/v1/applications", json={**VALID, "current_house_years": 3})
    assert r.status_code == 201
    assert any("house years" in w.lower() for w in r.json()["warnings"])


@pytest.mark.parametrize(
    "patch,field",
    [
        ({"age": 20}, "age"),
        ({"phone": "5123456789"}, "phone"),
        ({"email": "not-an-email"}, "email"),
        ({"consent": False}, "consent"),
        ({"loan_amount": 5_000}, "loan_amount"),
        ({"tenure_months": 400}, "tenure_months"),
        ({"purpose": "Holiday"}, "purpose"),
        ({"profession": "Wizard"}, "profession"),
        ({"city": "Mumbai"}, "city"),
        ({"experience": 20, "age": 30}, "experience"),
        ({"current_job_years": 12}, "current_job_years"),
        ({"full_name": "A"}, "full_name"),
    ],
)
def test_invalid_input_returns_422(client, patch, field):
    r = client.post("/api/v1/applications", json={**VALID, **patch})
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert field in [d["field"] for d in err["details"]]
    assert err["request_id"]


def test_status_check(client):
    created = client.post("/api/v1/applications", json=VALID).json()
    aid = created["application_id"]
    ok = client.get(f"/api/v1/applications/{aid}/status", params={"email": "ASHA@example.com"})
    assert ok.status_code == 200
    assert ok.json()["application_id"] == aid
    assert "access_token" not in ok.json()
    bad = client.get(f"/api/v1/applications/{aid}/status", params={"email": "other@example.com"})
    assert bad.status_code == 404
    missing = client.get("/api/v1/applications/LW-2000-999999/status", params={"email": "asha@example.com"})
    assert missing.status_code == 404
    tok = client.get(f"/api/v1/applications/{aid}", headers={"X-Access-Token": created["access_token"]})
    assert tok.status_code == 200
    wrong = client.get(f"/api/v1/applications/{aid}", headers={"X-Access-Token": "x" * 43})
    assert wrong.status_code == 404


def test_admin_requires_auth(client):
    assert client.get("/api/v1/admin/applications").status_code == 401
    assert client.get("/api/v1/admin/stats", headers={"Authorization": "Bearer nope"}).status_code == 401
    bad = client.post("/api/v1/admin/login", json={"email": "officer@test.dev", "password": "wrong"})
    assert bad.status_code == 401


def test_admin_list_detail_override_stats_export(client, token):
    h = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/v1/applications", json={**VALID, "full_name": "Ravi Kumar"}).json()
    aid = created["application_id"]

    page = client.get("/api/v1/admin/applications", params={"q": "Ravi"}, headers=h).json()
    assert page["total"] >= 1 and page["items"][0]["full_name"] == "Ravi Kumar"

    assert page["items"][0]["created_at"].endswith(("Z", "+00:00")), "timestamps must be timezone-aware"
    from datetime import datetime
    from zoneinfo import ZoneInfo

    # Date filters use the business timezone (Asia/Kolkata by default), not UTC days.
    created = datetime.fromisoformat(page["items"][0]["created_at"].replace("Z", "+00:00"))
    today = created.astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat()
    dated = client.get("/api/v1/admin/applications", params={"date_from": today, "date_to": today}, headers=h).json()
    assert dated["total"] >= 1

    detail = client.get(f"/api/v1/admin/applications/{aid}", headers=h).json()
    original = detail["decision"]
    flipped = "REJECTED" if original == "APPROVED" else "APPROVED"

    no_note = client.patch(f"/api/v1/admin/applications/{aid}", json={"decision": flipped}, headers=h)
    assert no_note.status_code == 422

    upd = client.patch(f"/api/v1/admin/applications/{aid}", json={"decision": flipped, "note": "Manual review ok"}, headers=h)
    assert upd.status_code == 200
    u = upd.json()
    assert u["final_decision"] == flipped and u["decision"] == original and u["status"] == "Overridden"
    assert "Manual review ok" in u["officer_note"]

    public = client.get(f"/api/v1/applications/{aid}/status", params={"email": VALID["email"]}).json()
    assert public["decision"] == flipped and public["model_decision"] == original

    stats = client.get("/api/v1/admin/stats", headers=h).json()
    assert stats["total"] >= 1 and stats["overridden"] >= 1
    assert abs(stats["approval_rate"] + stats["rejection_rate"] - 1) < 1e-9
    assert len(stats["per_day"]) == 30

    csv = client.get("/api/v1/admin/applications/export.csv", headers=h)
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    assert aid in csv.text


def test_demo_mode(client):
    p = get_predictor()
    saved = p.model
    p.model = None
    try:
        health = client.get("/api/v1/health").json()
        assert health["mode"] == "demo" and health["model_loaded"] is False
        r = client.post("/api/v1/applications", json=VALID)
        assert r.status_code == 201
        body = r.json()
        assert body["is_demo"] is True
        assert body["model_version"].startswith("demo")
        assert body["warnings"][0].startswith("Demo mode")
        again = client.post("/api/v1/applications", json=VALID).json()
        assert again["default_probability"] == body["default_probability"]  # deterministic
    finally:
        p.model = saved


def test_contact_message_flow(client, token):
    h = {"Authorization": f"Bearer {token}"}
    bad = client.post("/api/v1/contact", json={"name": "A", "email": "x", "topic": "Other", "message": "short"})
    assert bad.status_code == 422
    r = client.post(
        "/api/v1/contact",
        json={"name": "Asha Verma", "email": "asha@example.com", "topic": "Privacy", "application_id": "lw-2026-000001",
              "message": "Please delete my application data."},
    )
    assert r.status_code == 201 and r.json()["reference"].startswith("LW-MSG-")
    inbox = client.get("/api/v1/admin/messages", headers=h).json()
    msg = inbox["items"][0]
    assert msg["application_id"] == "LW-2026-000001" and msg["resolved"] is False and inbox["unresolved"] >= 1
    assert client.get("/api/v1/admin/messages").status_code == 401
    done = client.patch(f"/api/v1/admin/messages/{msg['id']}", json={"resolved": True}, headers=h)
    assert done.status_code == 200 and done.json()["resolved"] is True


def test_admin_delete_application(client, token):
    h = {"Authorization": f"Bearer {token}"}
    aid = client.post("/api/v1/applications", json={**VALID, "full_name": "Delete Me"}).json()["application_id"]
    assert client.delete(f"/api/v1/admin/applications/{aid}").status_code == 401
    assert client.delete(f"/api/v1/admin/applications/{aid}", headers=h).status_code == 204
    assert client.get(f"/api/v1/admin/applications/{aid}", headers=h).status_code == 404
    assert client.get(f"/api/v1/applications/{aid}/status", params={"email": VALID["email"]}).status_code == 404


def test_global_rate_limit_backstop(client):
    from app.routers import applications as apps

    saved = apps.global_submit_limiter
    apps.global_submit_limiter = apps.RateLimiter(2)
    try:
        codes = [
            client.post("/api/v1/applications", json=VALID, headers={"X-Forwarded-For": f"198.51.100.{i}"}).status_code
            for i in range(4)
        ]
    finally:
        apps.global_submit_limiter = saved
    assert codes[:2] == [201, 201] and codes[2:] == [429, 429]  # rotating IPs doesn't bypass the global cap
