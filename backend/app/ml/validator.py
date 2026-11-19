"""Input validator (report Appendix A, Table A.1).

Every value is checked before anything is scored. On the first problem the validator raises
`InputError` with a single, plain message, so the interface can show one clear error and score
nothing. The same function is used by the API, the web form (through the API) and the
acceptance suite.
"""
from __future__ import annotations

import math
import numbers
import re
from collections.abc import Mapping
from typing import Any

from app.ml.constants import DTI_MAX, DTI_MIN, FICO_MAX, FICO_MIN, LOAN_MAX, LOAN_MIN

_NUMBER = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
_LABEL = {"loan_amount": "Loan amount", "fico": "FICO score", "dti": "DTI"}


class InputError(ValueError):
    """A single validation problem: which field and what is wrong with it."""

    def __init__(self, field: str | None, message: str):
        super().__init__(message)
        self.field = field
        self.message = message

    def as_dict(self) -> dict[str, str | None]:
        return {"field": self.field, "message": self.message}


def _to_number(value: Any, field: str, *, allow_percent: bool = False, allow_currency: bool = False) -> float:
    label = _LABEL[field]
    # bool is a subclass of int in Python, so it must be rejected before the number check.
    if isinstance(value, bool):
        raise InputError(field, f"{label} must be a number, not true or false.")
    if value is None:
        raise InputError(field, f"{label} is required.")
    if isinstance(value, numbers.Real):
        number = float(value)
    elif isinstance(value, str):
        text = value.strip()
        if allow_percent and text.endswith("%"):
            text = text[:-1].strip()
        if allow_currency:
            text = text.removeprefix("$").replace(",", "").strip()
        if not text:
            raise InputError(field, f"{label} is required.")
        if not _NUMBER.fullmatch(text):
            raise InputError(field, f"{label} must be a number.")
        number = float(text)
    else:
        raise InputError(field, f"{label} must be a number.")
    if not math.isfinite(number):
        raise InputError(field, f"{label} must be a finite number.")
    return number


def validate(payload: Any) -> dict[str, float | int]:
    """Return clean inputs {loan_amount, fico, dti} or raise InputError for the first problem."""
    if not isinstance(payload, Mapping):
        raise InputError(None, "Send the application as an object with loan_amount, fico and dti.")
    for key in ("loan_amount", "fico", "dti"):
        if key not in payload:
            raise InputError(key, f"{_LABEL[key]} is missing.")

    loan = _to_number(payload["loan_amount"], "loan_amount", allow_currency=True)
    if not LOAN_MIN <= loan <= LOAN_MAX:
        raise InputError("loan_amount", f"Loan amount must be between ${LOAN_MIN:,} and ${LOAN_MAX:,}.")

    fico = _to_number(payload["fico"], "fico")
    if fico != math.floor(fico):
        raise InputError("fico", "FICO score must be a whole number.")
    if not FICO_MIN <= fico <= FICO_MAX:
        raise InputError("fico", f"FICO score must be between {FICO_MIN} and {FICO_MAX}.")

    dti = _to_number(payload["dti"], "dti", allow_percent=True)
    if not DTI_MIN <= dti <= DTI_MAX:
        raise InputError("dti", f"DTI must be between {DTI_MIN:g} and {DTI_MAX:g}.")

    return {"loan_amount": round(loan, 2), "fico": int(fico), "dti": round(dti, 2)}
