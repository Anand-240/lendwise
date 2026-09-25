"""Loads the model, scaler and metadata once and serves predictions.

If model.pkl or scaler.pkl is missing, the predictor runs in DEMO mode: a
deterministic heuristic produces a mock decision that is always flagged
`is_demo=True` and must never be presented as a real model decision.
"""
from __future__ import annotations

import hashlib
import json
import logging
import shutil
import urllib.request
import math
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import joblib

from app.config import get_settings
from app.ml import preprocessing as pp

log = logging.getLogger("lendwise.ml")

DEMO_MODEL_VERSION = "demo-heuristic-v1"


@dataclass
class Prediction:
    risk_class: int
    default_probability: float
    approval_score: float
    confidence: float
    engineered_features: dict[str, Any]
    model_version: str
    is_demo: bool


class Predictor:
    def __init__(
        self,
        artifacts_dir: Path,
        model_path: Path,
        scaler_path: Path,
        force_demo: bool = False,
        model_url: str = "",
        model_sha256: str = "",
    ):
        self.artifacts_dir = artifacts_dir
        self.model_path = model_path
        self.scaler_path = scaler_path
        self.force_demo = force_demo
        self.model_url = model_url
        self.model_sha256 = model_sha256.lower()
        self.model = None
        self.scaler = None
        self.metadata: dict[str, Any] = json.loads((artifacts_dir / "metadata.json").read_text())
        self.feature_columns: list[str] = json.loads((artifacts_dir / "feature_columns.json").read_text())
        self._lock = threading.Lock()

    # ---- lifecycle -------------------------------------------------------
    def load(self) -> None:
        with self._lock:
            if self.model is not None or self.force_demo:
                return
            if not self.model_path.exists() and self.model_url:
                self._download_model()
            if not (self.model_path.exists() and self.scaler_path.exists()):
                log.warning("Model or scaler artifact missing; starting in DEMO mode")
                return
            log.info("Loading model artifact (this can take a few seconds)")
            model = joblib.load(self.model_path)
            scaler = joblib.load(self.scaler_path)
            if list(model.feature_names_in_) != self.feature_columns:
                raise RuntimeError("feature_columns.json does not match model.feature_names_in_")
            # Single-row inference is faster without spawning a thread pool per call.
            model.n_jobs = 1
            self.model, self.scaler = model, scaler
            log.info("Model loaded: %s", self.model_version)

    def _download_model(self) -> None:
        tmp = self.model_path.with_suffix(".download")
        try:
            log.info("Downloading model artifact from MODEL_URL")
            self.model_path.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with urllib.request.urlopen(self.model_url, timeout=120) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    digest.update(chunk)
                    f.write(chunk)
            if self.model_sha256 and digest.hexdigest() != self.model_sha256:
                raise ValueError("MODEL_SHA256 mismatch")
            shutil.move(tmp, self.model_path)
        except Exception as e:  # stay up in demo mode rather than crash
            log.error("Model download failed (%s); continuing in DEMO mode", type(e).__name__)
            tmp.unlink(missing_ok=True)

    @property
    def mode(self) -> str:
        return "live" if self.model is not None else "demo"

    @property
    def model_version(self) -> str:
        return self.metadata.get("model_version", "rf") if self.model is not None else DEMO_MODEL_VERSION

    # ---- inference -------------------------------------------------------
    def predict(self, inputs: Mapping[str, Any]) -> Prediction:
        """`inputs` is keyed by raw dataset column names with RAW category strings."""
        if self.model is None:
            return self._demo_predict(inputs)

        X, features = pp.transform_single(inputs, self.feature_columns, self.scaler)
        risk_class = int(self.model.predict(X)[0])
        proba = self.model.predict_proba(X)[0]
        classes = list(self.model.classes_)
        p_default = float(proba[classes.index(1)])
        p_ok = float(proba[classes.index(0)])
        return Prediction(
            risk_class=risk_class,
            default_probability=p_default,
            approval_score=p_ok,
            confidence=float(max(proba)),
            engineered_features=features,
            model_version=self.model_version,
            is_demo=False,
        )

    def _demo_predict(self, inputs: Mapping[str, Any]) -> Prediction:
        _, features = pp.encode_single(inputs, self.feature_columns)
        med = self.metadata["medians"]
        z = -1.2
        z += 0.9 * (med["CURRENT_JOB_YRS"] - features["CURRENT_JOB_YRS"]) / max(med["CURRENT_JOB_YRS"], 1)
        z += 0.8 * (med["Income"] - features["Income"]) / max(med["Income"], 1)
        z += 0.5 * (med["Experience"] - features["Experience"]) / max(med["Experience"], 1)
        z += 0.4 if inputs["House_Ownership"] == "rented" else 0.0
        z += 0.2 if inputs["Married/Single"] == "single" else 0.0
        z += 0.2 if inputs["Car_Ownership"] == "no" else 0.0
        p_default = round(1 / (1 + math.exp(-z)), 4)
        return Prediction(
            risk_class=int(p_default >= 0.5),
            default_probability=p_default,
            approval_score=1 - p_default,
            confidence=max(p_default, 1 - p_default),
            engineered_features=features,
            model_version=DEMO_MODEL_VERSION,
            is_demo=True,
        )


@lru_cache
def get_predictor() -> Predictor:
    s = get_settings()
    return Predictor(
        artifacts_dir=s.resolve(s.artifacts_dir),
        model_path=s.resolve(s.model_path),
        scaler_path=s.resolve(s.scaler_path),
        force_demo=s.force_demo_mode,
        model_url=s.model_url,
        model_sha256=s.model_sha256,
    )
