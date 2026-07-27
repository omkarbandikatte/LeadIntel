# Technical Architecture — AI-Based B2B Lead Intelligence & Conversion Prediction System

**Companion to:** Project 3 PRD and 8-Week Delivery Plan
**Constraint driving every choice below:** zero paid third-party APIs. Every component is free, open-source, or self-hosted. See `05_FREE_STACK_DECISIONS.md` for the reasoning behind each substitution.

---

## 1. System Overview

```
                 ┌─────────────────────────────────────────────────────────┐
                 │                     SCHEDULER (Celery Beat)              │
                 │        triggers ingestion jobs on a daily/weekly cron    │
                 └───────────────────────────┬───────────────────────────────┘
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────────────┐
        ▼                                     ▼                                     ▼
┌───────────────────┐             ┌───────────────────────┐             ┌──────────────────────┐
│ FIRMOGRAPHIC       │             │ JOB POSTING /          │             │ NEWS / PRESS          │
│ SCRAPER            │             │ CAREER PAGE SCRAPER    │             │ SCRAPER (RSS/HTML)    │
│ (Playwright/        │             │ (Playwright/            │             │ (feedparser + requests)│
│  requests+bs4)      │             │  requests+bs4)          │             │                        │
└─────────┬──────────┘             └───────────┬────────────┘             └───────────┬───────────┘
          │                                    │                                       │
          └────────────────────┬───────────────┴───────────────────┬───────────────────┘
                                ▼                                   ▼
                     ┌─────────────────────┐             ┌────────────────────────┐
                     │  RAW DOCUMENT STORE  │             │   NLP PROCESSING        │
                     │  (Postgres JSONB /   │────────────▶│   SERVICE               │
                     │   local file store)  │             │  spaCy NER + local      │
                     └─────────────────────┘             │  Hugging Face model      │
                                                          │  (need classification)  │
                                                          └───────────┬────────────┘
                                                                      ▼
                                                          ┌────────────────────────┐
                                                          │   FEATURE STORE          │
                                                          │  (Postgres tables:        │
                                                          │  firmographic + NLP +     │
                                                          │  CRM-derived features)    │
                                                          └───────────┬────────────┘
                                                                      ▼
                                                          ┌────────────────────────┐
                                                          │  SCORING & RECOMMENDATION│
                                                          │  SERVICE (scikit-learn /  │
                                                          │  XGBoost, served via      │
                                                          │  FastAPI in-process)      │
                                                          └───────────┬────────────┘
                                                                      ▼
                                          ┌────────────────────────────────────────────┐
                                          │              BACKEND API (FastAPI)           │
                                          │  /companies  /leads  /scores  /feedback      │
                                          │  /crm-sync   /analytics  /auth               │
                                          └───────────┬───────────────────┬─────────────┘
                                                       ▼                   ▼
                                        ┌───────────────────────┐   ┌───────────────────────┐
                                        │  DASHBOARD (Next.js)    │   │  CRM SYNC SERVICE       │
                                        │  BD ranked lead list,   │   │  push/pull to existing  │
                                        │  account profile view,  │   │  CRM or spreadsheet     │
                                        │  manager analytics       │   │  (CSV/Sheets API-free   │
                                        │                          │   │   export, or DB-level    │
                                        │                          │   │   sync if CRM is         │
                                        │                          │   │   self-hosted)           │
                                        └───────────────────────┘   └───────────────────────┘
```

All components run as separate processes/containers on the same host or small cluster — nothing here requires calling out to a paid SaaS API to function.

---

## 2. Component Responsibilities

### 2.1 Scrapers (Ingestion Layer)
- **Firmographic scraper** — pulls public company data (registry filings, public LinkedIn company pages, company "About" pages). Runs on a schedule via Celery Beat.
- **Job posting scraper** — pulls open roles from public career pages and job boards that permit scraping under their robots.txt. This is the primary hiring-signal source.
- **News/press scraper** — uses free RSS feeds (Google News RSS, company blog RSS) via `feedparser`, avoiding any paid news API.
- All scrapers write raw HTML/text into a raw document store (a Postgres table with a JSONB payload column is sufficient at this scale — no need for a separate object store initially).

### 2.2 NLP Processing Service
- **Entity/keyword extraction** — `spaCy` (open-source, runs fully locally, no per-call cost) pulls role titles, department names, and growth-related language out of scraped text.
- **Need classification** — a locally-run, open-weight transformer (e.g., a distilled BERT-family checkpoint from Hugging Face, downloaded once and run on your own hardware/CPU-GPU — not called via a paid inference API) classifies each document into Branding / Hiring / L&D / IAC-partnership.
- Output is written to the feature store as structured columns (predicted category + confidence).

### 2.3 Feature Store
- A set of Postgres tables (not a separate specialized feature-store product) holding: firmographic features, NLP-derived features, CRM-derived historical outcome features. Kept simple and query-able directly by the scoring service — no managed feature-store service needed.

### 2.4 Scoring & Recommendation Service
- **V1 (cold start):** rules-based scorer — transparent point-based scoring using firmographic + NLP features, no model training required. Ships in Week 2 per the delivery plan.
- **V2:** supervised classifier (`scikit-learn` logistic regression → `XGBoost`/`LightGBM` as data volume grows) trained on historical CRM won/lost labels. All trained and run locally; nothing here calls an external ML API.
- Produces: conversion-probability score (0–100), top-3 explanation factors, and a recommended service line with confidence.

### 2.5 Backend API (FastAPI)
- Single FastAPI service exposing REST endpoints (full contract in `03_API_SPECIFICATION.md`).
- Handles auth (self-issued JWTs via `python-jose` + `passlib` for password hashing — no third-party auth provider), role-based access control, and orchestration between the feature store, scoring service, and dashboard.

### 2.6 Dashboard (Next.js + React)
- BD ranked lead list, account profile drill-down, manager analytics view.
- Talks only to the internal FastAPI backend — no direct third-party API calls from the frontend.

### 2.7 CRM Sync Service
- If Cloud Counselage's existing CRM has a self-hosted DB or CSV/Sheets-based export/import workflow, sync happens at the database or file level — no paid CRM-API subscription required. If the current workflow is spreadsheet-based, sync is a scheduled CSV export/import job.

### 2.8 Scheduler
- `Celery` + `Redis` (both free, open-source, self-hosted) run all scheduled jobs: scraping cadence, feature refresh, nightly scoring recompute, CRM sync.

---

## 3. Technology Stack (all free / open-source)

| Layer | Technology | License / Cost |
|---|---|---|
| Scraping | Playwright, requests, BeautifulSoup, feedparser | Open-source, free |
| Task queue / scheduler | Celery + Redis | Open-source, free (self-hosted) |
| Database | PostgreSQL | Open-source, free (self-hosted) |
| NLP | spaCy, Hugging Face `transformers` (local, open-weight models) | Open-source, free |
| ML | scikit-learn, XGBoost / LightGBM | Open-source, free |
| Backend API | FastAPI, Uvicorn | Open-source, free |
| Auth | python-jose (JWT), passlib | Open-source, free |
| Frontend | Next.js, React, Tailwind | Open-source, free |
| Containerization | Docker, Docker Compose | Free for this use case |
| Version control / CI | Git, GitHub Actions (free tier for private/small projects) | Free |

---

## 4. Deployment Model

- **Local/dev:** everything runs via `docker-compose up` — Postgres, Redis, backend, frontend, and a worker container, all on one machine.
- **Production:** the same containers deployed to whatever compute Cloud Counselage already has available (existing Azure environment, a single VM, or any self-managed server). This document intentionally stays cloud-agnostic — the stack has no hard dependency on any specific paid cloud service; it only needs a place to run Docker containers and a Postgres instance.
- Compute/hosting itself isn't "free" in the sense of zero cost, but no component here bills per API call — see `05_FREE_STACK_DECISIONS.md` for that distinction.

---

## 5. Non-Functional Notes

- **Explainability first:** every score must return its top contributing factors — this is a hard requirement for BD trust and adoption (see PRD Section 10.3).
- **Idempotent scraping:** re-running a scrape job for a company that hasn't changed should not create duplicate raw documents — dedupe on a content hash.
- **Respect robots.txt and site ToS** on every scraped source. If a target site disallows scraping, drop it rather than working around the block.
- **Data provenance:** every enriched field should record which scraper/source and timestamp produced it, for auditability (per PRD Section 9.1 DPDP compliance note).
