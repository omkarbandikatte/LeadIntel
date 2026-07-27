# API Specification — AI-Based B2B Lead Intelligence & Conversion Prediction System

Backend: FastAPI. Auth: self-issued JWT (no third-party auth provider). All request/response bodies are JSON.
This is the contract the frontend, scoring service, and CRM sync job all build against — treat it as source of truth once coding starts.

---

## Auth

### `POST /api/auth/login`
Request:
```json
{ "email": "bd.exec@cloudcounselage.com", "password": "string" }
```
Response `200`:
```json
{ "access_token": "jwt-string", "token_type": "bearer", "role": "bd_executive" }
```

### `POST /api/auth/register` *(admin only)*
```json
{ "email": "string", "full_name": "string", "password": "string", "role": "bd_executive|manager|admin" }
```

---

## Companies

### `POST /api/companies`
Add a company manually (BD can also bulk-upload via CSV using this same shape).
```json
{ "name": "string", "website": "string", "industry": "string" }
```
Response `201`: full company object with `id`, `enrichment_status: "pending"`.

### `POST /api/companies/bulk-upload`
Multipart CSV upload. Returns count of rows accepted/rejected with reasons.

### `GET /api/companies/{company_id}`
Returns company record + latest enrichment + latest NLP features.

### `POST /api/companies/{company_id}/enrich`
Triggers (or re-triggers) the scraping + NLP pipeline for a single company. Returns `202 Accepted` — enrichment runs async via Celery; poll `enrichment_status` on the company object.

### `GET /api/companies/{company_id}/documents`
Returns the raw scraped documents (job postings, about-page text, news mentions) backing this company's enrichment — used by the account profile "source evidence" view (PRD FR-6).

---

## Leads (scored companies)

### `GET /api/leads`
Query params: `sort` (`score_desc` default), `min_score`, `max_score`, `industry`, `region`, `recommended_service`, `page`, `page_size`.
Response:
```json
{
  "total": 128,
  "page": 1,
  "page_size": 25,
  "results": [
    {
      "company_id": "uuid",
      "company_name": "Acme Corp",
      "conversion_probability": 78.4,
      "recommended_service": "hiring",
      "recommendation_confidence": 0.81,
      "industry": "SaaS",
      "location": "Bengaluru",
      "last_scored_at": "2026-08-10T09:00:00Z"
    }
  ]
}
```

### `GET /api/leads/{company_id}/explanation`
Returns the full score breakdown for a single lead — this backs the "score explanation" UI required for BD trust (PRD Section 10.3).
```json
{
  "company_id": "uuid",
  "fit_score": 72.0,
  "intent_score": 84.0,
  "conversion_probability": 78.4,
  "top_factors": [
    { "factor": "3 open engineering roles posted in last 14 days", "weight": 0.34 },
    { "factor": "Employee band 51-200 matches strongest historical ICP segment", "weight": 0.28 },
    { "factor": "No recent branding-related content on company site", "weight": -0.10 }
  ],
  "recommended_service": "hiring",
  "recommendation_confidence": 0.81,
  "model_version": "xgb_v2_2026-08"
}
```

### `POST /api/leads/{company_id}/feedback`
```json
{ "is_accurate": false, "comment": "Company already has an in-house recruiter, hiring need is low." }
```
Feeds the retraining loop (PRD FR-8).

---

## Scoring (internal — called by the scheduler, exposed for manual re-runs)

### `POST /api/scoring/run`
Triggers a full or incremental scoring batch across all companies. Body:
```json
{ "mode": "incremental" }
```
`mode` is `"incremental"` (only new/changed companies) or `"full"` (recompute everything — used after a model retrain).

---

## CRM Sync

### `POST /api/crm/sync`
Triggers a sync job in the given direction.
```json
{ "direction": "push" }
```
`push` sends newly scored leads to the CRM/export target; `pull` ingests updated deal outcomes back for retraining.

### `GET /api/crm/sync/history`
Returns the `crm_sync_log` table entries for audit/troubleshooting.

---

## Analytics (manager view)

### `GET /api/analytics/team`
```json
{
  "total_leads_scored": 480,
  "score_band_performance": [
    { "band": "80-100", "count": 62, "closed_won_rate": 0.41 },
    { "band": "60-79", "count": 140, "closed_won_rate": 0.19 },
    { "band": "0-59", "count": 278, "closed_won_rate": 0.03 }
  ],
  "model_accuracy_trend": [
    { "period": "2026-07", "top1_recommendation_accuracy": 0.68 },
    { "period": "2026-08", "top1_recommendation_accuracy": 0.74 }
  ]
}
```

---

## Standard Error Shape

```json
{ "error": { "code": "COMPANY_NOT_FOUND", "message": "No company with this id exists." } }
```

## Notes for Implementation
- All endpoints require a valid JWT except `/api/auth/login`.
- Role-based access: `bd_executive` can read leads/companies and post feedback; `manager` additionally sees `/api/analytics/*`; `admin` additionally manages users and triggers `/api/scoring/run` and `/api/crm/sync` manually.
- No endpoint here calls out to a paid third-party API — enrichment and scoring are internal async jobs backed by the scrapers and models described in `01_TECHNICAL_ARCHITECTURE.md`.
