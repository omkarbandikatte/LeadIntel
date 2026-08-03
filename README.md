# LeadIntel — AI-Based B2B Lead Intelligence & Conversion Prediction System

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

LeadIntel is an end-to-end B2B lead intelligence platform built for Cloud Counselage's Business Development team. It automatically identifies high-potential companies, scores their buying intent and conversion probability, and recommends which internal service line — **Branding**, **Hiring**, **Learning & Development**, or **IAC Partnership** — to pitch next.

**Zero paid third-party APIs.** Every component is free, open-source, or self-hosted. See [`05_FREE_STACK_DECISIONS.md`](05_FREE_STACK_DECISIONS.md) for the exact open-source substitute chosen for each "obvious" paid tool (ZoomInfo, OpenAI, Bombora, Auth0, etc.).

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Local Setup](#local-setup)
- [ML Pipeline](#ml-pipeline)
- [API Overview](#api-overview)
- [Running Tests](#running-tests)
- [Docker](#docker)
- [Known Limitations](#known-limitations)
- [Documentation](#documentation)

---

## Features

- **Automated ingestion** — Celery Beat-driven scrapers pull firmographic data, job postings, and news/press releases from public sources on a daily/weekly schedule.
- **NLP pipeline** — spaCy entity/keyword extraction + a locally-run HuggingFace `distilbert-base-uncased-mnli` zero-shot classifier categorises every document into Branding / Hiring / L&D / IAC Partnership — no OpenAI calls, fully offline.
- **Two-stage lead scoring**:
  - **V1 Rules Engine** — deterministic scoring from the day the system is deployed (cold-start safe).
  - **V2 ML Scorer** — Logistic Regression / XGBoost classifier (trained on 6 711 rows, `logreg_v2` selected at F1 0.65 / AUC 0.52) that automatically takes over once `ml/artifacts/scoring_model.joblib` exists.
- **Per-service probability breakdown** — each scored company gets a probability estimate for all four service lines, not just a single recommendation.
- **Explainability** — `top_factors` field on every score shows which signals drove the result.
- **CRM sync** — CSV export/import round-trip (or DB-level sync if the CRM is self-hosted).
- **RBAC** — admin / manager / BD-rep roles enforced at the API layer with self-issued JWTs.
- **Feedback loop** — BD reps mark outcomes; Celery Beat re-trains the ML model automatically when accuracy drops below 70%.
- **Analytics dashboard** — ranked lead list, account profile pages, pipeline analytics, and charts — all in a Next.js App Router frontend.

---

## Architecture

```
                 ┌──────────────────────────────────────────┐
                 │           SCHEDULER  (Celery Beat)        │
                 └──────────────────┬───────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
 Firmographic Scraper      Job Posting Scraper        News / RSS Scraper
 (requests + bs4)          (Playwright + bs4)         (feedparser)
        │                           │                           │
        └───────────────────────────┴───────────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  raw_documents       │
                         │  (Postgres JSONB)    │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  NLP Service         │
                         │  spaCy + HF model    │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  Feature Store       │
                         │  (Postgres tables)   │
                         └──────────┬──────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
     V1 Rules Engine                          V2 ML Scorer
     (always active)                          (logreg_v2 / xgb_v2)
               └────────────────────┬────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  lead_scores table   │
                         │  fit · intent        │
                         │  conv_probability    │
                         │  service_probs       │
                         │  top_factors         │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
             FastAPI Backend              CRM Sync Service
          /companies /leads               CSV export/import
          /scores /analytics
          /crm-sync /auth
                    │
                    ▼
           Next.js Dashboard
           (App Router + Tailwind)
```

Full detail in [`01_TECHNICAL_ARCHITECTURE.md`](01_TECHNICAL_ARCHITECTURE.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | FastAPI 0.111, Python 3.12, Uvicorn |
| **ORM / Migrations** | SQLAlchemy 2, Alembic |
| **Database** | PostgreSQL 16 |
| **Task Queue** | Celery 5 + Redis |
| **NLP** | spaCy `en_core_web_sm`, HuggingFace `distilbert-base-uncased-mnli` |
| **ML** | scikit-learn 1.5.2, XGBoost 2.1.3, joblib |
| **Auth** | python-jose (JWT), passlib (bcrypt) |
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **Charts** | Recharts |
| **Containerisation** | Docker, docker-compose |
| **CI** | GitHub Actions |

---

## Repository Layout

```
backend/
├── app/
│   ├── api/          # FastAPI routers (auth, leads, companies, scoring, analytics, crm_sync)
│   ├── core/         # Config, security (JWT + bcrypt)
│   ├── db/           # SQLAlchemy session, base class
│   ├── models/       # ORM models (Company, LeadScore, NLPFeature, RawDocument, User, …)
│   ├── schemas/      # Pydantic request/response schemas
│   ├── services/
│   │   ├── ingestion/    # Firmographic, job-posting, news scrapers
│   │   ├── nlp/          # spaCy extractor + HF need classifier
│   │   ├── scoring/      # rules_engine.py (V1) + ml_scorer.py (V2)
│   │   └── crm/          # CSV sync service
│   ├── main.py       # FastAPI app factory
│   └── worker.py     # Celery app + Beat tasks
├── alembic/          # DB migrations
├── tests/            # pytest suite (auth, RBAC, scoring, CRM round-trip)
├── requirements.txt          # Core dependencies
└── requirements-heavy.txt    # spaCy + transformers + torch

frontend/
├── app/              # Next.js App Router pages
│   ├── dashboard/    # BD ranked lead list
│   ├── leads/        # Lead detail pages
│   ├── companies/    # Company profile pages
│   ├── analytics/    # Pipeline analytics + charts
│   ├── admin/        # Admin panel
│   └── login/
├── components/       # Shared UI (AppShell, Sidebar, NavBar, charts, …)
├── hooks/            # Custom React hooks
└── lib/              # API client, auth context

ml/
├── training/
│   ├── generate_fixture_dataset.py   # Generates ~400 synthetic labelled companies
│   ├── load_real_fixture_dataset.py  # Loads real CRM-derived data
│   └── train_scoring_model.py        # Trains + evaluates logreg_v2 / xgb_v2
├── artifacts/
│   ├── scoring_model.joblib          # Trained model (auto-loaded by ml_scorer.py)
│   └── training_report.json          # Last run metrics
└── notebooks/
    └── EDA_and_Model_Analysis.ipynb

infra/
├── docker-compose.yml
└── celerybeat_schedule.py
```

---

## Local Setup

**Prerequisites:** Python 3.12, Node 20+, PostgreSQL 16, Redis — all running locally.

### 1. Database

```bash
createuser leadintel --pwprompt    # set password: leadintel (or update .env)
createdb leadintel --owner=leadintel
createdb leadintel_test --owner=leadintel    # used by the pytest suite
```

### 2. Backend

```bash
cd backend
python3.12 -m venv venv && source venv/bin/activate

pip install -r requirements.txt           # API, DB, scoring, ML training
pip install -r requirements-heavy.txt     # spaCy + transformers + torch (slow, ~2 GB)
python -m spacy download en_core_web_sm

cp ../.env.example ../.env                # edit JWT_SECRET_KEY at minimum
alembic upgrade head

uvicorn app.main:app --reload --port 8000
# API docs available at http://localhost:8000/docs
```

### 3. Celery Worker + Beat

Open two additional terminals (same venv activated):

```bash
celery -A app.worker worker --loglevel=info
celery -A app.worker beat   --loglevel=info
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Seed a First Admin User

Registration is admin-only by design. Bootstrap the first admin directly:

```bash
cd backend && source venv/bin/activate
python -c "
from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models.user import User

db = SessionLocal()
db.add(User(email='admin@cloudcounselage.com', full_name='Admin', role='admin',
            hashed_password=hash_password('ChangeMe123!')))
db.commit()
print('Admin created.')
"
```

---

## ML Pipeline

### V1 — Rules Engine (cold-start, always active)

Scores every company deterministically using weighted signals:

| Signal | Description |
|---|---|
| `fit_score` | Industry / size / geography fit |
| `intent_score` | Hiring velocity, press activity, NLP category match |
| `top_factors` | Human-readable explanation of top 3 drivers |
| `service_probs` | Weighted probability per service line |

### V2 — Supervised ML Scorer (activates once artifact exists)

When `ml/artifacts/scoring_model.joblib` is present, `ml_scorer.py` replaces the rules-engine conversion probability automatically — no restart needed.

**Training the model:**

```bash
cd backend && source venv/bin/activate

# Option A — synthetic fixture data (~400 labelled companies)
python ../ml/training/generate_fixture_dataset.py
python ../ml/training/train_scoring_model.py

# Option B — load from real CRM export first
python ../ml/training/load_real_fixture_dataset.py
python ../ml/training/train_scoring_model.py
```

**Latest training run** (`ml/artifacts/training_report.json`):

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **logreg_v2** ✓ selected | 0.554 | 0.642 | 0.665 | **0.653** | 0.524 |
| xgb_v2 | 0.518 | 0.637 | 0.548 | 0.589 | 0.499 |

Trained on **6 711 rows** · 9 features · `logreg_v2_2026-08-02` artifact.

### Feedback Loop

Celery Beat monitors prediction accuracy. When it drops below 70%, the pipeline re-trains automatically and replaces the artifact — no manual intervention required.

---

## API Overview

Base URL: `http://localhost:8000/api`  
Interactive docs: `http://localhost:8000/docs`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | Obtain JWT access token |
| `POST` | `/auth/register` | Create user (admin only) |
| `GET` | `/companies` | Paginated company list |
| `GET` | `/companies/{id}` | Company detail + latest score |
| `POST` | `/companies` | Add company (admin/manager) |
| `GET` | `/leads` | Ranked lead list with scores |
| `POST` | `/scoring/trigger` | Manually trigger scoring run |
| `POST` | `/scoring/feedback` | Submit outcome feedback |
| `GET` | `/analytics/overview` | Pipeline KPIs |
| `GET` | `/analytics/trends` | Score trend time-series |
| `POST` | `/crm/sync` | Export/import CRM CSV |

Full contract in [`03_API_SPECIFICATION.md`](03_API_SPECIFICATION.md).

---

## Running Tests

```bash
cd backend && source venv/bin/activate
pytest --cov=app --cov-report=term-missing
```

Tests run against a real local Postgres (`leadintel_test`) — no mocks. Coverage includes:

- `test_auth.py` — login, token validation, registration RBAC
- `test_rbac.py` — role-based access enforcement across endpoints
- `test_leads.py` — lead list, pagination, score ordering
- `test_companies.py` — company CRUD
- `test_rules_engine.py` — V1 scoring determinism + edge cases
- `test_ml_scorer.py` — V2 scorer with fixture artifact
- `test_crm_sync.py` — CSV export/import round-trip

---

## Docker

Bring the full stack up with a single command:

```bash
cd infra
docker-compose up --build
```

Services started: `postgres`, `redis`, `backend` (Uvicorn), `worker` (Celery), `beat` (Celery Beat), `frontend` (Next.js).

---

## Known Limitations

- **CRM sync direction** — Implements the CSV export/import path. If the CRM is self-hosted, replace `app/services/crm/sync_service.py` only; the `POST /api/crm/sync` contract is unchanged.
- **JWT storage** — Frontend stores the access token in `localStorage` (no refresh-token or httpOnly cookie flow). Acceptable for an internal BD tool; revisit before any public-network exposure.
- **Python version** — Backend targets Python 3.12. spaCy / transformers / torch do not yet ship prebuilt wheels for Python 3.14+ — installing against a bleeding-edge interpreter risks slow/failing source builds of `blis`/`thinc`.
- **NLP inference on CPU** — `transformers` is forced to CPU in the Celery worker to avoid a hard `SIGABRT` crash caused by GPU state being touched in the parent process before prefork. This matches the assumed deployment target and is intentional.
- **Scraper coverage** — Scrapers read only a company's own public website (About + careers pages). Job-title detection is keyword-based and will miss postings that don't use standard role-title vocabulary.
- **Need classifier** — Uses a general-purpose zero-shot checkpoint (`distilbert-base-uncased-mnli`) rather than a model fine-tuned on Cloud Counselage's own labelled data. No fine-tuning dataset exists yet; this is a V1 trade-off.
- **ML model AUC** — The current logreg_v2 ROC-AUC of 0.52 reflects training on synthetic fixture data. Real CRM outcome data is expected to meaningfully improve discrimination.

---

## Documentation

| File | Contents |
|---|---|
| [`01_TECHNICAL_ARCHITECTURE.md`](01_TECHNICAL_ARCHITECTURE.md) | Full system design, component responsibilities, data-flow diagrams |
| [`02_DATABASE_SCHEMA.sql`](02_DATABASE_SCHEMA.sql) | PostgreSQL schema — all tables, indexes, constraints |
| [`03_API_SPECIFICATION.md`](03_API_SPECIFICATION.md) | REST API contract — every endpoint, request/response shape, auth rules |
| [`04_PROJECT_SETUP_AND_REPO_STRUCTURE.md`](04_PROJECT_SETUP_AND_REPO_STRUCTURE.md) | Repo layout, build order, environment variables |
| [`05_FREE_STACK_DECISIONS.md`](05_FREE_STACK_DECISIONS.md) | Why every paid-API default was replaced and what was used instead |
| [`ml/ML_DOCUMENTATION.md`](ml/ML_DOCUMENTATION.md) | ML pipeline deep-dive: EDA, feature engineering, model training, feedback loop |

---

## Contributing

1. Fork the repo and create a feature branch off `main`.
2. Run `pytest` and ensure all tests pass before opening a PR.
3. Follow the existing code style — `ruff` for Python, ESLint for TypeScript.

---

*Built with Python · FastAPI · Next.js · PostgreSQL · scikit-learn — no paid APIs.*
- `05_FREE_STACK_DECISIONS.md` — why each free/open-source substitute was chosen
