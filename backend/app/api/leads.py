import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_any_role
from app.db.session import get_db
from app.models.company import Company
from app.models.feedback import Feedback
from app.models.lead_score import LeadScore
from app.models.signal import Signal
from app.models.user import User
from app.schemas.lead import (
    EvidenceItem,
    FeedbackRequest,
    FeedbackResponse,
    LeadExplanationResponse,
    LeadListItem,
    LeadListResponse,
    LeadSortOption,
    TopFactor,
)
from app.services.scoring.rules_engine import SIGNAL_DECAY_WINDOW_DAYS

router = APIRouter(prefix="/api/leads", tags=["leads"])

SERVICE_LABELS: dict[str, str] = {
    "branding": "Employer Branding",
    "hiring": "Recruitment & Hiring",
    "learning_development": "Learning & Development",
    "iac_partnership": "Industry-Academia Partnership",
}


def _latest_score_subquery(db: Session):
    return (
        db.query(
            LeadScore.company_id.label("company_id"),
            func.max(LeadScore.scored_at).label("max_scored_at"),
        )
        .group_by(LeadScore.company_id)
        .subquery()
    )


def _get_latest_score_or_404(db: Session, company_id: uuid.UUID, organization_id: uuid.UUID | None) -> LeadScore:
    lead_score = (
        db.query(LeadScore)
        .join(Company, Company.id == LeadScore.company_id)
        .filter(LeadScore.company_id == company_id, Company.organization_id == organization_id)
        .order_by(LeadScore.scored_at.desc())
        .first()
    )
    if lead_score is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "COMPANY_NOT_FOUND", "message": "No company with this id exists."}},
        )
    return lead_score


@router.get("", response_model=LeadListResponse)
def list_leads(
    sort: LeadSortOption = "score_desc",
    min_score: float | None = Query(default=None, ge=0, le=100),
    max_score: float | None = Query(default=None, ge=0, le=100),
    industry: str | None = None,
    region: str | None = None,
    recommended_service: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> LeadListResponse:
    latest = _latest_score_subquery(db)

    query = (
        db.query(LeadScore, Company)
        .join(Company, Company.id == LeadScore.company_id)
        .join(
            latest,
            (LeadScore.company_id == latest.c.company_id) & (LeadScore.scored_at == latest.c.max_scored_at),
        )
        .filter(Company.organization_id == current_user.organization_id)
    )

    if min_score is not None:
        query = query.filter(LeadScore.conversion_probability >= min_score)
    if max_score is not None:
        query = query.filter(LeadScore.conversion_probability <= max_score)
    if industry:
        query = query.filter(func.lower(Company.industry) == industry.lower())
    if region:
        region_lower = region.lower()
        query = query.filter(
            func.lower(Company.location_city).like(f"%{region_lower}%")
            | func.lower(Company.location_state).like(f"%{region_lower}%")
            | func.lower(Company.location_country).like(f"%{region_lower}%")
        )
    if recommended_service:
        query = query.filter(LeadScore.recommended_service == recommended_service)

    total = query.count()

    if sort == "score_asc":
        query = query.order_by(LeadScore.conversion_probability.asc())
    elif sort == "recent":
        query = query.order_by(LeadScore.scored_at.desc())
    else:
        query = query.order_by(LeadScore.conversion_probability.desc())

    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    results = [
        LeadListItem(
            company_id=company.id,
            company_name=company.name,
            conversion_probability=float(score.conversion_probability),
            opportunity_score=(
                float(score.opportunity_score) if score.opportunity_score is not None else None
            ),
            recommended_service=score.recommended_service,
            recommendation_confidence=(
                float(score.recommendation_confidence)
                if score.recommendation_confidence is not None
                else None
            ),
            industry=company.industry,
            location=company.location_city or company.location_country,
            intent_trend=score.intent_trend,
            last_scored_at=score.scored_at,
        )
        for score, company in rows
    ]

    return LeadListResponse(total=total, page=page, page_size=page_size, results=results)


@router.get("/{company_id}/explanation", response_model=LeadExplanationResponse)
def get_lead_explanation(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> LeadExplanationResponse:
    lead_score = _get_latest_score_or_404(db, company_id, current_user.organization_id)

    top_factors = [TopFactor(**factor) for factor in (lead_score.top_factors or [])]

    decay_cutoff = datetime.now(UTC) - timedelta(days=SIGNAL_DECAY_WINDOW_DAYS)
    recent_signals = (
        db.query(Signal)
        .filter(Signal.company_id == company_id, Signal.detected_at >= decay_cutoff)
        .order_by(Signal.detected_at.desc())
        .limit(5)
        .all()
    )

    why_this_company = None
    if top_factors:
        reasons = ", ".join(f.factor for f in top_factors[:3])
        why_this_company = f"Surfaced because: {reasons}."

    why_now = None
    if recent_signals:
        newest = recent_signals[0]
        age_days = max(0, (datetime.now(UTC) - newest.detected_at).days)
        age_text = "today" if age_days == 0 else f"{age_days} day(s) ago"
        why_now = (
            f"A {newest.direction} '{newest.signal_type.replace('_', ' ')}' signal was detected {age_text}."
        )

    what_to_offer = None
    if lead_score.recommended_service:
        label = SERVICE_LABELS.get(lead_score.recommended_service, lead_score.recommended_service)
        confidence_pct = (
            round(float(lead_score.recommendation_confidence) * 100)
            if lead_score.recommendation_confidence is not None
            else None
        )
        what_to_offer = (
            f"{label}" + (f" ({confidence_pct}% confidence)" if confidence_pct is not None else "")
        )

    return LeadExplanationResponse(
        company_id=company_id,
        fit_score=float(lead_score.fit_score) if lead_score.fit_score is not None else None,
        intent_score=float(lead_score.intent_score) if lead_score.intent_score is not None else None,
        conversion_probability=float(lead_score.conversion_probability),
        opportunity_score=(
            float(lead_score.opportunity_score) if lead_score.opportunity_score is not None else None
        ),
        engagement_score=(
            float(lead_score.engagement_score) if lead_score.engagement_score is not None else None
        ),
        intent_trend=lead_score.intent_trend,
        top_factors=top_factors,
        recommended_service=lead_score.recommended_service,
        recommendation_confidence=(
            float(lead_score.recommendation_confidence)
            if lead_score.recommendation_confidence is not None
            else None
        ),
        service_probabilities=lead_score.service_probabilities,
        model_version=lead_score.model_version,
        why_this_company=why_this_company,
        why_now=why_now,
        what_to_offer=what_to_offer,
        evidence=[
            EvidenceItem(
                signal_type=s.signal_type,
                direction=s.direction,
                confidence=float(s.confidence or 0),
                headline=s.headline,
                detected_at=s.detected_at,
            )
            for s in recent_signals
        ],
    )


@router.post(
    "/{company_id}/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_lead_feedback(
    company_id: uuid.UUID,
    payload: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Feedback:
    lead_score = _get_latest_score_or_404(db, company_id, current_user.organization_id)

    feedback = Feedback(
        lead_score_id=lead_score.id,
        user_id=current_user.id,
        is_accurate=payload.is_accurate,
        comment=payload.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback
