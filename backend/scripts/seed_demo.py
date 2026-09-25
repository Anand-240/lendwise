"""Populate the dashboard with sample applications built from real dataset rows.

Goes through the public API (so every record is scored by the live model exactly like a
real submission). Usage (from backend/, API running):

    python scripts/seed_demo.py --count 25 --api http://localhost:8000
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import urllib.request
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
FIRST = ["Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Isha", "Kabir", "Meera", "Rohan", "Saanvi", "Aditya", "Kavya",
         "Ishaan", "Nisha", "Rahul", "Pooja", "Siddharth", "Tanvi", "Varun", "Zara"]
LAST = ["Sharma", "Iyer", "Patel", "Reddy", "Nair", "Gupta", "Singh", "Menon", "Das", "Kulkarni", "Joshi", "Bose"]
PURPOSES = ["Personal", "Home", "Vehicle", "Education", "Business", "Medical", "Other"]


def post(api: str, path: str, body: dict, ip: str) -> dict:
    req = urllib.request.Request(
        f"{api}/api/v1{path}", data=json.dumps(body).encode(), method="POST",
        # Distinct forwarded IPs keep the per-IP rate limits from throttling the seed run.
        headers={"Content-Type": "application/json", "X-Forwarded-For": ip},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def verify_phone(api: str, phone: str, ip: str) -> str:
    """Runs the demo OTP flow (the code is returned by the API in demo mode)."""
    sent = post(api, "/otp/send", {"phone": phone}, ip)
    if not sent.get("demo_code"):
        sys.exit("SMS is in live mode (Twilio configured); the seed script only works with demo OTP.")
    return post(api, "/otp/verify", {"verification_id": sent["verification_id"], "code": sent["demo_code"]}, ip)["token"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=25)
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    df = pd.read_csv(BACKEND / "data" / "Training Data.csv")
    df.columns = df.columns.str.strip()
    df = df.rename(columns={"Married/Single": "Marital"})  # "/" isn't a valid attribute name
    ok = df[(df.Experience <= df.Age - 18) & (df.CURRENT_JOB_YRS <= df.Experience)]
    # Mix of historical defaulters and non-defaulters so both decisions appear.
    sample = pd.concat([ok[ok.Risk_Flag == 1].sample(args.count // 3, random_state=args.seed),
                        ok[ok.Risk_Flag == 0].sample(args.count - args.count // 3, random_state=args.seed)])
    rng = random.Random(args.seed)
    made = {"APPROVED": 0, "REJECTED": 0}
    for i, r in enumerate(sample.sample(frac=1, random_state=args.seed).itertuples(index=False)):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        body = {
            "full_name": f"{first} {last}",
            "email": f"{first.lower()}.{last.lower()}{i}@example.com",
            "phone": f"9{rng.randrange(10**8, 10**9)}",  # unique per applicant (OTP cooldown is per number)
            "age": int(r.Age), "marital_status": r.Marital, "profession": r.Profession,
            "experience": int(r.Experience), "current_job_years": int(r.CURRENT_JOB_YRS), "income": int(r.Income),
            "state": r.STATE, "city": r.CITY, "house_ownership": r.House_Ownership,
            "current_house_years": int(r.CURRENT_HOUSE_YRS), "car_ownership": r.Car_Ownership,
            "loan_amount": rng.choice([50_000, 150_000, 300_000, 500_000, 800_000, 1_500_000, 2_500_000]),
            "tenure_months": rng.choice([12, 24, 36, 60, 120, 240]),
            "purpose": rng.choice(PURPOSES), "consent": True,
        }
        ip = f"10.99.{i // 250}.{i % 250 + 1}"
        body["phone_verification_token"] = verify_phone(args.api, body["phone"], ip)
        out = post(args.api, "/applications", body, ip)
        made[out["decision"]] += 1
        print(f"{out['application_id']}  {out['decision']:<8}  p(default)={out['default_probability']:.3f}  {body['full_name']}")
    print(f"\nCreated {sum(made.values())} applications: {made}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        sys.exit(f"Could not reach the API: {e}. Start it with: uvicorn app.main:app --port 8000")
