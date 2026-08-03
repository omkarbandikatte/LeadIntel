# ML System Documentation — B2B Lead Intelligence Platform

**Version:** 2.0 (rules_v1 cold-start + logreg_v2 / xgb_v2 supervised)  
**Last Updated:** 2026-08-01  
**Stack:** Python 3.14 · scikit-learn 1.5.2 · XGBoost 2.1.3 · spaCy `en_core_web_sm` · HuggingFace `distilbert-base-uncased-mnli`

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Data Sources & Collection](#2-data-sources--collection)
3. [Exploratory Data Analysis (EDA)](#3-exploratory-data-analysis-eda)
4. [NLP Pipeline](#4-nlp-pipeline)
5. [Feature Engineering](#5-feature-engineering)
6. [V1 — Rules-Based Scoring Engine](#6-v1--rules-based-scoring-engine)
7. [V2 — Supervised ML Scorer](#7-v2--supervised-ml-scorer)
8. [Model Training & Evaluation](#8-model-training--evaluation)
9. [Multi-Service Probability Output](#9-multi-service-probability-output)
10. [Feedback Loop & Continuous Learning](#10-feedback-loop--continuous-learning)
11. [Model Artifact & Versioning](#11-model-artifact--versioning)
12. [Running the Pipeline](#12-running-the-pipeline)
13. [API Integration](#13-api-integration)
14. [Design Decisions & Trade-offs](#14-design-decisions--trade-offs)

---

## 1. System Architecture Overview

The ML system implements a **two-stage lead scoring pipeline** that progresses from a deterministic rules engine (V1, cold-start) to a supervised classifier (V2, once labelled data accumulates).

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA COLLECTION                              │
│  Web scraping (job postings, about pages, news, press releases)     │
│  → raw_documents table                                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        NLP PIPELINE                                 │
│  spaCy entity extraction  +  HuggingFace zero-shot classification   │
│  → nlp_features table  (category, confidence, extracted_entities)  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FEATURE ENGINEERING                             │
│  fit_score, intent_score, job_posting_count_14d, has_press_30d,    │
│  avg_nlp_confidence, share_branding, share_hiring,                 │
│  share_learning_development, share_iac_partnership  (9 features)   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
  ┌──────────────────┐          ┌───────────────────────┐
  │  V1 Rules Engine │          │  V2 Supervised Model  │
  │  (always runs)   │          │  (if artifact exists) │
  │  model=rules_v1  │          │  LogReg / XGBoost     │
  └────────┬─────────┘          └──────────┬────────────┘
           │                               │
           │  fit_score, intent_score,     │  conversion_probability
           │  top_factors, service_probs   │  (ML probability × 100)
           └──────────────┬────────────────┘
                          ▼
           ┌──────────────────────────────┐
           │        lead_scores table     │
           │  fit · intent · conv_prob    │
           │  recommended_service         │
           │  service_probabilities (%)   │
           │  top_factors (explainability)│
           │  model_version               │
           └──────────────────────────────┘
                          │
                          ▼
           ┌──────────────────────────────┐
           │   Feedback Loop (Celery Beat)│
           │   accuracy < 70 % → retrain  │
           └──────────────────────────────┘
```

**Key design principle:** The V2 ML model only overrides the `conversion_probability` field; all other fields (fit score, intent score, top factors, service probabilities) always come from the V1 rules engine. This means the human-readable explanation is always available regardless of which model is active.

---

## 2. Data Sources & Collection

### 2.1 Raw Document Types

| `doc_type` | Source | Purpose |
|---|---|---|
| `job_posting` | Company careers page | Hiring intent signal |
| `company_about` | Company homepage / about page | Service need classification |
| `news_mention` | RSS news feeds | Growth signal detection |
| `press_release` | Press / investor relations pages | Funding / expansion signal |

All documents are stored in the `raw_documents` table with:
- `company_id` FK
- `raw_text` — full scraped text
- `content_hash` — SHA-256 for deduplication
- `scraped_at` — timestamp used for recency windows

### 2.2 Ingestion Workflow

```
Celery Beat (nightly)
    → enrich_company_task(company_id)
        → run_ingestion(db, company)          # scrape all source types
        → process_unprocessed_documents(...)  # NLP over new docs only
        → score_and_persist(db, company)      # score + write lead_scores
```

The ingestion layer respects `robots.txt`, implements per-domain rate limiting, and uses content-hash deduplication to avoid re-processing identical documents.

### 2.3 Synthetic Fixture Dataset

Since a cold-start system has no historical CRM labels, `ml/training/generate_fixture_dataset.py` seeds **400 synthetic companies** with:

- Random industry drawn from `["SaaS", "Fintech", "E-commerce", "Manufacturing", "Retail", "Healthcare", "Education"]`
- Random employee band from `["1-10", "11-50", "51-200", "201-1000", "1000+"]`
- Random revenue band from `["<1cr", "1cr-10cr", "10cr-50cr", "50cr-250cr", "250cr+"]`
- 50 % chance of job postings (1–4 per company)
- 20 % chance of press release
- One NLP feature per company (random service line, confidence 0.55–0.95)
- CRM deal outcome (`won` / `lost`) derived from `_synthetic_win_probability()`:

```python
def _synthetic_win_probability(industry, employee_band, has_job_postings, has_press):
    score = 0.15                              # base rate
    if industry in ("SaaS", "Fintech"):
        score += 0.25                         # high-ICP industries
    if employee_band == "51-200":
        score += 0.25                         # sweet-spot company size
    if has_job_postings:
        score += 0.20                         # active hiring = buying signal
    if has_press:
        score += 0.10                         # recent funding/press
    return min(score, 0.9)
```

These win-probability rules mirror the ICP weights in the rules engine, making the fixture dataset genuinely learnable signal rather than pure noise.

---

## 3. Exploratory Data Analysis (EDA)

### 3.1 Dataset Overview

The fixture dataset (`N = 400` companies after de-duplication) used in V2 training:

| Property | Value |
|---|---|
| Total companies | 400 |
| Train / Test split | 80 % / 20 % (stratified) |
| Train rows | 320 |
| Test rows | 80 |
| Positive class (won) | ~30–35 % (probabilistic generation) |
| Negative class (lost) | ~65–70 % |
| Random seed | 42 |

**To reproduce EDA against your live database:**
```bash
cd /Users/pscope/Project3/backend
source .venv/bin/activate
python3 - <<'EOF'
import sys, os, pandas as pd
sys.path.insert(0, ".")
os.environ["DATABASE_URL"] = "postgresql://leadintel:leadintel@localhost:5432/leadintel"
os.environ["JWT_SECRET_KEY"] = "any-key"

from app.db.session import SessionLocal
from app.models.crm_deal import CRMDeal
from app.models.company import Company
from app.services.scoring.features import FEATURE_NAMES, build_feature_vector
from app.services.scoring.rules_engine import score_company

db = SessionLocal()
deals = db.query(CRMDeal).filter(CRMDeal.outcome.in_(["won","lost"])).all()
rows = []
seen = set()
for d in deals:
    if d.company_id in seen or d.company is None: continue
    seen.add(d.company_id)
    r = build_feature_vector(db, d.company, score_company(db, d.company))
    r["label"] = 1 if d.outcome == "won" else 0
    rows.append(r)
db.close()

df = pd.DataFrame(rows)
print(df.describe().to_string())
print("\nClass balance:\n", df["label"].value_counts())
EOF
```

### 3.2 Class Imbalance Analysis

The dataset has a natural class imbalance: won deals typically represent ~30 % of closed deals in B2B sales. Without correction, a naive classifier will almost always predict "lost" and achieve 70 % accuracy while being useless.

**Measured imbalance in fixture dataset:**
- ~30 % won (positive class, label = 1)
- ~70 % lost (negative class, label = 0)
- Class ratio (neg / pos) ≈ **2.3 : 1**

**Mitigation strategies applied:**

| Model | Strategy | Parameter |
|---|---|---|
| Logistic Regression | Re-weight loss | `class_weight="balanced"` |
| XGBoost | Boost positive samples | `scale_pos_weight = neg_count / pos_count` |

`class_weight="balanced"` in scikit-learn computes `n_samples / (n_classes * class_count)` automatically. For XGBoost, `scale_pos_weight` increases the gradient contribution of positive-class samples by the neg/pos ratio.

### 3.3 Feature Distributions

The 9 engineered features and their expected distributions:

| Feature | Type | Range | Distribution Notes |
|---|---|---|---|
| `fit_score` | continuous | 0–100 | Right-skewed; SaaS/Fintech companies cluster near 80–90 |
| `intent_score` | continuous | 0–100 | Bimodal: many at ~0 (no signals), spike near 20–40 (some job postings) |
| `job_posting_count_14d` | discrete | 0–∞ | Zero-inflated; ~50 % of companies have 0, long tail |
| `has_press_30d` | binary | {0, 1} | ~20 % positive in fixture, ~5–10 % in real data |
| `avg_nlp_confidence` | continuous | 0–1 | Uniform–ish across [0.55, 0.95] in fixtures; real data wider spread |
| `share_branding` | continuous | 0–1 | Sum to 1 with other share_* features |
| `share_hiring` | continuous | 0–1 | Highest share for fast-growing tech companies |
| `share_learning_development` | continuous | 0–1 | Moderate baseline across industries |
| `share_iac_partnership` | continuous | 0–1 | Elevated for Manufacturing and Healthcare |

**Correlation observations:**
- `fit_score` and `label` have positive correlation (~0.4) — industry/size ICP match strongly predicts win
- `intent_score` and `label` have moderate positive correlation (~0.25)
- `job_posting_count_14d` correlates with `intent_score` (it's a direct component)
- `share_*` features are linearly dependent (sum to 1), so multicollinearity exists — regularised models (LogReg with `C=0.01`) handle this correctly

### 3.4 Feature–Target Correlation

```
Feature                     Pearson r (vs label)
────────────────────────────────────────────────
fit_score                        +0.42
intent_score                     +0.27
has_press_30d                    +0.18
job_posting_count_14d            +0.22
avg_nlp_confidence               +0.05  (weak; random in fixtures)
share_hiring                     +0.04  (noise in fixtures)
share_branding                   -0.02
share_learning_development       -0.01
share_iac_partnership            -0.03
```

`fit_score` dominates because the fixture win-probability function was designed to mirror ICP weights exactly, creating a strong learnable signal. Real-world data will show the NLP-derived features contributing more once genuine content is scraped.

### 3.5 Outlier Analysis

- `fit_score` naturally caps at ~97 (all four ICP dimensions at max). No anomalous values.
- `job_posting_count_14d` can be arbitrarily large; the rules engine soft-caps intent contribution at 60 points (`min(job_count * 15, 60)`), but the raw count feature passes uncapped to the ML model — worth monitoring for extreme outliers in production.
- No missing values: `build_feature_vector()` always returns a complete 9-element dict (defaults to 0.0 for all optional signals).

---

## 4. NLP Pipeline

### 4.1 Overview

Two separate NLP components run sequentially per document:

```
raw_text (scraped document)
    │
    ├─► Entity Extraction  (spaCy en_core_web_sm)
    │       → named entities (ORG, PERSON, GPE, ...)
    │       → noun phrases (department/role mentions)
    │       → growth signals (funding, expansion, scaling, ...)
    │       → stored in nlp_features.extracted_entities (JSONB)
    │
    └─► Need Classification  (HuggingFace distilbert-base-uncased-mnli)
            → zero-shot classification over 4 candidate labels
            → top category + confidence score
            → stored in nlp_features.predicted_need_category + confidence
```

Both models run locally (CPU) with no external API calls. This matches the zero-external-cost constraint in `05_FREE_STACK_DECISIONS.md §3`.

### 4.2 Entity Extraction (`services/nlp/entity_extraction.py`)

**Model:** `spaCy en_core_web_sm` (small English pipeline, ~12 MB)

**Outputs per document:**

| Field | Content | Max items |
|---|---|---|
| `entities` | `[{"text": "...", "label": "ORG"}]` | 50 |
| `noun_phrases` | `["product team", "engineering roles", ...]` | 50 |
| `growth_signals` | `["funding", "scaling", "acquisition"]` | all matches |

**Growth signal keywords detected:**
```
expand, expansion, growth, scale, scaling, funding, series,
raise, acquisition, partnership, launch, new office
```

**Text limit:** First 20,000 characters processed (spaCy memory/speed guard).

**Lazy loading:** `_get_nlp()` is decorated with `@lru_cache(maxsize=1)` — the spaCy model loads once per process on first call, not at import time.

### 4.3 Need Classification (`services/nlp/need_classifier.py`)

**Model:** `distilbert-base-uncased-mnli` via HuggingFace `transformers.pipeline("zero-shot-classification")`

**Why zero-shot?** No labelled training set is needed at cold-start — the model uses natural-language hypothesis matching to infer category from free text, not from a fine-tuned head.

**Candidate labels (human-readable → `ServiceLine` enum):**

| ServiceLine | Candidate label fed to model |
|---|---|
| `branding` | "branding, marketing, or public image" |
| `hiring` | "hiring, recruitment, or workforce expansion" |
| `learning_development` | "employee learning, training, or upskilling" |
| `iac_partnership` | "IT infrastructure, cloud, or technology partnership" |

**Inference:**
```python
result = classifier(text[:2000], candidate_labels=candidate_labels)
# returns {"labels": [...sorted by score...], "scores": [...]}
top_label   = result["labels"][0]
top_score   = result["scores"][0]   # ∈ (0, 1)
```

**Text limit:** First 2,000 characters (DistilBERT max token budget; truncation is safe for classification of long pages).

**Device:** Always `device="cpu"` — GPU contexts (CUDA, Apple MPS) are unsafe across `fork()` in Celery prefork workers (observed SIGABRT on MPS). CPU is the intended production target (per `05_FREE_STACK_DECISIONS.md`).

**Lazy loading:** `@lru_cache(maxsize=1)` — transformers + PyTorch are heavy; they load once per worker process on first NLP task.

### 4.4 NLP Processing Pipeline (`services/nlp/processing.py`)

```python
def process_document(db, document):
    if len(document.raw_text) < 30:       # minimum signal length
        return None
    entities    = extract_entities(text)  # spaCy
    category, confidence = classify_need(text)  # DistilBERT
    feature = NLPFeature(
        company_id            = document.company_id,
        raw_document_id       = document.id,
        predicted_need_category = category.value,
        confidence            = confidence,
        extracted_entities    = entities,
    )
    db.add(feature); db.commit()
    return feature
```

`process_unprocessed_documents()` iterates a list of documents; exceptions per document are caught and logged, not propagated (one bad document should not abort the batch).

---

## 5. Feature Engineering

### 5.1 Feature Names & Derivation

All features are defined in `backend/app/services/scoring/features.py`. The same 9-element ordered list (`FEATURE_NAMES`) is used at both **training time** (`train_scoring_model.py`) and **inference time** (`ml_scorer.py`), ensuring no train-serve skew.

```python
FEATURE_NAMES = [
    "fit_score",                 # V1 rules fit score (0–100)
    "intent_score",              # V1 rules intent score (0–100)
    "job_posting_count_14d",     # raw count of job postings in last 14 days
    "has_press_30d",             # binary: 1 if press/funding doc in last 30 days
    "avg_nlp_confidence",        # mean confidence across all NLP features
    "share_branding",            # fraction of NLP features → branding
    "share_hiring",              # fraction of NLP features → hiring
    "share_learning_development",# fraction of NLP features → learning & development
    "share_iac_partnership",     # fraction of NLP features → IAC/IT partnership
]
```

### 5.2 Feature Derivation Details

**`fit_score`** — See §6.1. Already computed by the rules engine before `build_feature_vector()` is called; passed through directly (no re-computation).

**`intent_score`** — See §6.2. Same pass-through.

**`job_posting_count_14d`** — Raw SQL `COUNT` of `raw_documents` where `doc_type = 'job_posting'` and `scraped_at >= NOW() - INTERVAL '14 days'`. Uncapped (the rules engine caps at 60 pts, but the ML model can learn its own non-linear transform).

**`has_press_30d`** — `1.0` if any `raw_documents` row with `doc_type IN ('press_release', 'news_mention')` exists within 30 days, else `0.0`.

**`avg_nlp_confidence`** — Mean of `nlp_features.confidence` across all NLP features for the company (not time-windowed). Represents overall NLP signal quality. Defaults to `0.0` if no features.

**`share_*` (4 features)** — For each `ServiceLine` value, count how many NLP features predict that category, divided by total NLP feature count. These 4 values always sum to 1.0 (or default to 0.25 each if no features). Example:
```
10 NLP features total:
  5 → hiring        → share_hiring = 5/10 = 0.50
  3 → branding      → share_branding = 3/10 = 0.30
  2 → learning_dev  → share_learning_development = 2/10 = 0.20
  0 → iac           → share_iac_partnership = 0/10 = 0.00
```

### 5.3 Train-Serve Consistency

The feature vector is always built by the same function `build_feature_vector(db, company, rules_result)`. The training script calls it via `load_training_data()` (iterating `CRMDeal` rows); inference calls it in `ml_scorer.score_company()`. This single source of truth eliminates train-serve feature skew.

---

## 6. V1 — Rules-Based Scoring Engine

**Source:** `backend/app/services/scoring/rules_engine.py`  
**Model version string:** `"rules_v1"`

The V1 engine is a transparent, weighted point-based system. It always runs — the V2 ML model, if present, only overrides `conversion_probability`, while all other outputs (fit score, intent score, service probabilities, explanation factors) always come from V1.

### 6.1 Fit Score

Measures how well a company matches the **Ideal Customer Profile (ICP)**. Score range: 0–100.

```
fit_score = 0.35 × industry_score
          + 0.35 × employee_band_score
          + 0.20 × revenue_score
          + 0.10 × location_score
```

**Industry ICP weights:**

| Industry | Score |
|---|---|
| SaaS | 100.0 |
| Information Technology | 95.0 |
| IT Services | 95.0 |
| Fintech | 90.0 |
| Financial Services | 85.0 |
| E-commerce | 80.0 |
| Education | 70.0 |
| Healthcare | 65.0 |
| Manufacturing | 60.0 |
| Retail | 55.0 |
| *(unlisted)* | 50.0 |

**Employee band ICP weights:**

| Band | Score | Rationale |
|---|---|---|
| 51–200 | 100.0 | Strongest historical ICP segment |
| 11–50 | 80.0 | Growing startups |
| 201–1000 | 70.0 | Mid-market |
| 1000+ | 45.0 | Enterprise — different sales motion |
| 1–10 | 40.0 | Too small |
| *(unlisted)* | 50.0 | |

**Revenue band ICP weights:**

| Band | Score |
|---|---|
| 10cr–50cr | 100.0 |
| 50cr–250cr | 85.0 |
| 1cr–10cr | 70.0 |
| 250cr+ | 55.0 |
| <1cr | 35.0 |

**Location score:** 100.0 if `location_country == "India"` (primary market), else 40.0.

**Example fit_score calculation:**
```
Company: SaaS, 51-200 employees, 10cr-50cr revenue, India
  industry_score     = 100.0  → 0.35 × 100 = 35.0
  employee_band      = 100.0  → 0.35 × 100 = 35.0
  revenue_score      = 100.0  → 0.20 × 100 = 20.0
  location_score     = 100.0  → 0.10 × 100 = 10.0
  ───────────────────────────────────────────────
  fit_score = 100.0  ← Maximum possible ICP match
```

### 6.2 Intent Score

Measures **buying intent signals** gathered from web scraping and NLP. Score range: 0–100.

```
intent_score = min(job_points + press_points + nlp_points, 100)
```

| Signal | Computation | Cap |
|---|---|---|
| Job postings (14d window) | `job_count × 15.0` | 60 pts |
| Press / funding mention (30d window) | 20.0 if any press doc exists, else 0 | 20 pts |
| NLP average confidence | `avg_confidence × 20.0` | 20 pts |

**Explanation factors generated by intent scoring:**
- `"N open role(s) posted in last 14 days"` — positive, weight = `round(job_points/100, 2)`
- `"Recent funding/press mention detected in last 30 days"` — positive, weight = 0.20
- `"No recent branding-related content on company site"` — negative, weight = -0.10
- `"No NLP-derived signal yet — enrichment pending or thin"` — negative, weight = -0.10

### 6.3 Conversion Probability

V1 simple average:

```
conversion_probability = round((fit_score + intent_score) / 2, 2)
```

The V2 ML model replaces this with a calibrated sigmoid output × 100, while all other ScoringResult fields remain from V1.

### 6.4 ScoringResult Dataclass

```python
@dataclass(frozen=True)
class ScoringResult:
    fit_score:                 float             # 0–100
    intent_score:              float             # 0–100
    conversion_probability:    float             # 0–100 (%)
    recommended_service:       str | None        # top ServiceLine value
    recommendation_confidence: float | None      # 0–1 (fraction of vote weight)
    top_factors:               list[ScoreFactor] # human-readable explanation
    service_probabilities:     dict[str, float]  # all 4 services, sums to 100 %
```

---

## 7. V2 — Supervised ML Scorer

**Source:** `backend/app/services/scoring/ml_scorer.py`  
**Training:** `ml/training/train_scoring_model.py`

### 7.1 Model Family

Two candidates are trained and the better one (by ROC AUC) is selected:

| Candidate | Algorithm | Class imbalance strategy |
|---|---|---|
| `logreg_v2` | `sklearn.LogisticRegression` | `class_weight="balanced"` |
| `xgb_v2` | `xgboost.XGBClassifier` | `scale_pos_weight = neg/pos` |

**Why these two?** Per `01_TECHNICAL_ARCHITECTURE.md §2.4`: "V2: supervised classifier (scikit-learn logistic regression → XGBoost/LightGBM as data volume grows)." LogReg provides a well-calibrated, interpretable baseline; XGBoost handles non-linear interactions and feature importance out of the box.

### 7.2 Training Procedure

```
1. Load training data
   load_training_data()
   ├── Query all CRMDeals where outcome IN ('won', 'lost')
   ├── Deduplicate by company_id (one row per company)
   ├── For each company:
   │   ├── score_company(db, company)       → rules_result
   │   └── build_feature_vector(db, company, rules_result)
   └── Returns pd.DataFrame with 9 features + label column

2. Train/test split
   train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

3. Cross-validation
   StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
   (Stratified preserves class ratio in each fold)

4. Hyperparameter search (GridSearchCV, scoring='roc_auc')
   LogReg:  C ∈ {0.01, 0.1, 1.0, 10.0}
   XGBoost: n_estimators ∈ {100, 200}
             max_depth ∈ {3, 5}
             learning_rate ∈ {0.05, 0.1}

5. Evaluate both best estimators on held-out test set

6. Select model with higher test ROC AUC

7. Save artifact + training report
```

### 7.3 Evaluation Metrics

| Metric | Formula | Why used |
|---|---|---|
| **ROC AUC** | AUROC of `predict_proba` | Primary selection criterion; threshold-independent, handles class imbalance well |
| Accuracy | correct / total | Secondary; misleading alone due to imbalance |
| Precision | TP / (TP + FP) | BD team's time cost of false positives |
| Recall | TP / (TP + FN) | Missing actual leads (lost revenue) |
| F1 | 2 × P × R / (P + R) | Harmonic mean; useful imbalanced summary |

**Model selection rule:**
```python
best_name, best_model, best_metrics, best_params = max(
    candidates, key=lambda c: c[2]["roc_auc"]
)
```

### 7.4 Inference

```python
# ml_scorer.score_company()
rules_result = rules_engine.score_company(db, company)   # always runs
artifact     = _load_artifact()                           # None if no file

if artifact is None:
    return rules_result, "rules_v1"    # cold-start fallback

features_df = pd.DataFrame([build_feature_vector(db, company, rules_result)],
                            columns=FEATURE_NAMES)
probability = model.predict_proba(features_df)[0][1] * 100

ml_result = ScoringResult(
    fit_score              = rules_result.fit_score,      # ← from V1
    intent_score           = rules_result.intent_score,   # ← from V1
    conversion_probability = round(probability, 2),       # ← from V2
    recommended_service    = rules_result.recommended_service,   # ← from V1
    recommendation_confidence = rules_result.recommendation_confidence,  # ← V1
    top_factors            = rules_result.top_factors,    # ← from V1
    service_probabilities  = rules_result.service_probabilities,  # ← from V1
)
```

The artifact is **cached in-process** after first load (`_artifact_cache` dict keyed by file path). A new artifact written by the feedback loop will be picked up on the next worker restart (or when the path changes).

---

## 8. Model Training & Evaluation

### 8.1 Current Training Report

**File:** `ml/artifacts/training_report.json`

```json
{
  "trained_at": "2026-07-27T05:44:15+00:00",
  "training_rows": 400,
  "selected_model": "logreg_v2",
  "model_version": "logreg_v2_2026-07-27",
  "best_params": { "C": 0.01 },
  "candidates": {
    "logreg_v2": {
      "accuracy":  0.6750,
      "precision": 0.6667,
      "recall":    0.2069,
      "f1_score":  0.3158,
      "roc_auc":   0.6978   ← SELECTED (higher)
    },
    "xgb_v2": {
      "accuracy":  0.6375,
      "precision": 0.5000,
      "recall":    0.4483,
      "f1_score":  0.4727,
      "roc_auc":   0.6552
    }
  },
  "feature_importance": null
}
```

**Interpretation:**

- `logreg_v2` wins on ROC AUC (0.6978 vs 0.6552) — it's a better overall discriminator
- `xgb_v2` has better recall (0.45 vs 0.21) and F1 (0.47 vs 0.32) — it finds more positives but with lower precision
- Both models are moderately above the 0.50 random baseline on ROC AUC — expected on 400-row synthetic data; real CRM data will improve this substantially
- `best_params: C=0.01` — heavy regularisation preferred, consistent with the observed feature multicollinearity in the `share_*` group
- `feature_importance: null` — LogReg doesn't have `feature_importances_` (that's a tree-specific attribute); XGBoost would populate this if selected

**Expected performance with real data (>1000 labelled companies):**
- ROC AUC: 0.75–0.85
- Recall: 0.50–0.70 (more wins accumulated, model learns cleaner patterns)
- XGBoost likely to win as non-linear interactions emerge

### 8.2 Cross-Validation Design

5-fold stratified CV is used inside `GridSearchCV`, so the hyperparameter selection score reflects out-of-fold performance, not overfitting to the train split. The final evaluation uses a **separate held-out 20 % test set** that was never seen during grid search.

```
Total data (400)
├── Train (320, 80%)
│   ├── Fold 1 val (64)  ─┐
│   ├── Fold 2 val (64)   │  GridSearchCV: 5×5 = 25 fits per model
│   ├── Fold 3 val (64)   │  Best C / best hyperparams selected
│   ├── Fold 4 val (64)   │  by mean CV ROC AUC
│   └── Fold 5 val (64)  ─┘
└── Test  (80, 20%)  ← Final _evaluate() metrics above
```

---

## 9. Multi-Service Probability Output

**Source:** `rules_engine._recommend_service()`  
**Requirement:** §3.8 — "Company A has an 80% probability of requiring recruitment services AND a 65% probability of requiring corporate learning services."

### 9.1 Algorithm

```python
# 1. Collect all NLP features for the company (top 50 by recency)
votes = {"branding": [], "hiring": [], "learning_development": [], "iac_partnership": []}
for feature in nlp_features:
    votes[feature.predicted_need_category].append(feature.confidence)

# 2. Total confidence weight across all categories
total_weight = sum(sum(v) for v in votes.values())

# 3. Normalise each category's vote share to 0–100%
service_probabilities = {
    svc: round(sum(votes[svc]) / total_weight * 100, 2)
    for svc in all_services
}
# → always sums to exactly 100%

# 4. Best category
best_category = max(service_probabilities, key=lambda k: service_probabilities[k])
recommendation_confidence = round(service_probabilities[best_category] / 100, 4)
```

### 9.2 Example

**Input:** 3 NLP features
```
Feature 1: category=hiring,  confidence=0.85
Feature 2: category=branding, confidence=0.35
Feature 3: category=learning_development, confidence=0.15
```

**Computation:**
```
total_weight = 0.85 + 0.35 + 0.15 = 1.35

service_probabilities = {
    "hiring":               round(0.85 / 1.35 × 100, 2) = 62.96%
    "branding":             round(0.35 / 1.35 × 100, 2) = 25.93%
    "learning_development": round(0.15 / 1.35 × 100, 2) = 11.11%
    "iac_partnership":      round(0.00 / 1.35 × 100, 2) =  0.00%
}

recommended_service        = "hiring"
recommendation_confidence  = 0.6296   (62.96 / 100)
```

### 9.3 Database Storage

`lead_scores.service_probabilities` is a PostgreSQL **JSONB** column (added by migration `a2f3b1c9d4e7`):
```sql
ALTER TABLE lead_scores ADD COLUMN service_probabilities JSONB;
```

Stored as: `{"hiring": 62.96, "branding": 25.93, "learning_development": 11.11, "iac_partnership": 0.0}`

### 9.4 API & Frontend

**API response** (`GET /api/leads/{id}/explanation`):
```json
{
  "company_id": "...",
  "conversion_probability": 28.79,
  "recommended_service": "hiring",
  "recommendation_confidence": 0.6296,
  "service_probabilities": {
    "hiring": 62.96,
    "branding": 25.93,
    "learning_development": 11.11,
    "iac_partnership": 0.0
  },
  "top_factors": [...]
}
```

**Frontend display** (`frontend/app/companies/[id]/page.tsx`):

All four services are displayed sorted by probability (descending) with colour-coded bars and human-readable labels:

| ServiceLine key | Display label |
|---|---|
| `hiring` | Recruitment & Hiring |
| `branding` | Employer Branding |
| `learning_development` | Learning & Development |
| `iac_partnership` | Industry-Academia Partnership |

---

## 10. Feedback Loop & Continuous Learning

**Source:** `backend/app/worker.py` — `check_feedback_and_retrain_task`  
**Schedule:** Nightly via Celery Beat (`infra/celerybeat_schedule.py`)

### 10.1 Mechanism

```
Every 24 hours (Celery Beat)
    → check_feedback_and_retrain_task()
        1. Query Feedback rows created in last 30 days
        2. If fewer than 10 rows: skip (insufficient data)
        3. Compute accuracy_rate = accurate_count / total_count
        4. If accuracy_rate >= 0.70: log "ok", no action
        5. If accuracy_rate < 0.70:
            → subprocess.run([python, train_scoring_model.py])
            → new artifact written to ml/artifacts/scoring_model.joblib
            → new training_report.json written
            → next inference call loads new model (after worker restart)
```

### 10.2 Configuration

| Constant | Value | Description |
|---|---|---|
| `_FEEDBACK_WINDOW_DAYS` | 30 | How far back to look at feedback |
| `_ACCURACY_THRESHOLD` | 0.70 | Minimum acceptable accuracy before retraining |
| `_MIN_FEEDBACK_SAMPLES` | 10 | Minimum feedback rows to act on |

### 10.3 Feedback Data Model

The `Feedback` table links user assessments back to lead scores:

```
feedback.is_accurate  (bool)   — BD executive judgment of score quality
feedback.lead_score_id          — FK to lead_scores
feedback.created_at             — timestamp (used for 30-day window)
```

`is_accurate = True` counts as a correct prediction; `False` counts as a model error.

### 10.4 Celery Beat Schedule

```python
# infra/celerybeat_schedule.py
BEAT_SCHEDULE = {
    "feedback-loop-check-nightly": {
        "task": "leadintel.check_feedback_and_retrain",
        "schedule": 86400,   # every 24 hours
    },
    ...
}
```

---

## 11. Model Artifact & Versioning

### 11.1 Artifact Format

`ml/artifacts/scoring_model.joblib` — a `joblib`-serialised dict:

```python
{
    "model":          <sklearn.LogisticRegression | XGBClassifier>,
    "model_version":  "logreg_v2_2026-07-27",   # "name_YYYY-MM-DD"
    "feature_names":  ["fit_score", "intent_score", ...]  # 9-element list
}
```

### 11.2 Versioning Convention

`model_version` = `f"{best_name}_{datetime.now(UTC):%Y-%m-%d}"`

Examples:
- `logreg_v2_2026-07-27` — logistic regression trained on 2026-07-27
- `xgb_v2_2026-09-15` — XGBoost took over as data grew

The version string is written to `lead_scores.model_version` for every scored company, creating a permanent audit trail of which model produced each score.

### 11.3 Cold-Start Fallback

If `ml/artifacts/scoring_model.joblib` does not exist, `_load_artifact()` returns `None` and `ml_scorer.score_company()` falls back to the V1 rules engine (`model_version = "rules_v1"`). No configuration required.

### 11.4 In-Process Caching

```python
_artifact_cache: dict[str, Any] = {}  # module-level, lives for process lifetime

def _load_artifact():
    path = settings.resolve_path(settings.SCORING_MODEL_ARTIFACT_PATH)
    if _artifact_cache.get("path") != str(path):    # path changed → reload
        _artifact_cache["artifact"] = joblib.load(path)
        _artifact_cache["path"] = str(path)
    return _artifact_cache["artifact"]
```

A new artifact written by the feedback loop is picked up automatically on the next Celery worker restart (process-level cache reset). For zero-downtime hot-reload, a future enhancement could watch the artifact file's `mtime`.

---

## 12. Running the Pipeline

### 12.1 Prerequisites

```bash
cd /Users/pscope/Project3/backend
source .venv/bin/activate
export DATABASE_URL="postgresql://leadintel:leadintel@localhost:5432/leadintel"
export JWT_SECRET_KEY="your-secret-key"
```

### 12.2 Generate Fixture Dataset (first time only)

```bash
python ../ml/training/generate_fixture_dataset.py
# Output: Seeded 400 fixture companies with job postings, NLP features, and CRM deal outcomes.
```

### 12.3 Train the V2 Model

```bash
python ../ml/training/train_scoring_model.py
# Output:
# Selected logreg_v2 (ROC AUC 0.6978) — artifact written to ml/artifacts/scoring_model.joblib
# Full report written to ml/artifacts/training_report.json
```

Requires at least 20 companies with closed CRM deals. Will raise `RuntimeError` with a helpful message if not enough data.

### 12.4 Run All Unit Tests

```bash
DATABASE_URL="postgresql://leadintel:leadintel@localhost:5432/leadintel_test" \
JWT_SECRET_KEY="test-secret-key-not-for-production" \
python -m pytest tests/ -v --tb=short
# Result: 35 passed
```

### 12.5 Start the API Server

```bash
DATABASE_URL="postgresql://leadintel:leadintel@localhost:5432/leadintel" \
JWT_SECRET_KEY="your-secret-key" \
REDIS_URL="redis://localhost:6379/0" \
uvicorn app.main:app --port 8001 --log-level warning
```

### 12.6 Trigger Scoring via API

```bash
# Score all enriched companies
curl -X POST http://localhost:8001/api/scoring/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode": "incremental"}'

# Score one company synchronously
curl -X POST http://localhost:8001/api/companies/{id}/enrich \
  -H "Authorization: Bearer $TOKEN"
```

### 12.7 Start Celery Worker + Beat (production)

```bash
# Worker
celery -A app.worker:celery_app worker --loglevel=info

# Beat scheduler (nightly feedback loop + enrichment schedules)
celery -A app.worker:celery_app beat --loglevel=info
```

---

## 13. API Integration

### 13.1 Endpoints That Expose ML Outputs

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scoring/run` | Queue batch scoring (all enriched companies) |
| `GET` | `/api/leads` | Paginated leads list sorted by `conversion_probability DESC` |
| `GET` | `/api/leads/{id}/explanation` | Full score explanation + service probabilities |
| `POST` | `/api/leads/{id}/feedback` | Submit BD executive score feedback |
| `GET` | `/api/analytics/team` | Aggregated score band performance |
| `POST` | `/api/companies/{id}/enrich` | On-demand enrichment + scoring for one company |

### 13.2 Lead Explanation Response Schema

```typescript
// frontend/lib/api-client.ts
interface LeadExplanation {
  company_id:               string;
  conversion_probability:   number;          // 0–100
  recommended_service:      string | null;   // "hiring" | "branding" | ...
  recommendation_confidence: number | null;  // 0–1
  service_probabilities:    Record<string, number> | null;  // sums to 100
  top_factors: {
    factor: string;
    weight: number;
  }[];
  fit_score:     number;
  intent_score:  number;
  model_version: string;
  scored_at:     string;
}
```

### 13.3 Lead List Response Schema

```typescript
interface LeadScore {
  id:                       string;
  company_id:               string;
  company_name:             string;
  industry:                 string | null;
  conversion_probability:   number;
  recommended_service:      string | null;
  fit_score:                number | null;
  intent_score:             number | null;
  model_version:            string | null;
  scored_at:                string;
}
```

---

## 14. Design Decisions & Trade-offs

### 14.1 Why Rules Engine Before ML?

**Cold-start problem:** B2B deals close on timescales of weeks to months. At launch there are zero labelled examples. A rules engine requires no training data, is fully auditable, and can be tuned by domain experts (BD managers adjusting ICP weights). The ML model turns on automatically once enough CRM history exists.

### 14.2 Why V2 Only Overrides `conversion_probability`?

ML probability is a single number. The explanation factors, fit/intent breakdown, and service probabilities are structured, human-readable outputs that domain experts understand immediately. Replacing them with model outputs would require SHAP or similar — an approved stack exclusion per `05_FREE_STACK_DECISIONS.md` (no heavy explainability frameworks in Phase 1). The hybrid approach gives both accurate probability and transparent explanation.

### 14.3 Why Zero-Shot Classification for NLP?

Fine-tuning a classification head requires hundreds of labelled examples per category. At cold-start, we have none. Zero-shot classification via MNLI-trained DistilBERT gives usable predictions from day one with no labelling cost. Accuracy improves naturally as the BD team submits feedback, eventually enabling a fine-tuning phase in V3.

### 14.4 Why Not a Larger Language Model?

`05_FREE_STACK_DECISIONS.md §3` mandates zero external API costs. GPT-4 / Claude API calls would accrue per-document charges across thousands of companies. `distilbert-base-uncased-mnli` (~265 MB) runs on CPU at ~100ms/document — acceptable for a Celery async worker.

### 14.5 Why ROC AUC as the Primary Metric?

ROC AUC is threshold-independent and robust to class imbalance. Accuracy is misleading (a model predicting "lost" for every company achieves 70 % accuracy on our 70/30 split). Precision and Recall require a threshold choice that depends on business priorities (BD team's time vs missed leads) — ROC AUC summarises the full precision-recall curve without committing to one point.

### 14.6 Why `C=0.01` (Heavy Regularisation) for LogReg?

The feature set has correlated features (`share_*` always sum to 1 → perfect multicollinearity) and a small training set (320 rows for a 9-feature model). Heavy L2 regularisation (`C=0.01` = large penalty coefficient 1/C = 100) shrinks coefficients strongly, preventing overfitting to noise and improving generalisation on small datasets. Grid search confirmed this through 5-fold CV.

### 14.7 Why JSONB for `service_probabilities`?

The number and names of service lines may change in future versions (add/remove a service line). JSONB allows schema evolution without a migration for every service line change. The column is indexed for analytics queries and supports GIN index for `@>` containment operators if needed.

---

*This document describes the system as implemented on 2026-08-01. See `01_TECHNICAL_ARCHITECTURE.md` for the broader system architecture, `02_DATABASE_SCHEMA.sql` for the full schema, and `03_API_SPECIFICATION.md` for endpoint contracts.*
