"""Add sample applications so the officer dashboard has something to show.

    python scripts/seed_demo.py --count 30

Writes to the database in DATABASE_URL (backend/.env), so point it at a local or demo database.
Profiles are drawn from 2015 test loans; about two thirds are decided the way LendWise
recommends (cases sent for review are decided at random) and the rest stay pending.
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from app.db import SessionLocal, init_db  # noqa: E402
from app.ml.registry import get_screener  # noqa: E402
from app.models_db import utcnow  # noqa: E402
from app.schemas import PURPOSES, ApplicationCreate  # noqa: E402
from app.services import submit_application  # noqa: E402

FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sara", "Vikram", "Anika", "Dev", "Isha", "Arjun", "Nisha"]
LAST = ["Sharma", "Verma", "Gupta", "Mehta", "Iyer", "Khan", "Patel", "Reddy", "Das", "Singh"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    init_db()
    get_screener().load()
    if not get_screener().ready:
        sys.exit(f"Models are not loaded: {get_screener().error}")
    loans = pd.read_csv(ROOT / "data" / "cohorts" / "chargeoff_36m.csv.gz")
    loans = loans[loans["split"] == "test"].sample(args.count, random_state=args.seed)

    db = SessionLocal()
    try:
        for i, row in enumerate(loans.itertuples()):
            name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            body = ApplicationCreate(
                full_name=name,
                email=f"{name.lower().replace(' ', '.')}{i}@example.com",
                purpose=rng.choice(PURPOSES),
                consent=True,
                loan_amount=float(row.loan_amount),
                fico=int(row.fico),
                dti=float(row.dti),
            )
            a = submit_application(db, body)
            if rng.random() < 0.66:
                approve = a.recommendation == "APPROVE" or (a.recommendation == "REVIEW" and rng.random() < 0.5)
                a.final_decision = "APPROVED" if approve else "REJECTED"
                a.approved_amount = a.loan_amount if approve else None
                a.status = "Decided"
                a.reviewed_at = utcnow()
                db.commit()
        print(f"Added {args.count} sample applications.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
