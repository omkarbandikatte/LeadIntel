# Free & Open-Source Stack Decisions

Purpose: this project must not depend on any paid third-party API. This document names every point in the original architecture where a paid API is the "obvious" industry choice, and records what's used instead — so that during coding, nobody reaches for the paid default out of habit.

Read this alongside `01_TECHNICAL_ARCHITECTURE.md` before writing any ingestion, NLP, or scoring code.

---

## 1. Company Enrichment / Firmographic Data

| Common paid option | Why teams reach for it | What this project uses instead |
|---|---|---|
| ZoomInfo, Clearbit, Apollo.io | One API call returns clean firmographic data | Self-built scraper against public sources: MCA/ROC company filings (public registry data), public LinkedIn company pages, company "About Us" pages. Slower and messier, but free and legally scraping only public data. |
| Crunchbase / Tracxn paid tiers | Funding and growth-stage data | Public press releases and news RSS feeds; funding signals inferred from press mentions rather than a structured funding database. This is a real capability gap versus the paid tools — acceptable for V1, worth revisiting once the system proves ROI. |

## 2. Hiring / Intent Signals

| Common paid option | Why teams reach for it | What this project uses instead |
|---|---|---|
| Bombora, 6sense (paid intent-data platforms) | Cross-site behavioral intent signals | Own hiring-signal detection: scraping public job postings directly from company career pages and job boards that permit it, treating posting velocity/role type as the intent proxy. |
| LinkedIn Sales Navigator API | Structured people + intent data | Not used — public LinkedIn company page scraping only, not the paid Sales Navigator product. |

## 3. NLP / Text Understanding

| Common paid option | Why teams reach for it | What this project uses instead |
|---|---|---|
| OpenAI API, Anthropic API, other hosted LLM APIs | Strong zero-shot text classification with no model training | Locally-run open-weight models: `spaCy` for entity/keyword extraction, a Hugging Face open-source transformer checkpoint (e.g. a distilled BERT-family model) fine-tuned on your own labeled data and run on your own compute. Zero per-call cost, fully offline-capable. |
| Managed vector-search / embeddings APIs | Semantic search over documents | `sentence-transformers` (open-source, local) if embeddings are needed for similarity search later. |

## 4. Maps / Geolocation (if ever needed)

| Common paid option | Why teams reach for it | What this project uses instead |
|---|---|---|
| Google Maps Geocoding API | Reliable geocoding | Not required for V1 (location stored as reported city/state text). If geocoding becomes necessary, use the free OpenStreetMap Nominatim API within its usage policy rather than a paid tier. |

## 5. Task Queue / Infrastructure Services

| Common paid option | Why teams reach for it | What this project uses instead |
|---|---|---|
| AWS SQS, managed queue services | Reliable, hosted message queue | Self-hosted `Redis` + `Celery` — free, open-source, well-documented, sufficient at this project's scale. |
| Managed feature-store products (e.g. Feast Cloud, Tecton) | Purpose-built feature serving | Plain PostgreSQL tables, queried directly — no specialized feature-store product needed at this data volume. |
| Auth-as-a-service (Auth0, Clerk) | Fast to set up login/roles | Self-issued JWTs via `python-jose`, password hashing via `passlib` — a few hours of backend work, zero recurring cost. |

## 6. CRM Integration

| Common paid option | Why teams reach for it | What this project uses instead |
|---|---|---|
| Paid CRM platform API tiers (e.g. Salesforce API add-ons) | Native two-way sync | Sync at the database level if the existing CRM is self-hosted, or a scheduled CSV/spreadsheet import-export job if the current BD workflow is spreadsheet-based. Confirm which applies with Cloud Counselage before coding `crm/sync_service.py`. |

---

## 7. Important Honesty Note on "Free"

"No paid APIs" removes **per-call/per-request costs** — nobody is billed by usage volume as the system scales. It does **not** mean the project has zero cost:

- **Compute still needs to run somewhere.** Self-hosting Postgres, Redis, the backend, and the NLP models requires a server — whether that's existing infrastructure Cloud Counselage already has, a free-tier cloud instance, or a low-cost VM. This document doesn't solve for hosting cost, only for avoiding pay-per-use API billing.
- **Open-weight NLP models need compute to run inference**, especially transformer-based classification. A CPU can handle this project's volume; it will just be slower than a GPU. Budget for this in the ML engineer's Week 3–4 work rather than discovering it as a surprise.
- **Scraping carries legal risk, not licensing cost.** Free doesn't mean risk-free — every source must be checked against its robots.txt and terms of service before it's added to the scraper list (see PRD Section 9.1 and the open dependency question on legal clearance from the last discussion).

If a future requirement genuinely can't be met without a paid API (e.g., a specific enrichment field only ZoomInfo has), that should come back as an explicit PM decision with a cost-benefit note — not a default reached for mid-sprint.
