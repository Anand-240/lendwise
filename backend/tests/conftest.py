import os
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-hs256")
os.environ.setdefault("ADMIN_EMAIL", "officer@test.dev")
os.environ.setdefault("ADMIN_PASSWORD", "Sup3r-Secret!")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "1000")
os.environ.setdefault("RATE_LIMIT_GLOBAL_PER_MINUTE", "5000")
os.environ.setdefault("SCREEN_RATE_LIMIT_PER_MINUTE", "5000")

ARTIFACTS = BACKEND / "app" / "ml" / "artifacts"
HAS_MODELS = all((ARTIFACTS / f).exists() for f in ("eligibility.joblib", "chargeoff.joblib", "range_guard.joblib", "metadata.json"))
needs_models = pytest.mark.skipif(not HAS_MODELS, reason="trained artifacts not present (run scripts/train_models.py)")


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def token(client):
    r = client.post("/api/v1/admin/login", json={"email": "officer@test.dev", "password": "Sup3r-Secret!"})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def officer(token):
    return {"Authorization": f"Bearer {token}"}
