import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_manager_or_admin
from app.db.session import get_db
from app.models.company import Company
from app.models.crm_deal import CRMDeal
from app.models.feedback import Feedback
from app.models.lead_score import LeadScore
from app.models.user import User
from app.schemas.analytics import (
    DealPipeline,
    EnrichmentBreakdown,
    ExtendedAnalyticsResponse,
    FeedbackSummary,
    IndustryPerformance,
    ModelAccuracyPoint,
    ScoreBandPerformance,
    ScoreBucket,
    ScoringActivityPoint,
    ServicePerformance,
    TeamAnalyticsResponse,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_SCORE_BANDS: list[tuple[str, float, float]] = [
    ("80-100", 80.0, 100.0),
    ("60-79", 60.0, 79.999),
    ("0-59", 0.0, 59.999),
]


def _latest_score_by_company(db: Session) -> dict[uuid.UUID, LeadScore]:
    scores = db.query(LeadScore).order_by(LeadScore.company_id, LeadScore.scored_at.desc()).all()
    latest: dict[uuid.UUID, LeadScore] = {}
    for score in scores:
        if score.company_id is not None and score.company_id not in latest:
            latest[score.company_id] = score
    return latest


@router.get("/team", response_model=TeamAnalyticsResponse)
def get_team_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_manager_or_admin),
) -> TeamAnalyticsResponse:
    """Manager analytics view per 03_API_SPECIFICATION.md.

    Every figure here is computed live from lead_scores/crm_deals — there is
    no synthetic or hardcoded reporting data.
    """
    latest_scores = _latest_score_by_company(db)
    total_leads_scored = len(latest_scores)

    closed_deals = db.query(CRMDeal).filter(CRMDeal.outcome.in_(["won", "lost"])).all()
    deals_by_company: dict[uuid.UUID, list[CRMDeal]] = defaultdict(list)
    for deal in closed_deals:
        if deal.company_id:
            deals_by_company[deal.company_id].append(deal)

    band_performance = []
    for label, low, high in _SCORE_BANDS:
        company_ids_in_band = [
            company_id
            for company_id, score in latest_scores.items()
            if low <= float(score.conversion_probability) <= high
        ]
        band_deals = [deal for cid in company_ids_in_band for deal in deals_by_company.get(cid, [])]
        won_count = sum(1 for deal in band_deals if deal.outcome == "won")
        closed_won_rate = round(won_count / len(band_deals), 4) if band_deals else 0.0
        band_performance.append(
            ScoreBandPerformance(band=label, count=len(company_ids_in_band), closed_won_rate=closed_won_rate)
        )

    accuracy_by_month: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # [correct, total]
    for deal in closed_deals:
        if not deal.closed_at or not deal.company_id:
            continue
        score = latest_scores.get(deal.company_id)
        if score is None:
            continue
        period = deal.closed_at.strftime("%Y-%m")
        is_correct = deal.outcome == "won" and score.recommended_service == deal.service_line
        accuracy_by_month[period][1] += 1
        if is_correct:
            accuracy_by_month[period][0] += 1

    model_accuracy_trend = [
        ModelAccuracyPoint(
            period=period, top1_recommendation_accuracy=round(correct / total, 4) if total else 0.0
        )
        for period, (correct, total) in sorted(accuracy_by_month.items())
    ]

    return TeamAnalyticsResponse(
        total_leads_scored=total_leads_scored,
        score_band_performance=band_performance,
        model_accuracy_trend=model_accuracy_trend,
    )


@router.get("/extended", response_model=ExtendedAnalyticsResponse)
def get_extended_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_manager_or_admin),
) -> ExtendedAnalyticsResponse:
    """Rich analytics payload used by the full Analytics page."""

    # ── latest score per company ─────────────────────────────────────────
    latest_scores = _latest_score_by_company(db)
    total_leads_scored = len(latest_scores)
    avg_prob = (
        round(sum(float(s.conversion_probability) for s in latest_scores.values()) / total_leads_scored, 2)
        if total_leads_scored else 0.0
    )

    # ── enrichment breakdown ─────────────────────────────────────────────
    all_companies = db.query(Company).all()
    enrichment_counts: dict[str, int] = defaultdict(int)
    for c in all_companies:
        enrichment_counts[c.enrichment_status] += 1
    enrichment = EnrichmentBreakdown(
        pending=enrichment_counts.get("pending", 0),
        enriched=enrichment_counts.get("enriched", 0),
        failed=enrichment_counts.get("failed", 0),
    )

    # ── service line performance ─────────────────────────────────────────
    SERVICE_LINES = ["branding", "hiring", "learning_development", "iac_partnership"]
    rec_counts: dict[str, int] = defaultdict(int)
    for s in latest_scores.values():
        if s.recommended_service:
            rec_counts[s.recommended_service] += 1

    all_deals = db.query(CRMDeal).all()
    service_won: dict[str, int] = defaultdict(int)
    service_lost: dict[str, int] = defaultdict(int)
    for deal in all_deals:
        if deal.service_line and deal.outcome == "won":
            service_won[deal.service_line] += 1
        elif deal.service_line and deal.outcome == "lost":
            service_lost[deal.service_line] += 1

    service_performance = [
        ServicePerformance(
            service=svc,
            recommended_count=rec_counts.get(svc, 0),
            won_count=service_won.get(svc, 0),
            lost_count=service_lost.get(svc, 0),
        )
        for svc in SERVICE_LINES
    ]

    # ── industry performance (top 8) ─────────────────────────────────────
    industry_companies: dict[str, list[uuid.UUID]] = defaultdict(list)
    for c in all_companies:
        if c.industry:
            industry_companies[c.industry].append(c.id)

    deals_by_company: dict[uuid.UUID, list[CRMDeal]] = defaultdict(list)
    for deal in all_deals:
        if deal.company_id and deal.outcome in ("won", "lost"):
            deals_by_company[deal.company_id].append(deal)

    industry_perf_list = []
    for industry, cids in industry_companies.items():
        industry_deals = [d for cid in cids for d in deals_by_company.get(cid, [])]
        won = sum(1 for d in industry_deals if d.outcome == "won")
        win_rate = round(won / len(industry_deals), 4) if industry_deals else 0.0
        industry_perf_list.append(
            IndustryPerformance(industry=industry, count=len(cids), win_rate=win_rate)
        )
    industry_perf_list.sort(key=lambda x: x.count, reverse=True)
    industry_performance = industry_perf_list[:8]

    # ── deal pipeline ────────────────────────────────────────────────────
    open_count = sum(1 for d in all_deals if d.outcome == "open")
    won_count = sum(1 for d in all_deals if d.outcome == "won")
    lost_count = sum(1 for d in all_deals if d.outcome == "lost")
    total_value = sum(float(d.deal_value) for d in all_deals if d.deal_value and d.outcome == "won")
    deal_pipeline = DealPipeline(
        open=open_count, won=won_count, lost=lost_count, total_deal_value=round(total_value, 2)
    )

    # ── score distribution (10 buckets of 10) ───────────────────────────
    bucket_counts: dict[int, int] = defaultdict(int)
    for s in latest_scores.values():
        bucket = min(int(float(s.conversion_probability) // 10) * 10, 90)
        bucket_counts[bucket] += 1
    score_distribution = [
        ScoreBucket(bucket=f"{b}-{b + 9}", count=bucket_counts.get(b, 0))
        for b in range(0, 100, 10)
    ]

    # ── feedback summary ─────────────────────────────────────────────────
    all_feedback = db.query(Feedback).all()
    accurate = sum(1 for f in all_feedback if f.is_accurate)
    feedback_summary = FeedbackSummary(accurate=accurate, inaccurate=len(all_feedback) - accurate)

    # ── scoring activity last 14 days ────────────────────────────────────
    cutoff = datetime.now(UTC) - timedelta(days=14)
    recent_scores = db.query(LeadScore).filter(LeadScore.scored_at >= cutoff).all()
    activity_by_day: dict[str, int] = defaultdict(int)
    for s in recent_scores:
        day = s.scored_at.strftime("%m/%d")
        activity_by_day[day] += 1
    today = datetime.now(UTC).date()
    scoring_activity = [
        ScoringActivityPoint(
            date=(today - timedelta(days=13 - i)).strftime("%m/%d"),
            count=activity_by_day.get((today - timedelta(days=13 - i)).strftime("%m/%d"), 0),
        )
        for i in range(14)
    ]

    # ── score band + model accuracy (reuse logic from /team) ────────────
    closed_deals = [d for d in all_deals if d.outcome in ("won", "lost")]
    deals_by_company_all: dict[uuid.UUID, list[CRMDeal]] = defaultdict(list)
    for deal in closed_deals:
        if deal.company_id:
            deals_by_company_all[deal.company_id].append(deal)

    band_performance = []
    for label, low, high in _SCORE_BANDS:
        cids_in_band = [
            cid for cid, s in latest_scores.items()
            if low <= float(s.conversion_probability) <= high
        ]
        band_deals = [d for cid in cids_in_band for d in deals_by_company_all.get(cid, [])]
        band_won = sum(1 for d in band_deals if d.outcome == "won")
        cwr = round(band_won / len(band_deals), 4) if band_deals else 0.0
        band_performance.append(ScoreBandPerformance(band=label, count=len(cids_in_band), closed_won_rate=cwr))

    accuracy_by_month: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for deal in closed_deals:
        if not deal.closed_at or not deal.company_id:
            continue
        score = latest_scores.get(deal.company_id)
        if score is None:
            continue
        period = deal.closed_at.strftime("%Y-%m")
        is_correct = deal.outcome == "won" and score.recommended_service == deal.service_line
        accuracy_by_month[period][1] += 1
        if is_correct:
            accuracy_by_month[period][0] += 1

    model_accuracy_trend = [
        ModelAccuracyPoint(
            period=period,
            top1_recommendation_accuracy=round(correct / total, 4) if total else 0.0,
        )
        for period, (correct, total) in sorted(accuracy_by_month.items())
    ]

    return ExtendedAnalyticsResponse(
        total_leads_scored=total_leads_scored,
        avg_conversion_probability=avg_prob,
        enrichment_breakdown=enrichment,
        service_performance=service_performance,
        industry_performance=industry_performance,
        deal_pipeline=deal_pipeline,
        score_distribution=score_distribution,
        feedback_summary=feedback_summary,
        scoring_activity_14d=scoring_activity,
        score_band_performance=band_performance,
        model_accuracy_trend=model_accuracy_trend,
    )

