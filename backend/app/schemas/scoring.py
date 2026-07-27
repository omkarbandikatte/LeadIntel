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
