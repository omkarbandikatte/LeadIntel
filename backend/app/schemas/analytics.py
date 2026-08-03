from pydantic import BaseModel


class ScoreBandPerformance(BaseModel):
    band: str
    count: int
    closed_won_rate: float


class ModelAccuracyPoint(BaseModel):
    period: str
    top1_recommendation_accuracy: float


class TeamAnalyticsResponse(BaseModel):
    total_leads_scored: int
    score_band_performance: list[ScoreBandPerformance]
    model_accuracy_trend: list[ModelAccuracyPoint]


# ── Extended analytics ──────────────────────────────────────────────────────

class EnrichmentBreakdown(BaseModel):
    pending: int
    enriched: int
    failed: int


class ServicePerformance(BaseModel):
    service: str
    recommended_count: int
    won_count: int
    lost_count: int


class IndustryPerformance(BaseModel):
    industry: str
    count: int
    win_rate: float


class DealPipeline(BaseModel):
    open: int
    won: int
    lost: int
    total_deal_value: float


class ScoreBucket(BaseModel):
    bucket: str
    count: int


class FeedbackSummary(BaseModel):
    accurate: int
    inaccurate: int


class ScoringActivityPoint(BaseModel):
    date: str
    count: int


class ExtendedAnalyticsResponse(BaseModel):
    total_leads_scored: int
    avg_conversion_probability: float
    enrichment_breakdown: EnrichmentBreakdown
    service_performance: list[ServicePerformance]
    industry_performance: list[IndustryPerformance]
    deal_pipeline: DealPipeline
    score_distribution: list[ScoreBucket]
    feedback_summary: FeedbackSummary
    scoring_activity_14d: list[ScoringActivityPoint]
    score_band_performance: list[ScoreBandPerformance]
    model_accuracy_trend: list[ModelAccuracyPoint]
