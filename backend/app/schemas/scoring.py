from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ScoringRunRequest(BaseModel):
    mode: Literal["incremental", "full"] = "incremental"


class ScoringRunResponse(BaseModel):
    mode: str
    status: str = "queued"
    task_id: str
    model_version: str
    queued_at: datetime


class ModelCandidateMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    ranking_metrics: dict[str, float] = {}


class ModelReportResponse(BaseModel):
    trained_at: str
    training_rows: int
    selected_model: str
    model_version: str
    best_params: dict
    candidates: dict[str, ModelCandidateMetrics]
    feature_importance: dict[str, float] | None = None
