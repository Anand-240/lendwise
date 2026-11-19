"""Loads the saved models, range guard and metadata once, and screens applications.

The same object serves the API and the acceptance suite, so what is tested is exactly what the
user gets (report Section 3.1.1).
"""
from __future__ import annotations

import json
import logging
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib

from app.config import get_settings
from app.ml.engine import DecisionEngine, Thresholds
from app.ml.guard import RangeGuard
from app.ml.layer_model import ChargeOffModel, EligibilityModel
from app.ml.validator import validate

log = logging.getLogger("lendwise.ml")

ELIGIBILITY_FILE = "eligibility.joblib"
CHARGEOFF_FILE = "chargeoff.joblib"
GUARD_FILE = "range_guard.joblib"
METADATA_FILE = "metadata.json"
EVALUATION_FILE = "evaluation.json"
ACCEPTANCE_FILE = "acceptance.json"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {}


class Screener:
    def __init__(self, artifacts_dir: Path):
        self.artifacts_dir = artifacts_dir
        self.engine: DecisionEngine | None = None
        self.metadata: dict[str, Any] = {}
        self.error: str | None = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self.engine is not None

    @property
    def mode(self) -> str:
        return "live" if self.ready else "unavailable"

    @property
    def model_version(self) -> str:
        return self.metadata.get("model_version", "not loaded")

    def load(self) -> None:
        with self._lock:
            if self.engine is not None:
                return
            try:
                d = self.artifacts_dir
                self.metadata = _read_json(d / METADATA_FILE)
                if not self.metadata:
                    raise FileNotFoundError(f"{METADATA_FILE} is missing; run scripts/train_models.py")
                eligibility = EligibilityModel(joblib.load(d / ELIGIBILITY_FILE))
                chargeoff = ChargeOffModel(joblib.load(d / CHARGEOFF_FILE))
                limits = {k: (v["low"], v["high"]) for k, v in self.metadata["guard"]["limits"].items()}
                guard = RangeGuard(limits, joblib.load(d / GUARD_FILE))
                engine = DecisionEngine(eligibility, chargeoff, guard, self.metadata["severity"], Thresholds())
                # The first prediction pays one-off set-up costs; pay them now, not on a user's request.
                engine.evaluate({"loan_amount": 15000.0, "fico": 700, "dti": 15.0})
                self.engine = engine
                self.error = None
                log.info("Models loaded (%s)", self.model_version)
            except Exception as exc:  # keep the API up; screening endpoints report 503
                self.engine = None
                self.error = str(exc)
                log.error("Could not load models: %s", exc)

    def screen(self, payload: Any, *, with_counter_offer: bool = True) -> dict[str, Any]:
        """Validate then score. Raises validator.InputError for bad input."""
        if self.engine is None:
            raise RuntimeError("models are not loaded")
        clean = validate(payload)
        result = self.engine.evaluate(clean, with_counter_offer=with_counter_offer)
        result["model_version"] = self.model_version
        return result

    def evaluation(self) -> dict[str, Any]:
        return _read_json(self.artifacts_dir / EVALUATION_FILE)

    def acceptance(self) -> dict[str, Any]:
        return _read_json(self.artifacts_dir / ACCEPTANCE_FILE)


@lru_cache
def get_screener() -> Screener:
    s = get_settings()
    return Screener(s.resolve(s.artifacts_dir))
