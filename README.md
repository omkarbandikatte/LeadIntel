# LeadIntel — AI-Based B2B Lead Intelligence & Conversion Prediction System

Built for Cloud Counselage's BD team. Identifies high-potential companies, scores
buying intent and conversion probability, and recommends which internal service
line (branding / hiring / learning & development / IAC partnership) to pitch —
without depending on any paid third-party API. See `05_FREE_STACK_DECISIONS.md`
for exactly what free/open-source substitute replaces each "obvious" paid tool.

The five numbered docs at the repo root (`01`–`05`) are the source of truth for
architecture, schema, and API contract — this README covers setup and points
back to them rather than repeating their content.

## Architecture at a glance

Scrapers (firmographic / job-posting / news) → raw documents (Postgres) → NLP
(spaCy + a local zero-shot Hugging Face classifier) → feature store (Postgres) →
scoring (rules engine V1, ML classifier V2) → FastAPI → Next.js dashboard.
Celery + Redis run the scheduled ingestion/scoring jobs. Full diagram in
`01_TECHNICAL_ARCHITECTURE.md`.

## Repository layout

```
backend/    FastAPI app, SQLAlchemy models, Alembic migrations, ingestion/NLP/scoring services, pytest suite
frontend/   Next.js (App Router) + TypeScript + Tailwind dashboard
ml/         Training scripts + fixture-data generator + trained model artifacts (gitignored)
infra/      docker-compose.yml, Celery Beat schedule
.github/    CI workflow
```

## Local setup

Requires Python 3.12 (spaCy/transformers/torch don't yet ship 3.14 wheels — see
"Known limitations" below), Node 20+, PostgreSQL 16, and Redis, all running
locally.

```bash
# 1. Database
createuser leadintel --pwprompt   # password: leadintel (or edit .env accordingly)
createdb leadintel --owner=leadintel
createdb leadintel_test --owner=leadintel   # used by the pytest suite

# 2. Backend
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt         # fast path: API, DB, scoring, ML training
pip install -r requirements-heavy.txt     # slow path: spaCy + transformers + torch
python -m spacy download en_core_web_sm

cp ../.env.example ../.env              # edit JWT_SECRET_KEY at minimum
alembic upgrade head

uvicorn app.main:app --reload --port 8000

# 3. Celery worker + beat (separate terminals, same venv)
celery -A app.worker worker --loglevel=info
celery -A app.worker beat --loglevel=info

# 4. Frontend
cd ../frontend
npm install
npm run dev   # http://localhost:3000
```

### Seeding a first admin user

There's no open registration endpoint by design (`03_API_SPECIFICATION.md`
marks `/api/auth/register` admin-only) — bootstrap the first admin directly:

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
"
```

### Training the V2 ML scorer

The rules engine (`rules_v1`) scores everything until real CRM history exists.
To exercise the full V1→V2 pipeline locally before real `crm_deals` data has
accumulated:

```bash
cd backend && source venv/bin/activate
python ../ml/training/generate_fixture_dataset.py   # seeds ~400 synthetic labeled companies
python ../ml/training/train_scoring_model.py         # trains, evaluates, writes ml/artifacts/scoring_model.joblib
```

Once the artifact exists, `app/services/scoring/ml_scorer.py` picks it up
automatically on the next scoring run — no code change or restart-time flag
needed, it's checked on every call.

### Running tests

```bash
cd backend && source venv/bin/activate
pytest --cov=app --cov-report=term-missing
```

Tests run against a real local Postgres (`leadintel_test`), not mocks — the
scoring math, RBAC, and CRM CSV round-trip are all exercised for real.

## Known limitations / assumptions

- **CRM sync direction**: `05_FREE_STACK_DECISIONS.md` §6 says to confirm with
  Cloud Counselage whether their CRM is self-hosted (DB-level sync) or
  spreadsheet-based (CSV). This build implements the CSV export/import path —
  the generically-correct default absent that confirmation. Switching to
  DB-level sync means replacing `app/services/crm/sync_service.py` only; the
  API contract (`POST /api/crm/sync`) doesn't change.
- **JWT storage**: the frontend stores the access token in `localStorage`
  (there's no refresh-token or cookie flow in `03_API_SPECIFICATION.md`). This
  is the standard trade-off for a pure bearer-token API without a defined
  cookie/session contract — acceptable for an internal BD tool, worth
  revisiting (httpOnly cookies + refresh tokens) if this is ever exposed
  beyond the internal network.
- **Python version**: the backend targets Python 3.12. spaCy, `transformers`,
  and `torch` don't yet publish prebuilt wheels for very new Python releases
  (3.14 at the time this was built) — installing against a bleeding-edge
  interpreter risks slow or failing source builds of `blis`/`thinc`.
- **Scraper coverage**: firmographic/job-posting scrapers only read a
  company's own public website (About/careers pages) and are heuristic —
  there's no structured jobs API, so job-title detection is keyword-based and
  will miss postings that don't match common role-title vocabulary.
- **Need classifier**: uses zero-shot classification against a general HF
  model (`typeform/distilbert-base-uncased-mnli` — chosen for CPU-friendly
  size over larger MNLI checkpoints) rather than a model fine-tuned on Cloud
  Counselage's own labeled data (per `01_TECHNICAL_ARCHITECTURE.md` §2.2's
  eventual target) — no labeled training set exists yet to fine-tune against.
- **NLP inference device is forced to CPU** (`app/services/nlp/need_classifier.py`):
  `transformers` will auto-select an available GPU (CUDA/Apple MPS) otherwise,
  but Celery's prefork worker pool forks the process after the parent may have
  touched GPU state — observed in testing as a hard `SIGABRT` reaching the
  Metal compiler service, not a catchable Python exception. Forcing CPU avoids
  this entirely and matches the deployment target `05_FREE_STACK_DECISIONS.md`
  assumes anyway.

## Documentation

- `01_TECHNICAL_ARCHITECTURE.md` — system design
- `02_DATABASE_SCHEMA.sql` — PostgreSQL schema
- `03_API_SPECIFICATION.md` — REST API contract
- `04_PROJECT_SETUP_AND_REPO_STRUCTURE.md` — repo layout, build order
- `05_FREE_STACK_DECISIONS.md` — why each free/open-source substitute was chosen
