# LendWise: Loan Eligibility Screening and Charge-Off Risk Prediction

LendWise screens a loan application from three inputs (loan amount, FICO score and debt-to-income ratio) using two machine learning models trained on the public LendingClub data, which contains both funded loans and rejected applications.

- The **eligibility model** gives a score from 0 to 100 for how closely an application resembles the ones LendingClub accepted (tiers: Likely, Borderline, Unlikely).
- The **charge-off model** gives the probability that a 36-month loan is not repaid (tiers: Low, Moderate, High).
- A **decision layer** turns both into an expected loss, applies approve / review / reject rules, checks the inputs with a **range guard**, and searches for a smaller **counter-offer** in $500 steps.
- A **loan officer** makes every final decision in the officer dashboard. LendWise is meant to assist a human reviewer, not to make lending decisions on its own.

This repository is the implementation of the B.Tech project report *"LendWise: Loan Eligibility Screening and Charge-Off Risk Prediction Using Machine Learning"* (Department of Computer Science & Engineering, ABES Engineering College, Ghaziabad).

## Results

All numbers below are produced by the scripts in `backend/scripts/` with seed 42 and are served live by the website (`/results`).

| | Value |
|---|---|
| Eligibility ROC AUC (2016 hold-out, 40,000 applications) | **0.9097** |
| Eligibility accuracy / precision / recall at 50% | 0.885 / 0.831 / 0.966 |
| Agreement with the rule FICO ≥ 660, DTI ≤ 35, loan < $40,000 | 99.3% |
| Charge-off ROC AUC (2015 test year, 100,000 loans) | **0.6265** |
| Mean predicted vs actual default rate (2015) | 13.9% vs 14.8% |
| Brier score: model vs base rate | 0.1232 vs 0.1265 |
| Largest calibration gap across risk deciles | 1.9 points |
| Loss severity on charged-off loans | 50.3% |
| Jumpy profiles, chosen variant C (eligibility / risk) | 0.7% / 0.2% |
| Acceptance suite | **117 passed, 0 failed, 1 warning** (126 bad input values, 18,720-input grid) |
| Median response time | about 19 ms per application through the API |

Audit of the first eligibility model (unconstrained, 2016 cohort): all features 0.9919, without employment length 0.9810, FICO alone 0.9556, employment length alone 0.9248, loan amount and DTI only 0.8403. 91% of rejected 2016 records have employment length "< 1 year". The audit also found that every accepted FICO value is a multiple of 5 (the file stores the low end of a 5-point range) against 19.5% of rejected ones; an unconstrained model uses this, and the monotonic constraints rule it out.

## How it works

```
Offline (scripts)                                   Online (every application)
-----------------                                   --------------------------
LendingClub accepted + rejected files               Browser ─► Next.js /api/* ─► FastAPI /api/v1
        │ build_cohorts.py                                                          │
        ▼                                                                           ▼
eligibility_2016 (100k + 100k)                      validator.validate  (Table A.1, one clear error)
chargeoff_36m (2012-2014 train, 2015 test)                  │
        │ train_models.py                                   ▼
        ▼                                           EligibilityModel ─┐
eligibility.joblib, chargeoff.joblib,               ChargeOffModel ───┼─► DecisionEngine ─► result
range_guard.joblib, metadata.json                   RangeGuard ───────┘   (EL, rules, tiers, counter-offer)
        │ evaluate.py, acceptance_suite.py
        ▼
evaluation.json, acceptance.json  ──────────────►  /metadata (model card shown on the website)
```

- **Models**: scikit-learn `HistGradientBoostingClassifier` (learning rate 0.1, 150 iterations, 8 leaves, 2,000 samples per leaf, L2 10.0) inside 3-fold sigmoid `CalibratedClassifierCV`. Monotonic constraints in `[loan amount, FICO, DTI]` order: eligibility `[-1, +1, -1]`, charge-off `[+1, -1, +1]`.
- **Decision rules**: reject if eligibility < 40 or expected loss > 11.07% (PD > 22%); otherwise review if the range guard flags the inputs; approve if eligibility ≥ 75 and expected loss ≤ 6.04% (PD ≤ 12%); review otherwise. EL = PD × 50.3%.
- **Range guard**: 0.1st to 99.9th percentile of the training loans, plus an Isolation Forest with 200 trees.
- **Shared code**: the API, the website (through the API) and the acceptance suite all use `app/ml/validator.py` and `app/ml/engine.py`, so what is tested is what users get.

## Repository layout

```
backend/                  FastAPI + Python 3.13 (all ML lives here)
  app/ml/                 constants, validator, layer_model (two models), guard, engine, registry, behaviour
  app/ml/artifacts/       trained models (~1 MB), metadata.json, evaluation.json, acceptance.json
  app/routers/            health, metadata (model card), screen, applications, contact, admin
  scripts/                download_data, build_cohorts, train_models, evaluate, acceptance_suite, seed_demo
  data/cohorts/           the two prepared datasets (compressed, in git); data/raw/ is not in git
  tests/                  pytest: validator, decision rules, API, emails
frontend/                 Next.js 16, TypeScript, Tailwind v4
  src/app/                /, /screen, /apply, /application/[id], /status, /how-it-works, /results, /about, /faq, /admin
  tests/                  screen-state.test.ts (TC-10: no old result left on screen)
```

## Run it locally

**Prerequisites:** Python 3.13 (with [`uv`](https://docs.astral.sh/uv/) or venv) and Node 22.

```bash
# Backend
cd backend
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env                       # edit secrets; DATABASE_URL defaults to local SQLite
.venv/bin/python -m pytest -q              # 74 tests
.venv/bin/uvicorn app.main:app --port 8000 # API docs at http://localhost:8000/docs

# Frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local
npm run dev                                # http://localhost:3000
npm test                                   # screening form state test
```

Officer login is at `/admin/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env`. To fill the dashboard with sample applications: `.venv/bin/python scripts/seed_demo.py --count 30` (it writes to the database in `DATABASE_URL`).

With Docker: `cp backend/.env.example backend/.env && docker compose up --build` (web on port 3000, API on 8000).

## Reproduce the models from the raw data

The trained models and the prepared datasets are already in git, so this is only needed to rebuild them.

```bash
cd backend
uv pip install --python .venv/bin/python -r requirements-train.txt
.venv/bin/python scripts/download_data.py      # ~650 MB from the public Kaggle dataset wordsforthewise/lending-club
.venv/bin/python scripts/build_cohorts.py      # ~3 minutes; writes data/cohorts/
.venv/bin/python scripts/train_models.py       # ~30 seconds; writes app/ml/artifacts/
.venv/bin/python scripts/evaluate.py           # ~4 minutes: variants, audit, 12 algorithms, subgroups
.venv/bin/python scripts/acceptance_suite.py   # ~20 seconds: 118 checks, exits 1 on any failure
```

Memory: at least 8 GB RAM. The rejected file has about 27.6 million rows and is read in chunks.

## API (`/api/v1`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | status, models loaded, model version |
| GET | `/metadata` | none | model card: inputs, thresholds, data, metrics, evaluation, acceptance results |
| POST | `/screen` | none (rate-limited) | screen `{loan_amount, fico, dti}`; nothing is stored; 422 with one message on bad input |
| POST | `/applications` | none (rate-limited) | screen and save an application for an officer |
| GET | `/applications/{id}/status?email=` | none | status by application ID and email |
| GET | `/applications/{id}` | `X-Access-Token` | status for the browser that applied (httpOnly cookie) |
| POST | `/applications/{id}/reply` | token or email | answer an officer's question |
| POST | `/contact` | none (rate-limited) | contact form |
| POST | `/admin/login` | none | officer JWT |
| GET | `/admin/applications` | JWT | search, filters (decision, recommendation, tiers, flag, dates), sort, pages |
| GET / PATCH / DELETE | `/admin/applications/{id}` | JWT | detail; approve, approve counter-offer, reject or request info; delete |
| GET | `/admin/stats`, `/admin/applications/export.csv` | JWT | dashboard numbers, CSV export |
| GET / PATCH | `/admin/messages`, `/admin/messages/{id}` | JWT | contact-form inbox; mark resolved or reopen |

## Deployment (free tiers)

- **Backend on Render (Free)**: root directory `backend/`, Docker deploy. Set `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS=https://<your-vercel-domain>` and `DATABASE_URL`. The models are in the image, so no download step is needed, and the API fits a 512 MB instance. The free instance sleeps after 15 minutes idle.
- **Database on Supabase (Free)**: use the Session pooler URI as `DATABASE_URL`. Tables are created on first start with an `lw_` prefix, so tables from the earlier version are left untouched. Free projects pause after about a week without activity.
- **Frontend on Vercel (Hobby)**: root directory `frontend/`, with `BACKEND_API_URL=https://<your-render-service>` and `NEXT_PUBLIC_SITE_URL=https://<your-domain>`.

## Limitations

- Only three inputs are comparable across both files, which keeps the charge-off AUC near 0.63; extra bureau fields raise it only to about 0.67.
- The eligibility score is not an approval probability (the training sample was 50/50; the real 2016 acceptance rate was about 8%).
- The charge-off model only sees funded loans, almost all with FICO 660 or more, so risk below 660 is a guess.
- US data from 2012 to 2016 with the US FICO score. Use in India would need retraining on local bureau data such as CIBIL.
- No fairness or adverse-impact analysis has been done yet; it must be done before any use on real people.
