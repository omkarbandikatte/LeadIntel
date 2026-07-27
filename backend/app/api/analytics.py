import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_manager_or_admin
from app.db.session import get_db
from app.models.crm_deal import CRMDeal
from app.models.lead_score import LeadScore
from app.models.user import User
from app.schemas.analytics import ModelAccuracyPoint, ScoreBandPerformance, TeamAnalyticsResponse

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
