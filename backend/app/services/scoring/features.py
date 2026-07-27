from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.enums import ServiceLine
from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument
from app.services.scoring.rules_engine import (
    JOB_POSTING_LOOKBACK_DAYS,
    PRESS_LOOKBACK_DAYS,
    ScoringResult,
)

# Shared feature ordering between ml/training/train_scoring_model.py and
# app/services/scoring/ml_scorer.py — must stay in sync, since the trained
# artifact is a plain sklearn/XGBoost estimator with no named-column input.
FEATURE_NAMES: list[str] = [
    "fit_score",
    "intent_score",
    "job_posting_count_14d",
    "has_press_30d",
    "avg_nlp_confidence",
    "share_branding",
    "share_hiring",
    "share_learning_development",
    "share_iac_partnership",
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

    category_counts = {line.value: 0 for line in ServiceLine}
    for feature in nlp_features:
        if feature.predicted_need_category in category_counts:
            category_counts[feature.predicted_need_category] += 1
    total_categorized = sum(category_counts.values()) or 1

    return {
        "fit_score": rules_result.fit_score,
        "intent_score": rules_result.intent_score,
        "job_posting_count_14d": float(job_count),
        "has_press_30d": 1.0 if has_press else 0.0,
        "avg_nlp_confidence": avg_confidence,
        "share_branding": category_counts[ServiceLine.BRANDING.value] / total_categorized,
        "share_hiring": category_counts[ServiceLine.HIRING.value] / total_categorized,
        "share_learning_development": category_counts[ServiceLine.LEARNING_DEVELOPMENT.value]
        / total_categorized,
        "share_iac_partnership": category_counts[ServiceLine.IAC_PARTNERSHIP.value] / total_categorized,
    }
