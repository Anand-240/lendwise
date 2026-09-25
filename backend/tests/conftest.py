import os
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ADMIN_EMAIL", "officer@test.dev")
os.environ.setdefault("ADMIN_PASSWORD", "Sup3r-Secret!")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "1000")
os.environ.setdefault("RATE_LIMIT_GLOBAL_PER_MINUTE", "5000")

ARTIFACTS = BACKEND / "app" / "ml" / "artifacts"
HAS_MODEL = (ARTIFACTS / "model.pkl").exists() and (ARTIFACTS / "scaler.pkl").exists()
HAS_DATA = (BACKEND / "data" / "Training Data.csv").exists()

needs_model = pytest.mark.skipif(not HAS_MODEL, reason="model.pkl / scaler.pkl not present")
needs_data = pytest.mark.skipif(not HAS_DATA, reason="Training Data.csv not present")


@pytest.fixture(scope="session")
def predictor():
    from app.ml.predictor import get_predictor

    p = get_predictor()
    p.load()
    return p


@pytest.fixture(scope="session")
def dataset():
    import pandas as pd

    df = pd.read_csv(BACKEND / "data" / "Training Data.csv")
    df.columns = df.columns.str.strip()
    return df
