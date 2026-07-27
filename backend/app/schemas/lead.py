import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class LeadListItem(BaseModel):
    company_id: uuid.UUID
    company_name: str
    conversion_probability: float
    recommended_service: str | None
    recommendation_confidence: float | None
    industry: str | None
    location: str | None
    last_scored_at: datetime


class LeadListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[LeadListItem]


class TopFactor(BaseModel):
    factor: str
    weight: float


class LeadExplanationResponse(BaseModel):
    company_id: uuid.UUID
    fit_score: float | None
    intent_score: float | None
    conversion_probability: float
    top_factors: list[TopFactor]
    recommended_service: str | None
    recommendation_confidence: float | None
    model_version: str | None


class FeedbackRequest(BaseModel):
    is_accurate: bool
    comment: str | None = None


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    lead_score_id: uuid.UUID
    is_accurate: bool
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


LeadSortOption = Literal["score_desc", "score_asc", "recent"]
