"""Input validation rules (report Appendix A, Table A.1 and test cases TC-02 to TC-07)."""
import math

import pytest

from app.ml.validator import InputError, validate

OK = {"loan_amount": 15000, "fico": 700, "dti": 15}


def test_valid_input_is_normalised():
    assert validate(OK) == {"loan_amount": 15000.0, "fico": 700, "dti": 15.0}
    assert validate({"loan_amount": "$15,000", "fico": "700", "dti": " 18% "}) == {"loan_amount": 15000.0, "fico": 700, "dti": 18.0}
    assert validate({**OK, "fico": 700.0})["fico"] == 700


@pytest.mark.parametrize(
    "patch,field,phrase",
    [
        ({"fico": 659.5}, "fico", "whole number"),            # TC-02
        ({"dti": True}, "dti", "not true or false"),           # TC-04
        ({"loan_amount": 45000}, "loan_amount", "between"),   # TC-05
        ({"loan_amount": 499.99}, "loan_amount", "between"),
        ({"loan_amount": ""}, "loan_amount", "required"),      # TC-06
        ({"loan_amount": None}, "loan_amount", "required"),
        ({"loan_amount": float("nan")}, "loan_amount", "finite"),
        ({"loan_amount": "abc"}, "loan_amount", "number"),
        ({"loan_amount": False}, "loan_amount", "not true or false"),
        ({"fico": float("inf")}, "fico", "finite"),
        ({"fico": 299}, "fico", "between"),
        ({"fico": 851}, "fico", "between"),
        ({"fico": "seven hundred"}, "fico", "number"),
        ({"dti": -0.1}, "dti", "between"),
        ({"dti": 100.5}, "dti", "between"),
        ({"dti": float("-inf")}, "dti", "finite"),
        ({"dti": "nan"}, "dti", "number"),
        ({"dti": [15]}, "dti", "number"),
    ],
)
def test_bad_values_raise_one_clear_error(patch, field, phrase):
    with pytest.raises(InputError) as exc:
        validate({**OK, **patch})
    assert exc.value.field == field
    assert phrase in exc.value.message


@pytest.mark.parametrize("key", ["loan_amount", "fico", "dti"])
def test_missing_key_is_a_validation_error_not_a_crash(key):  # TC-07
    payload = {k: v for k, v in OK.items() if k != key}
    with pytest.raises(InputError) as exc:
        validate(payload)
    assert exc.value.field == key and "missing" in exc.value.message


@pytest.mark.parametrize("payload", [None, [15000, 700, 15], "loan=15000", 42])
def test_wrong_container(payload):
    with pytest.raises(InputError) as exc:
        validate(payload)
    assert exc.value.field is None


def test_boundaries_are_inclusive():
    assert validate({"loan_amount": 500, "fico": 300, "dti": 0})["loan_amount"] == 500
    assert validate({"loan_amount": 40000, "fico": 850, "dti": 100})["dti"] == 100
    assert not math.isnan(validate({**OK, "dti": "0%"})["dti"])
