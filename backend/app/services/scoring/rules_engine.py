from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.crm_deal import CRMDeal
from app.models.enums import ServiceLine, SignalDirection
from app.models.lead_score import LeadScore
from app.models.nlp_feature import NLPFeature
from app.models.raw_document import RawDocument
from app.models.signal import Signal

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

# Time-decay window: signals older than this contribute ~nothing to intent
# (an exponential decay never reaches exactly zero, so a window still bounds
# the query instead of scanning the entire history table every score).
SIGNAL_DECAY_WINDOW_DAYS = 45
JOB_POSTING_DECAY_HALF_LIFE_DAYS = 10.0
PRESS_DECAY_HALF_LIFE_DAYS = 15.0
BUSINESS_SIGNAL_DECAY_HALF_LIFE_DAYS = 12.0

# Intent-trend comparison window — "recent" vs "prior" buying-signal velocity.
INTENT_TREND_WINDOW_DAYS = 14

# Opportunity Score weights — must sum to 1.0 before the negative-signal
# penalty is subtracted. Transparent/point-based, same philosophy as the
# fit/intent weights above.
OPPORTUNITY_WEIGHT_FIT = 0.30
OPPORTUNITY_WEIGHT_INTENT = 0.30
OPPORTUNITY_WEIGHT_ENGAGEMENT = 0.20
OPPORTUNITY_WEIGHT_SIGNAL = 0.20

POSITIVE_SIGNAL_SCORE_CAP = 100.0
POSITIVE_SIGNAL_POINTS_PER_CONFIDENCE = 25.0
NEGATIVE_SIGNAL_PENALTY_CAP = 40.0
NEGATIVE_SIGNAL_POINTS_PER_CONFIDENCE = 30.0

# CRM deal-stage progression used as the Engagement Score proxy, since this
# project's CRM sync (05_FREE_STACK_DECISIONS.md §6) only carries deal
# outcomes/stages via CSV, not a dedicated activity/touchpoint log.
DEAL_STAGE_ENGAGEMENT_WEIGHTS: dict[str, float] = {
    "prospecting": 20.0,
    "contacted": 40.0,
    "qualified": 60.0,
    "proposal": 80.0,
    "negotiation": 90.0,
    "closed_won": 100.0,
    "closed_lost": 100.0,  # a closed-lost deal still proves real engagement happened
}
_DEFAULT_DEAL_STAGE_SCORE = 30.0


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
    service_probabilities: dict[str, float]
    opportunity_score: float = 0.0
    engagement_score: float = 0.0
    intent_trend: str = "stable"
    why_now: str | None = None
    evidence: list[str] = field(default_factory=list)


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


def _decay_weight(age_days: float, half_life_days: float) -> float:
    """Exponential recency decay: 1.0 at age 0, 0.5 at one half-life, etc.

    Replaces the old hard "in-window / out-of-window" cliff — a signal from
    yesterday now carries more weight than one from two weeks ago even if
    both fall inside the same lookback window.
    """
    if age_days <= 0:
        return 1.0
    return 0.5 ** (age_days / half_life_days)


def _intent_score(
    db: Session, company: Company, nlp_features: list, signals: list[Signal]
) -> tuple[float, list[ScoreFactor]]:
    now = datetime.now(UTC)
    factors: list[ScoreFactor] = []

    decay_cutoff = now - timedelta(days=SIGNAL_DECAY_WINDOW_DAYS)
    job_postings = (
        db.query(RawDocument.scraped_at)
        .filter(
            RawDocument.company_id == company.id,
            RawDocument.doc_type == "job_posting",
            RawDocument.scraped_at >= decay_cutoff,
        )
        .all()
    )
    job_points = min(
        sum(
            15.0 * _decay_weight((now - scraped_at).total_seconds() / 86400, JOB_POSTING_DECAY_HALF_LIFE_DAYS)
            for (scraped_at,) in job_postings
        ),
        60.0,
    )
    if job_postings:
        factors.append(
            ScoreFactor(
                f"{len(job_postings)} open role(s) posted in last {SIGNAL_DECAY_WINDOW_DAYS} days "
                "(recency-weighted)",
                round(job_points / 100, 2),
            )
        )

    press_docs = (
        db.query(RawDocument.scraped_at)
        .filter(
            RawDocument.company_id == company.id,
            RawDocument.doc_type == "press_release",
            RawDocument.scraped_at >= decay_cutoff,
        )
        .all()
    )
    press_points = 0.0
    if press_docs:
        most_recent_age_days = min((now - scraped_at).total_seconds() / 86400 for (scraped_at,) in press_docs)
        press_points = 20.0 * _decay_weight(most_recent_age_days, PRESS_DECAY_HALF_LIFE_DAYS)
        factors.append(
            ScoreFactor(
                f"Recent funding/press mention detected in last {SIGNAL_DECAY_WINDOW_DAYS} days "
                "(recency-weighted)",
                round(press_points / 100, 2),
            )
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

    positive_signal_points, _, positive_factor = _positive_signal_score(now, signals)
    if positive_factor is not None:
        factors.append(positive_factor)

    intent = min(job_points + press_points + nlp_points + positive_signal_points, 100.0)
    return round(intent, 2), factors


def _intent_trend(db: Session, company: Company) -> str:
    """Compare recent vs. prior buying-signal velocity (job postings + press + signals).

    A cheap, explainable proxy for "is intent increasing or decreasing" —
    counts raw signal-bearing documents in two equal adjacent windows rather
    than re-running the full decayed intent formula at a past reference time.
    """
    now = datetime.now(UTC)
    recent_cutoff = now - timedelta(days=INTENT_TREND_WINDOW_DAYS)
    prior_cutoff = now - timedelta(days=2 * INTENT_TREND_WINDOW_DAYS)

    signal_doc_types = ("job_posting", "press_release", "news_mention")

    recent_count = (
        db.query(func.count(RawDocument.id))
        .filter(
            RawDocument.company_id == company.id,
            RawDocument.doc_type.in_(signal_doc_types),
            RawDocument.scraped_at >= recent_cutoff,
        )
        .scalar()
        or 0
    )
    prior_count = (
        db.query(func.count(RawDocument.id))
        .filter(
            RawDocument.company_id == company.id,
            RawDocument.doc_type.in_(signal_doc_types),
            RawDocument.scraped_at >= prior_cutoff,
            RawDocument.scraped_at < recent_cutoff,
        )
        .scalar()
        or 0
    )

    if recent_count > prior_count:
        return "increasing"
    if recent_count < prior_count:
        return "decreasing"
    return "stable"


def _engagement_score(db: Session, company: Company) -> tuple[float, list[ScoreFactor]]:
    """Engagement Score proxy — how far the company has progressed in the CRM pipeline.

    There is no dedicated activity/touchpoint log in this project's CRM sync
    (05_FREE_STACK_DECISIONS.md §6, CSV push/pull only) so deal-stage
    progression is used as the best available signal of real engagement: a
    company with an open "negotiation" deal is more engaged than one that has
    never entered the pipeline.
    """
    deals = db.query(CRMDeal).filter(CRMDeal.company_id == company.id).all()
    if not deals:
        return 0.0, []

    best_deal = max(
        deals,
        key=lambda d: DEAL_STAGE_ENGAGEMENT_WEIGHTS.get((d.deal_stage or "").strip().lower(), _DEFAULT_DEAL_STAGE_SCORE),
    )
    best_stage = (best_deal.deal_stage or "").strip().lower()
    score = DEAL_STAGE_ENGAGEMENT_WEIGHTS.get(best_stage, _DEFAULT_DEAL_STAGE_SCORE)

    factors: list[ScoreFactor] = []
    if score >= 60:
        factors.append(
            ScoreFactor(f"Active CRM engagement at '{best_deal.deal_stage}' stage", round(score / 100 * 0.15, 2))
        )
    return round(score, 2), factors


def _positive_signal_score(now: datetime, signals: list[Signal]) -> tuple[float, str | None, ScoreFactor | None]:
    """Decay-weighted sum of positive Business Signal Engine detections, capped at 20 intent points."""
    positive = [s for s in signals if s.direction == SignalDirection.POSITIVE.value]
    if not positive:
        return 0.0, None, None

    weighted_total = sum(
        float(s.confidence or 0) * _decay_weight((now - s.detected_at).total_seconds() / 86400, BUSINESS_SIGNAL_DECAY_HALF_LIFE_DAYS)
        for s in positive
    )
    points = min(weighted_total * 20.0, 20.0)
    newest = max(positive, key=lambda s: s.detected_at)
    factor = ScoreFactor(
        f"Positive signal detected: {newest.signal_type.replace('_', ' ')}", round(points / 100, 2)
    )
    return points, newest.signal_type, factor


def _negative_signal_penalty(now: datetime, signals: list[Signal]) -> tuple[float, ScoreFactor | None]:
    """Decay-weighted sum of negative Business Signal Engine detections, capped."""
    negative = [s for s in signals if s.direction == SignalDirection.NEGATIVE.value]
    if not negative:
        return 0.0, None

    weighted_total = sum(
        float(s.confidence or 0) * _decay_weight((now - s.detected_at).total_seconds() / 86400, BUSINESS_SIGNAL_DECAY_HALF_LIFE_DAYS)
        for s in negative
    )
    penalty = min(weighted_total * NEGATIVE_SIGNAL_POINTS_PER_CONFIDENCE, NEGATIVE_SIGNAL_PENALTY_CAP)
    newest = max(negative, key=lambda s: s.detected_at)
    factor = ScoreFactor(
        f"Negative signal detected: {newest.signal_type.replace('_', ' ')}", -round(penalty / 100, 2)
    )
    return penalty, factor


def _opportunity_score(
    fit_score: float,
    intent_score: float,
    engagement_score: float,
    now: datetime,
    signals: list[Signal],
) -> tuple[float, str | None, list[str], list[ScoreFactor]]:
    """Composite Opportunity Score: Fit + Intent + Engagement + signal recency/confidence,
    net of a negative-signal penalty — per the "move beyond Fit/Intent scores" roadmap.
    """
    factors: list[ScoreFactor] = []

    positive_points, _, _ = _positive_signal_score(now, signals)
    # The positive-signal factor is already added by _intent_score (which uses
    # the same _positive_signal_score call) — only the negative penalty is
    # unique to the opportunity score, so only that gets its own factor here
    # to avoid the same "Positive signal detected: ..." line appearing twice
    # in top_factors.
    signal_score = min(positive_points / 20.0 * 100.0, POSITIVE_SIGNAL_SCORE_CAP)
    negative_penalty, negative_factor = _negative_signal_penalty(now, signals)

    if negative_factor is not None:
        factors.append(negative_factor)

    raw_score = (
        OPPORTUNITY_WEIGHT_FIT * fit_score
        + OPPORTUNITY_WEIGHT_INTENT * intent_score
        + OPPORTUNITY_WEIGHT_ENGAGEMENT * engagement_score
        + OPPORTUNITY_WEIGHT_SIGNAL * signal_score
        - negative_penalty
    )
    opportunity_score = round(max(0.0, min(raw_score, 100.0)), 2)

    why_now: str | None = None
    evidence: list[str] = []
    if signals:
        recent_signals = sorted(signals, key=lambda s: s.detected_at, reverse=True)[:5]
        newest = recent_signals[0]
        age_days = max(0, int((now - newest.detected_at).total_seconds() // 86400))
        age_text = "today" if age_days == 0 else f"{age_days} day(s) ago"
        why_now = (
            f"A {newest.direction} '{newest.signal_type.replace('_', ' ')}' signal was detected {age_text} "
            f"— this is why the company surfaced now rather than last week."
        )
        evidence = [
            f"[{s.detected_at:%Y-%m-%d}] {s.signal_type.replace('_', ' ').title()} "
            f"({s.direction}, {round(float(s.confidence or 0) * 100)}% confidence): {s.headline or 'no excerpt available'}"
            for s in recent_signals
        ]

    return opportunity_score, why_now, evidence, factors


def _recommend_service(
    nlp_features: list,
) -> tuple[str | None, float | None, dict[str, float]]:
    """Return the top recommended service, its confidence, and probabilities for
    all four service lines (normalised to sum to 100 %).

    Per requirement §3.8: the system must output multi-service probabilities,
    e.g. "80 % probability of requiring recruitment services AND 65 % probability
    of requiring corporate learning services."
    """
    all_services = [v.value for v in ServiceLine]
    votes: dict[str, list[float]] = {svc: [] for svc in all_services}

    for feature in nlp_features:
        if feature.predicted_need_category and feature.predicted_need_category in votes:
            votes[feature.predicted_need_category].append(float(feature.confidence or 0))

    total_weight = sum(sum(v) for v in votes.values())

    if total_weight == 0:
        return None, None, {}

    # Weighted vote share normalised to 0-100 %
    service_probabilities: dict[str, float] = {
        svc: round(sum(votes[svc]) / total_weight * 100, 2) for svc in all_services
    }

    best_category = max(service_probabilities, key=lambda k: service_probabilities[k])
    # Express confidence as the normalised probability of the top service (0-1
    # scale so it stays consistent with the stored recommendation_confidence
    # Numeric(5,4) column and with how the frontend formats it as a percentage).
    recommendation_confidence = round(service_probabilities[best_category] / 100, 4)

    return best_category, recommendation_confidence, service_probabilities


def score_company(db: Session, company: Company) -> ScoringResult:
    """Transparent point-based scorer — V1, per 01_TECHNICAL_ARCHITECTURE.md §2.4.

    Every score returns its top contributing factors — explainability-first
    is a hard requirement for BD trust and adoption (§5).
    """
    now = datetime.now(UTC)
    decay_cutoff = now - timedelta(days=SIGNAL_DECAY_WINDOW_DAYS)

    # Fetch NLP features once — reused by both _intent_score and _recommend_service
    # to avoid two separate table scans for the same company in the same call.
    nlp_features = (
        db.query(NLPFeature)
        .filter(NLPFeature.company_id == company.id)
        .order_by(NLPFeature.processed_at.desc())
        .limit(_NLP_FEATURE_SAMPLE_SIZE)
        .all()
    )
    signals = (
        db.query(Signal)
        .filter(Signal.company_id == company.id, Signal.detected_at >= decay_cutoff)
        .order_by(Signal.detected_at.desc())
        .all()
    )

    fit_score, fit_factors = _fit_score(company)
    intent_score, intent_factors = _intent_score(db, company, nlp_features, signals)
    engagement_score, engagement_factors = _engagement_score(db, company)
    intent_trend = _intent_trend(db, company)
    opportunity_score, why_now, evidence, opportunity_factors = _opportunity_score(
        fit_score, intent_score, engagement_score, now, signals
    )
    conversion_probability = round((fit_score + intent_score) / 2, 2)
    recommended_service, recommendation_confidence, service_probabilities = _recommend_service(nlp_features)

    top_factors = sorted(
        fit_factors + intent_factors + engagement_factors + opportunity_factors,
        key=lambda f: abs(f.weight),
        reverse=True,
    )[:5]

    return ScoringResult(
        fit_score=fit_score,
        intent_score=intent_score,
        conversion_probability=conversion_probability,
        recommended_service=recommended_service,
        recommendation_confidence=recommendation_confidence,
        top_factors=top_factors,
        service_probabilities=service_probabilities,
        opportunity_score=opportunity_score,
        engagement_score=engagement_score,
        intent_trend=intent_trend,
        why_now=why_now,
        evidence=evidence,
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
        service_probabilities=result.service_probabilities if result.service_probabilities else None,
        opportunity_score=result.opportunity_score,
        engagement_score=result.engagement_score,
        intent_trend=result.intent_trend,
        model_version=model_version,
    )
    db.add(lead_score)
    db.commit()
    db.refresh(lead_score)
    return lead_score
