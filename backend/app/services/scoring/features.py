from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument
from app.services import tenancy
from app.services.scoring.rules_engine import (
    JOB_POSTING_LOOKBACK_DAYS,
    PRESS_LOOKBACK_DAYS,
    ScoringResult,
)

# Shared feature ordering between ml/training/train_scoring_model.py and
# app/services/scoring/ml_scorer.py — must stay in sync, since the trained
# artifact is a plain sklearn/XGBoost estimator with no named-column input.
#
# share_branding/share_hiring/share_learning_development/share_iac_partnership
# (one column per Cloud Counselage service line) were replaced 2026-10-06 with
# 4 positional "service_share_slot_N" columns so the same fixed-length vector
# works for any organization's own service catalog: slot N holds the share of
# the company's classified NLP features that match the org's Nth active
# service_offering (ordered by creation), not a column tied to a specific
# hardcoded service name. (An earlier attempt collapsed this into a single
# "top_service_share"/"service_diversity" pair, but that threw away *which*
# category matched — the actual learnable signal — leaving only how
# concentrated/diverse the match was, which is close to constant across
# companies and dropped ROC AUC from 0.68 to ~0.46. Positional slots restore
# the original one-hot-like signal without hardcoding service names.)
_N_SERVICE_SLOTS = 4

FEATURE_NAMES: list[str] = [
    "fit_score",
    "intent_score",
    "job_posting_count_14d",
    "has_press_30d",
    "avg_nlp_confidence",
    *[f"service_share_slot_{i}" for i in range(_N_SERVICE_SLOTS)],
]


def build_feature_vector(db: Session, company: Company, rules_result: ScoringResult) -> dict[str, float]:
    """Build the ML feature vector for one company.

    Reuses the already-computed rules-engine result for fit/intent scores
    rather than recomputing them, since callers (ml_scorer) already have it.
    """
    now = datetime.now(UTC)

    job_cutoff = now - timedelta(days=JOB_POSTING_LOOKBACK_DAYS)
    job_count = (
        db.query(func.count(RawDocument.id))
        .filter(
            RawDocument.company_id == company.id,
            RawDocument.doc_type == "job_posting",
            RawDocument.scraped_at >= job_cutoff,
        )
        .scalar()
        or 0
    )

    press_cutoff = now - timedelta(days=PRESS_LOOKBACK_DAYS)
    has_press = (
        db.query(RawDocument.id)
        .filter(
            RawDocument.company_id == company.id,
            RawDocument.doc_type == "press_release",
            RawDocument.scraped_at >= press_cutoff,
        )
        .first()
        is not None
    )

    nlp_features = db.query(NLPFeature).filter(NLPFeature.company_id == company.id).all()
    avg_confidence = (
        sum(float(f.confidence or 0) for f in nlp_features) / len(nlp_features) if nlp_features else 0.0
    )

    service_keys = [key for key, _ in tenancy.get_service_offerings(company)]
    category_counts = {key: 0 for key in service_keys}
    for feature in nlp_features:
        if feature.predicted_need_category in category_counts:
            category_counts[feature.predicted_need_category] += 1
    total_categorized = sum(category_counts.values())

    # Fold any services beyond _N_SERVICE_SLOTS into the last slot rather than
    # dropping them, so an org with a larger catalog doesn't silently lose signal.
    slot_counts = [0.0] * _N_SERVICE_SLOTS
    for i, key in enumerate(service_keys):
        slot_index = min(i, _N_SERVICE_SLOTS - 1)
        slot_counts[slot_index] += category_counts[key]
    slot_shares = (
        [count / total_categorized for count in slot_counts]
        if total_categorized
        else [0.0] * _N_SERVICE_SLOTS
    )

    vector = {
        "fit_score": rules_result.fit_score,
        "intent_score": rules_result.intent_score,
        "job_posting_count_14d": float(job_count),
        "has_press_30d": 1.0 if has_press else 0.0,
        "avg_nlp_confidence": avg_confidence,
    }
    for i, share in enumerate(slot_shares):
        vector[f"service_share_slot_{i}"] = share
    return vector
