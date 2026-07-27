# Project Setup & Repo Structure

This is the scaffold to start coding against directly — hand this (plus the architecture, schema, and API docs) to whoever's writing the first lines of code, human or AI-assisted.

---

## 1. Repository Layout

```
leadintel/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entrypoint
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── companies.py
│   │   │   ├── leads.py
│   │   │   ├── scoring.py
│   │   │   ├── crm_sync.py
│   │   │   └── analytics.py
│   │   ├── models/                  # SQLAlchemy models mirroring 02_DATABASE_SCHEMA.sql
│   │   ├── schemas/                 # Pydantic request/response models matching 03_API_SPECIFICATION.md
│   │   ├── services/
│   │   │   ├── ingestion/
│   │   │   │   ├── firmographic_scraper.py
│   │   │   │   ├── job_posting_scraper.py
│   │   │   │   └── news_scraper.py
│   │   │   ├── nlp/
│   │   │   │   ├── entity_extraction.py     # spaCy pipeline
│   │   │   │   └── need_classifier.py       # local Hugging Face model
│   │   │   ├── scoring/
│   │   │   │   ├── rules_engine.py          # V1 cold-start scorer
│   │   │   │   └── ml_scorer.py             # V2 XGBoost/logistic model
│   │   │   └── crm/
│   │   │       └── sync_service.py
│   │   ├── core/
│   │   │   ├── config.py            # env var loading
│   │   │   └── security.py          # JWT issuing/verification
│   │   └── db/
│   │       └── session.py
│   ├── alembic/                     # DB migrations generated from 02_DATABASE_SCHEMA.sql
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── app/                         # Next.js app router
│   │   ├── leads/                   # ranked lead list page
│   │   ├── companies/[id]/          # account profile drill-down
│   │   └── analytics/               # manager dashboard
│   ├── components/
│   ├── lib/api-client.ts            # typed client matching 03_API_SPECIFICATION.md
│   ├── package.json
│   └── Dockerfile
│
├── ml/
│   ├── notebooks/                   # exploratory analysis, feature validation
│   ├── training/
│   │   ├── train_scoring_model.py
│   │   └── train_need_classifier.py
│   └── artifacts/                   # saved model files (.pkl / .joblib), gitignored
│
├── infra/
│   ├── docker-compose.yml           # postgres, redis, backend, worker, frontend
│   └── celerybeat_schedule.py       # cron definitions for scraping/scoring jobs
│
├── .env.example
├── .gitignore
└── README.md
```

**Deviation from the original layout sketch:** the numbered docs (`01`–`05`)
live at the repo root, not under a `docs/` subfolder — that's where they
already existed when implementation started, and moving them risked drift
between two copies. Treat the root copies as the only copies.

---

## 2. `.env.example`

```
# --- Database ---
DATABASE_URL=postgresql://leadintel:leadintel@localhost:5432/leadintel

# --- Redis / Celery ---
REDIS_URL=redis://localhost:6379/0

# --- Auth ---
JWT_SECRET_KEY=replace-with-a-long-random-string
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# --- Scraping ---
SCRAPER_USER_AGENT="LeadIntelBot/1.0 (+contact: your-email@cloudcounselage.com)"
SCRAPER_REQUEST_DELAY_SECONDS=2

# --- NLP model (downloaded once, run locally — no API key needed) ---
SPACY_MODEL=en_core_web_sm
NEED_CLASSIFIER_HF_MODEL=typeform/distilbert-base-uncased-mnli

# --- ML scoring ---
SCORING_MODEL_ARTIFACT_PATH=./ml/artifacts/scoring_model.joblib

# --- CRM sync (CSV export/import path — see 05_FREE_STACK_DECISIONS.md §6) ---
CRM_SYNC_EXPORT_DIR=./data/crm_sync/export
CRM_SYNC_IMPORT_DIR=./data/crm_sync/import

# --- App ---
ENVIRONMENT=development
```

Notice there is no `OPENAI_API_KEY`, `CLEARBIT_API_KEY`, `ZOOMINFO_API_KEY`, or similar in this file — none of the components in this project need one. If a future contributor adds one, that's a signal scope has drifted from the "no paid APIs" constraint and it's worth a second look.

---

## 3. Local Setup Steps

```bash
# 1. Clone and enter the repo
git clone <repo-url> leadintel && cd leadintel

# 2. Start infra (Postgres + Redis) via Docker Compose
cd infra && docker-compose up -d postgres redis

# 3. Backend setup — use Python 3.12: spaCy/transformers/torch don't yet ship
#    prebuilt wheels for very new Python releases, which risks slow/failing
#    source builds on a bleeding-edge interpreter.
cd ../backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt        # API/DB/scoring/ML-training — fast
pip install -r requirements-heavy.txt    # spaCy + transformers + torch — slow
python -m spacy download en_core_web_sm      # free, local NLP model
alembic upgrade head                          # apply schema from 02_DATABASE_SCHEMA.sql
uvicorn app.main:app --reload --port 8000

# 4. Celery worker + beat (separate terminals)
celery -A app.worker worker --loglevel=info
celery -A app.worker beat --loglevel=info

# 5. Frontend setup
cd ../frontend
npm install
npm run dev
```

---

## 4. Recommended Build Order (maps to the 8-Week Delivery Plan)

1. `backend/app/db` + `alembic` migration from the schema file — get the database real first.
2. `services/ingestion/*` scrapers writing into `raw_documents` — prove data flows in.
3. `services/nlp/*` — entity extraction and need classification against real scraped text.
4. `services/scoring/rules_engine.py` — ship the cold-start scorer before the ML model exists.
5. `api/*` — wire up endpoints against the now-real data.
6. `frontend/app/leads` and `companies/[id]` — dashboard against the real API.
7. `services/scoring/ml_scorer.py` — replace the rules engine once labeled history is clean.
8. `services/crm/sync_service.py` — close the feedback loop.

---

## 5. Conventions

- **Python:** `black` for formatting, `ruff` for linting — both free, no license cost.
- **Commits:** reference the PRD requirement ID where relevant (e.g. `feat(scoring): implement FR-3 rules-based scorer`).
- **Secrets:** never commit `.env` — only `.env.example` is checked in.
- **Models:** trained model artifacts go in `ml/artifacts/` and are `.gitignore`d; check in the training scripts, not the binaries, unless the repo uses Git LFS.
