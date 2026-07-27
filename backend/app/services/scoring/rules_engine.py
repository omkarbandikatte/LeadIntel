from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.enums import ServiceLine
from app.models.lead_score import LeadScore
from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument

MODEL_VERSION = "rules_v1"

# Configurable ICP weight tables — point-based and transparent, per
# 01_TECHNICAL_ARCHITECTURE.md §2.4 ("V1 cold-start: rules-based scorer, no
# model training required"). Tune these as real historical win/loss data
# comes in via crm_deals.
INDUSTRY_ICP_WEIGHTS: dict[str, float] = {
    "saas": 100.0,
    "information technology": 95.0,
    "it services": 95.0,
    "fintech": 90.0,
    "financial services": 85.0,
    "e-commerce": 80.0,
    "education": 70.0,
    "healthcare": 65.0,
    "manufacturing": 60.0,
    "retail": 55.0,
}
_DEFAULT_INDUSTRY_SCORE = 50.0

EMPLOYEE_BAND_ICP_WEIGHTS: dict[str, float] = {
    "51-200": 100.0,  # strongest historical ICP segment
    "11-50": 80.0,
    "201-1000": 70.0,
    "1000+": 45.0,
    "1-10": 40.0,
}
_DEFAULT_EMPLOYEE_BAND_SCORE = 50.0

REVENUE_BAND_ICP_WEIGHTS: dict[str, float] = {
    "10cr-50cr": 100.0,
    "50cr-250cr": 85.0,
    "1cr-10cr": 70.0,
    "250cr+": 55.0,
    "<1cr": 35.0,
}
_DEFAULT_REVENUE_SCORE = 50.0

JOB_POSTING_LOOKBACK_DAYS = 14
PRESS_LOOKBACK_DAYS = 30
_NLP_FEATURE_SAMPLE_SIZE = 50


@dataclass(frozen=True)
class ScoreFactor:
    factor: str
    weight: float


@dataclass(frozen=True)
class ScoringResult:
    fit_score: float
    intent_score: float
    conversion_probability: float
    recommended_service: str | None
    recommendation_confidence: float | None
    top_factors: list[ScoreFactor]


def _industry_score(industry: str | None) -> tuple[float, ScoreFactor | None]:
    if not industry:
        return _DEFAULT_INDUSTRY_SCORE, None
    score = INDUSTRY_ICP_WEIGHTS.get(industry.strip().lower(), _DEFAULT_INDUSTRY_SCORE)
    factor = None
    if score >= 85:
        factor = ScoreFactor(f"Industry '{industry}' is a strong ICP fit", round(score / 100 * 0.3, 2))
    return score, factor


def _employee_band_score(band: str | None) -> tuple[float, ScoreFactor | None]:
    if not band:
        return _DEFAULT_EMPLOYEE_BAND_SCORE, None
    score = EMPLOYEE_BAND_ICP_WEIGHTS.get(band, _DEFAULT_EMPLOYEE_BAND_SCORE)
    factor = None
    if score >= 90:
        factor = ScoreFactor(f"Employee band {band} matches strongest historical ICP segment", 0.28)
    return score, factor


def _revenue_score(band: str | None) -> float:
    if not band:
        return _DEFAULT_REVENUE_SCORE
    return REVENUE_BAND_ICP_WEIGHTS.get(band, _DEFAULT_REVENUE_SCORE)


def _location_score(country: str | None) -> float:
    return 100.0 if country and country.strip().lower() == "india" else 40.0


def _fit_score(company: Company) -> tuple[float, list[ScoreFactor]]:
    industry_score, industry_factor = _industry_score(company.industry)
    band_score, band_factor = _employee_band_score(company.employee_count_band)
    revenue_score = _revenue_score(company.revenue_band)
    location_score = _location_score(company.location_country)

    fit = 0.35 * industry_score + 0.35 * band_score + 0.20 * revenue_score + 0.10 * location_score

    factors = [f for f in (industry_factor, band_factor) if f is not None]
    return round(fit, 2), factors


def _intent_score(db: Session, company: Company) -> tuple[float, list[ScoreFactor]]:
    now = datetime.now(UTC)
    factors: list[ScoreFactor] = []

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
    job_points = min(job_count * 15.0, 60.0)
    if job_count > 0:
        factors.append(
            ScoreFactor(
                f"{job_count} open role(s) posted in last {JOB_POSTING_LOOKBACK_DAYS} days",
                round(job_points / 100, 2),
            )
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
    press_points = 20.0 if has_press else 0.0
    if has_press:
        factors.append(
            ScoreFactor(f"Recent funding/press mention detected in last {PRESS_LOOKBACK_DAYS} days", 0.20)
        )

    nlp_features = (
        db.query(NLPFeature)
        .filter(NLPFeature.company_id == company.id)
        .order_by(NLPFeature.processed_at.desc())
        .limit(_NLP_FEATURE_SAMPLE_SIZE)
        .all()
    )
    nlp_points = 0.0
    if nlp_features:
        avg_confidence = sum(float(f.confidence or 0) for f in nlp_features) / len(nlp_features)
        nlp_points = avg_confidence * 20.0

        branding_docs = any(f.predicted_need_category == ServiceLine.BRANDING.value for f in nlp_features)
        if not branding_docs:
            factors.append(ScoreFactor("No recent branding-related content on company site", -0.10))
    else:
        factors.append(ScoreFactor("No NLP-derived signal yet — enrichment pending or thin", -0.10))

    intent = min(job_points + press_points + nlp_points, 100.0)
    return round(intent, 2), factors


def _recommend_service(db: Session, company: Company) -> tuple[str | None, float | None]:
    nlp_features = db.query(NLPFeature).filter(NLPFeature.company_id == company.id).all()
    votes: dict[str, list[float]] = {}
    for feature in nlp_features:
        if feature.predicted_need_category:
            votes.setdefault(feature.predicted_need_category, []).append(float(feature.confidence or 0))

    if not votes:
        return None, None

    best_category = max(votes, key=lambda key: sum(votes[key]))
    confidences = votes[best_category]
    return best_category, round(sum(confidences) / len(confidences), 4)


def score_company(db: Session, company: Company) -> ScoringResult:
    """Transparent point-based scorer — V1, per 01_TECHNICAL_ARCHITECTURE.md §2.4.

    Every score returns its top contributing factors — explainability-first
    is a hard requirement for BD trust and adoption (§5).
    """
    fit_score, fit_factors = _fit_score(company)
    intent_score, intent_factors = _intent_score(db, company)
    conversion_probability = round((fit_score + intent_score) / 2, 2)
    recommended_service, recommendation_confidence = _recommend_service(db, company)

    top_factors = sorted(fit_factors + intent_factors, key=lambda f: abs(f.weight), reverse=True)[:5]

    return ScoringResult(
        fit_score=fit_score,
        intent_score=intent_score,
        conversion_probability=conversion_probability,
        recommended_service=recommended_service,
        recommendation_confidence=recommendation_confidence,
        top_factors=top_factors,
    )


def persist_score(
    db: Session, company: Company, result: ScoringResult, *, model_version: str = MODEL_VERSION
) -> LeadScore:
    lead_score = LeadScore(
        company_id=company.id,
        fit_score=result.fit_score,
        intent_score=result.intent_score,
        conversion_probability=result.conversion_probability,
        recommended_service=result.recommended_service,
        recommendation_confidence=result.recommendation_confidence,
        top_factors=[{"factor": f.factor, "weight": f.weight} for f in result.top_factors],
        model_version=model_version,
    )
    db.add(lead_score)
    db.commit()
    db.refresh(lead_score)
    return lead_score
