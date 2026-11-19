from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from tests.conftest import needs_models

APPLICANT = {
    "full_name": "Asha Verma",
    "email": "asha@example.com",
    "purpose": "Debt consolidation",
    "consent": True,
    "loan_amount": 15000,
    "fico": 700,
    "dti": 15,
}

pytestmark = needs_models


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.headers["X-Request-ID"]
    body = r.json()
    assert body["mode"] == "live" and body["model_loaded"] is True and body["email_mode"] == "demo"


def test_metadata_is_a_model_card(client):
    md = client.get("/api/v1/metadata").json()
    assert md["features"] == ["loan_amount", "fico", "dti"]
    assert md["constraints"] == {"eligibility": [-1, 1, -1], "chargeoff": [1, -1, 1]}
    assert md["thresholds"]["reject_eligibility"] == 40 and md["thresholds"]["approve_eligibility"] == 75
    assert 0.45 < md["severity"] < 0.55
    assert md["metrics"]["eligibility"]["roc_auc"] > 0.85
    assert 0.58 < md["metrics"]["chargeoff"]["roc_auc"] < 0.7
    assert len(md["metrics"]["chargeoff"]["deciles"]) == 10
    assert "Debt consolidation" in md["purposes"]


def test_screen_tc01_outputs_within_range(client):  # TC-01
    r = client.post("/api/v1/screen", json={"loan_amount": 15000, "fico": 700, "dti": 15})
    assert r.status_code == 200, r.text
    body = r.json()
    assert 0 <= body["eligibility"]["score"] <= 100
    assert 0 <= body["charge_off"]["probability"] <= 100
    assert body["decision"] in ("APPROVE", "REVIEW", "REJECT")
    assert body["inputs"] == {"loan_amount": 15000, "fico": 700, "dti": 15}
    assert body["model_version"].startswith("lendwise-")


def test_screen_tc08_fico_cliff(client):  # TC-08
    low = client.post("/api/v1/screen", json={"loan_amount": 15000, "fico": 659, "dti": 15}).json()
    high = client.post("/api/v1/screen", json={"loan_amount": 15000, "fico": 660, "dti": 15}).json()
    assert low["eligibility"]["score"] < 40 and low["eligibility"]["tier"] == "Unlikely"
    assert low["decision"] == "REJECT" and low["charge_off"] is None  # risk hidden when Unlikely
    assert high["eligibility"]["score"] > 75 and high["eligibility"]["tier"] == "Likely"


@pytest.mark.parametrize(
    "payload,field",
    [
        ({"loan_amount": 15000, "fico": 659.5, "dti": 15}, "fico"),       # TC-02
        ({"loan_amount": 15000, "fico": 700, "dti": True}, "dti"),        # TC-04
        ({"loan_amount": 45000, "fico": 700, "dti": 15}, "loan_amount"),  # TC-05
        ({"loan_amount": "", "fico": 700, "dti": 15}, "loan_amount"),     # TC-06
        ({"loan_amount": 15000, "fico": 700}, "dti"),                     # TC-07
        ([15000, 700, 15], None),
    ],
)
def test_screen_rejects_bad_input_with_one_message(client, payload, field):
    r = client.post("/api/v1/screen", json=payload)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR" and len(err["details"]) == 1
    assert err["details"][0]["field"] == field and err["message"] == err["details"][0]["message"]


def test_screen_accepts_percent_text(client):  # TC-03
    r = client.post("/api/v1/screen", json={"loan_amount": "15,000", "fico": "700", "dti": "18%"})
    assert r.status_code == 200 and r.json()["inputs"]["dti"] == 18


def test_screen_counter_offer_is_smaller_and_approved(client):
    body = client.post("/api/v1/screen", json={"loan_amount": 35000, "fico": 690, "dti": 25}).json()
    assert body["decision"] in ("REVIEW", "REJECT")
    offer = body["counter_offer"]
    if offer is not None:
        assert offer["loan_amount"] < 35000 and (35000 - offer["loan_amount"]) % 500 == 0
        again = client.post("/api/v1/screen", json={**body["inputs"], "loan_amount": offer["loan_amount"]}).json()
        assert again["decision"] == "APPROVE"


def test_submit_application_and_status(client):
    r = client.post("/api/v1/applications", json=APPLICANT)
    assert r.status_code == 201, r.text
    body = r.json()
    aid = body["application_id"]
    assert aid.startswith("LW-") and body["status"] == "Pending Review" and body["decision"] == "PENDING"
    assert body["screening"]["decision"] in ("APPROVE", "REVIEW", "REJECT")
    assert body["applicant"]["fico"] == 700 and body["access_token"]

    ok = client.get(f"/api/v1/applications/{aid}/status", params={"email": "ASHA@example.com"})
    assert ok.status_code == 200 and ok.json()["application_id"] == aid and "access_token" not in ok.json()
    assert client.get(f"/api/v1/applications/{aid}/status", params={"email": "x@example.com"}).status_code == 404
    assert client.get("/api/v1/applications/LW-2000-999999/status", params={"email": "asha@example.com"}).status_code == 404
    assert client.get(f"/api/v1/applications/{aid}", headers={"X-Access-Token": body["access_token"]}).status_code == 200
    assert client.get(f"/api/v1/applications/{aid}", headers={"X-Access-Token": "x" * 43}).status_code == 404


@pytest.mark.parametrize(
    "patch,field",
    [
        ({"email": "not-an-email"}, "email"),
        ({"consent": False}, "consent"),
        ({"purpose": "Holiday"}, "purpose"),
        ({"full_name": "A"}, "full_name"),
        ({"fico": 900}, "fico"),
        ({"dti": "-5"}, "dti"),
    ],
)
def test_invalid_application_returns_422(client, patch, field):
    r = client.post("/api/v1/applications", json={**APPLICANT, **patch})
    assert r.status_code == 422, r.text
    assert field in [d["field"] for d in r.json()["error"]["details"]]


def test_admin_requires_auth(client):
    assert client.get("/api/v1/admin/applications").status_code == 401
    assert client.get("/api/v1/admin/stats", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.post("/api/v1/admin/login", json={"email": "officer@test.dev", "password": "wrong"}).status_code == 401


def test_officer_review_flow_stats_export(client, officer):
    # FICO 700, DTI 10, $5,000 is a clear APPROVE recommendation.
    created = client.post("/api/v1/applications", json={**APPLICANT, "full_name": "Ravi Kumar", "loan_amount": 5000, "dti": 10}).json()
    aid = created["application_id"]
    assert created["screening"]["decision"] == "APPROVE"

    page = client.get("/api/v1/admin/applications", params={"q": "Ravi"}, headers=officer).json()
    assert page["total"] >= 1 and page["items"][0]["full_name"] == "Ravi Kumar"
    created_at = datetime.fromisoformat(page["items"][0]["created_at"].replace("Z", "+00:00"))
    today = created_at.astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat()
    assert client.get("/api/v1/admin/applications", params={"date_from": today, "date_to": today}, headers=officer).json()["total"] >= 1
    rec = client.get("/api/v1/admin/applications", params={"recommendation": "APPROVE", "decision": "PENDING"}, headers=officer).json()
    assert any(i["application_id"] == aid for i in rec["items"])

    # Rejecting a clear APPROVE needs a note.
    no_note = client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "reject"}, headers=officer)
    assert no_note.status_code == 422 and no_note.json()["error"]["details"][0]["field"] == "note"
    ok = client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "approve"}, headers=officer)
    assert ok.status_code == 200 and ok.json()["final_decision"] == "APPROVED" and ok.json()["status"] == "Decided"
    assert ok.json()["approved_amount"] == 5000
    upd = client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "reject", "note": "Income could not be verified"}, headers=officer).json()
    assert upd["final_decision"] == "REJECTED" and upd["recommendation"] == "APPROVE" and upd["status"] == "Overridden"
    assert "Income could not be verified" in upd["officer_note"]

    public = client.get(f"/api/v1/applications/{aid}/status", params={"email": APPLICANT["email"]}).json()
    assert public["decision"] == "REJECTED" and public["decided_at"] and "Income could not" not in str(public)

    stats = client.get("/api/v1/admin/stats", headers=officer).json()
    assert stats["total"] >= 1 and stats["overridden"] >= 1 and len(stats["per_day"]) == 30
    assert abs(stats["approval_rate"] + stats["rejection_rate"] - 1) < 1e-9
    assert set(stats["by_recommendation"]) == {"APPROVE", "REVIEW", "REJECT"}

    csv = client.get("/api/v1/admin/applications/export.csv", headers=officer)
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv") and aid in csv.text


def test_officer_can_approve_counter_offer(client, officer):
    created = client.post("/api/v1/applications", json={**APPLICANT, "full_name": "Counter Offer", "loan_amount": 35000, "fico": 690, "dti": 25}).json()
    aid, offer = created["application_id"], created["screening"]["counter_offer"]
    r = client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "approve_counter_offer"}, headers=officer)
    if offer is None:
        assert r.status_code == 409
    else:
        assert r.status_code == 200 and r.json()["approved_amount"] == offer["loan_amount"] and r.json()["status"] == "Decided"


def test_request_more_info_and_applicant_reply(client, officer):
    created = client.post("/api/v1/applications", json={**APPLICANT, "full_name": "Info Needed"}).json()
    aid, tok = created["application_id"], created["access_token"]
    assert client.post(f"/api/v1/applications/{aid}/reply", json={"message": "Here you go"}, headers={"X-Access-Token": tok}).status_code == 409
    assert client.patch(f"/api/v1/admin/applications/{aid}", json={"action": "request_info", "message": "Docs?"}, headers=officer).status_code == 422
    r = client.patch(f"/api/v1/admin/applications/{aid}",
                     json={"action": "request_info", "message": "Please share your last two pay stubs.", "note": "DTI looks low"},
                     headers=officer)
    assert r.status_code == 200 and r.json()["status"] == "Info Requested" and r.json()["final_decision"] == "PENDING"

    public = client.get(f"/api/v1/applications/{aid}/status", params={"email": APPLICANT["email"]}).json()
    assert public["status"] == "Info Requested" and public["messages"][0]["author"] == "officer"
    assert "DTI looks low" not in str(public)

    assert client.post(f"/api/v1/applications/{aid}/reply", json={"message": "Here you go", "email": "someone@else.com"}).status_code == 404
    rep = client.post(f"/api/v1/applications/{aid}/reply", json={"message": "Uploaded my pay stubs, thanks.", "email": APPLICANT["email"]})
    assert rep.status_code == 200 and rep.json()["status"] == "Pending Review"
    assert [m["author"] for m in rep.json()["messages"]] == ["officer", "applicant"]

    kinds = [e["kind"] for e in client.get("/api/v1/admin/emails", params={"application_id": aid}, headers=officer).json()["items"]]
    assert kinds.count("info_requested") == 1 and "decision" not in kinds


def test_models_unavailable_returns_503(client):
    from app.ml.registry import get_screener

    s = get_screener()
    saved = s.engine
    s.engine = None
    try:
        assert client.get("/api/v1/health").json()["mode"] == "unavailable"
        assert client.post("/api/v1/screen", json={"loan_amount": 15000, "fico": 700, "dti": 15}).status_code == 503
        assert client.post("/api/v1/applications", json=APPLICANT).status_code == 503
    finally:
        s.engine = saved


def test_contact_message_flow(client, officer):
    assert client.post("/api/v1/contact", json={"name": "A", "email": "x", "topic": "Other", "message": "short"}).status_code == 422
    r = client.post("/api/v1/contact", json={"name": "Asha Verma", "email": "asha@example.com", "topic": "Privacy",
                                             "application_id": "lw-2026-000001", "message": "Please delete my application data."})
    assert r.status_code == 201 and r.json()["reference"].startswith("LW-MSG-")
    inbox = client.get("/api/v1/admin/messages", headers=officer).json()
    msg = inbox["items"][0]
    assert msg["application_id"] == "LW-2026-000001" and msg["resolved"] is False and inbox["unresolved"] >= 1
    assert client.get("/api/v1/admin/messages").status_code == 401
    done = client.patch(f"/api/v1/admin/messages/{msg['id']}", json={"resolved": True}, headers=officer)
    assert done.status_code == 200 and done.json()["resolved"] is True


def test_admin_delete_application(client, officer):
    aid = client.post("/api/v1/applications", json={**APPLICANT, "full_name": "Delete Me"}).json()["application_id"]
    assert client.delete(f"/api/v1/admin/applications/{aid}").status_code == 401
    assert client.delete(f"/api/v1/admin/applications/{aid}", headers=officer).status_code == 204
    assert client.get(f"/api/v1/admin/applications/{aid}", headers=officer).status_code == 404


def test_global_rate_limit_backstop(client):
    from app.routers import applications as apps

    saved = apps.global_submit_limiter
    apps.global_submit_limiter = apps.RateLimiter(2)
    try:
        codes = [client.post("/api/v1/applications", json=APPLICANT, headers={"X-Forwarded-For": f"198.51.100.{i}"}).status_code
                 for i in range(4)]
    finally:
        apps.global_submit_limiter = saved
    assert codes[:2] == [201, 201] and codes[2:] == [429, 429]


def test_api_keeps_screening_when_the_database_is_down(client, officer, monkeypatch):
    """A paused Supabase project must not take the whole API down."""
    from sqlalchemy.exc import OperationalError

    from app import db as db_module

    def unreachable():
        raise OperationalError("connect", {}, Exception("tenant/user not found"))

    monkeypatch.setattr(db_module, "_ready", False)
    monkeypatch.setattr(db_module, "_last_try", 0.0)
    monkeypatch.setattr(db_module, "init_db", unreachable)

    assert client.get("/api/v1/health").json()["database"] == "unavailable"
    assert client.post("/api/v1/screen", json={"loan_amount": 15000, "fico": 700, "dti": 15}).status_code == 200
    down = client.post("/api/v1/applications", json=APPLICANT)
    assert down.status_code == 503 and down.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert down.headers["Retry-After"] == "30"
    assert client.get("/api/v1/admin/stats", headers=officer).status_code == 503

    # Once the database is back, the next retry picks it up.
    monkeypatch.setattr(db_module, "init_db", lambda: None)
    monkeypatch.setattr(db_module, "_last_try", 0.0)
    assert client.get("/api/v1/health").json()["database"] == "ok"
    assert client.post("/api/v1/applications", json=APPLICANT).status_code == 201
