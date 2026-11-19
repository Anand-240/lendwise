"""Settings shared by training, the API and the acceptance suite (report, Tables 4.2 and A.1)."""
from __future__ import annotations

SEED = 42

# The three inputs that both LendingClub files record in a comparable form, in model column order.
FEATURES = ("loan_amount", "fico", "dti")
FEATURE_LABELS = {"loan_amount": "Loan amount", "fico": "FICO score", "dti": "DTI"}

# Monotonic constraints in [loan amount, FICO, DTI] order (Section 4.8.2).
ELIGIBILITY_CST = (-1, +1, -1)
CHARGEOFF_CST = (+1, -1, +1)

# Histogram gradient boosting settings for the chosen variant C (Table 4.2).
HGB_PARAMS = {
    "learning_rate": 0.1,
    "max_iter": 150,
    "max_leaf_nodes": 8,
    "min_samples_leaf": 2000,
    "l2_regularization": 10.0,
    "max_bins": 255,
    "early_stopping": False,
    "random_state": SEED,
}
CALIBRATION_FOLDS = 3

# Input validation ranges (Appendix A, Table A.1).
LOAN_MIN, LOAN_MAX = 500, 40_000
FICO_MIN, FICO_MAX = 300, 850
DTI_MIN, DTI_MAX = 0.0, 100.0

# Decision rules (Section 4.8.4). PD thresholds are converted to expected-loss thresholds
# with the loss severity measured on the training data (50.3% in the report).
REJECT_ELIGIBILITY = 40.0
APPROVE_ELIGIBILITY = 75.0
REJECT_PD = 22.0
APPROVE_PD = 12.0
DEFAULT_SEVERITY = 0.503

# Counter-offer search (Section 4.4).
COUNTER_OFFER_STEP = 500

# Range guard (Section 4.8.4).
GUARD_LOWER_Q = 0.001
GUARD_UPPER_Q = 0.999
GUARD_TREES = 200
GUARD_CONTAMINATION = 0.005

APPROVE, REVIEW, REJECT = "APPROVE", "REVIEW", "REJECT"
