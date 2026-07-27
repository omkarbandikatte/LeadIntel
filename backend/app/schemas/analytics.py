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
