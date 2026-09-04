# Client Update — LeadIntel Project
**Client:** Cloud Counselage
**Reporting Period:** August 2026 — Week 1 (Weeks 1–4 Deliverables)
**Date:** 6 August 2026
**Prepared by:** Project Team

---

## Executive Summary

All planned activities for August Weeks 1–4 have been completed ahead of schedule. The foundational groundwork for the LeadIntel AI-Based B2B Lead Intelligence & Conversion Prediction System is fully in place — from a clearly defined problem statement through to an initial trained ML model and an approved project plan.

---

## Week 1–4 Activity Status

| # | Activity | Status |
|---|----------|--------|
| 1 | Project Kick-off | ✅ Completed |
| 2 | Problem Definition | ✅ Completed |
| 3 | Literature Review | ✅ Completed |
| 4 | Research Gap Identification | ✅ Completed |
| 5 | Dataset Identification & Collection | ✅ Completed |
| 6 | Data Cleaning & Exploratory Data Analysis | ✅ Completed |

---

## Deliverable Details

### 1. Project Kick-off
The team aligned on project goals, scope, and expectations. The full system architecture was designed and documented, covering the end-to-end pipeline from data ingestion through to the analytics dashboard. Role-based access, CRM sync, and a zero paid-API constraint were agreed upon as core design principles.

### 2. Approved Problem Statement
> *"Automatically identify high-potential B2B companies, score their buying intent and conversion probability, and recommend which Cloud Counselage service line — Branding, Hiring, Learning & Development, or IAC Partnership — to pitch next; using only free and open-source tooling."*

The problem statement has been formalised and is embedded in the project's core documentation.

### 3. Research Gap Identification
A structured review identified the gaps between common paid industry tools and what is achievable with free, open-source alternatives:

| Domain | Paid Standard | Gap / Alternative Chosen |
|--------|--------------|--------------------------|
| Company enrichment | ZoomInfo, Clearbit | Public MCA/ROC filings + web scraping |
| Intent data | Bombora, 6sense | Job-posting velocity as an intent proxy |
| NLP / Classification | OpenAI API | Local HuggingFace `distilbert-base-uncased-mnli` |
| Auth | Auth0, Clerk | Self-issued JWTs via `python-jose` |
| Task queue | AWS SQS | Self-hosted Redis + Celery |

All gaps are documented in `05_FREE_STACK_DECISIONS.md` and are accounted for in the system design.

### 4. Dataset Identification & Collection
- **Source:** Public web sources (company career pages, job boards, news RSS feeds, About Us pages)
- **Volume:** **6,711 labelled rows** collected and stored in the project's feature store
- **Coverage:** Firmographic signals, job-posting counts, NLP-derived category signals (Branding / Hiring / L&D / IAC Partnership), and historical CRM conversion outcomes

### 5. Dataset & Initial Analysis (EDA)
Exploratory Data Analysis was completed with the following outputs:

| Plot | Insight |
|------|---------|
| Class Distribution | Confirmed label balance across four service lines |
| Feature Distributions | Identified key skews in job-posting count and fit-score features |
| Correlation Heatmap | Highlighted collinear features for removal before model training |
| Win Rates by Segment | Revealed higher conversion rates in Hiring and L&D service lines |
| Boxplots | Flagged outliers in firmographic features requiring capping |

### 6. Project Plan
The full 8-week delivery roadmap has been finalised and is under version control. August Weeks 1–4 represent Phase 1 (Foundation); subsequent phases cover API development, frontend dashboard, CRM integration, and deployment.

---

## Initial Model Benchmark

As a bonus output from the EDA phase, an initial supervised ML model was trained on the collected dataset:

| Model | Accuracy | Precision | Recall | F1 Score | ROC-AUC |
|-------|----------|-----------|--------|----------|---------|
| **Logistic Regression v2** *(selected)* | 55.4% | 64.2% | 66.5% | **65.3%** | 0.52 |
| XGBoost v2 | 51.8% | 63.7% | 54.8% | 58.9% | 0.50 |

- **Selected model:** `logreg_v2` (higher F1 and AUC)
- **Training date:** 2 August 2026
- **Note:** These are cold-start baseline metrics on a noisy dataset. Model performance will improve as the feedback loop accumulates BD-rep outcome labels over the coming weeks.

---

## Risks & Notes

| Risk | Mitigation |
|------|-----------|
| Web scraping may hit rate limits or access restrictions | Polite crawl delays and respect for `robots.txt` built into all scrapers |
| Cold-start model accuracy is modest (F1 ~0.65) | V1 deterministic rules engine runs in parallel and provides immediate value |
| CRM sync format depends on Cloud Counselage's current CRM | CSV export/import designed as the default; DB-level sync available if CRM is self-hosted |

---

## Next Steps (Weeks 5–8 Preview)

- API development (FastAPI endpoints for scoring, feedback, analytics)
- Frontend dashboard build-out (Next.js — ranked lead list, account profiles, charts)
- CRM sync service implementation
- Automated retraining pipeline activation
- End-to-end integration testing and deployment

---

*For questions or feedback on this update, please contact the project team.*
