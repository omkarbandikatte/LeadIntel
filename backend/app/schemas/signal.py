import uuid
from datetime import datetime

from pydantic import BaseModel


class SignalResponse(BaseModel):
    id: uuid.UUID
    signal_type: str
    direction: str
    confidence: float
    headline: str | None
    detected_at: datetime

    model_config = {"from_attributes": True}


class SignalListResponse(BaseModel):
    total: int
    results: list[SignalResponse]
