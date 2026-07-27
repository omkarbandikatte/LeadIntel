import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CRMSyncRequest(BaseModel):
    direction: Literal["push", "pull"]


class CRMSyncResponse(BaseModel):
    direction: str
    record_count: int
    status: str
    error_detail: str | None = None


class CRMSyncLogEntry(BaseModel):
    id: uuid.UUID
    direction: str | None
    record_count: int | None
    status: str | None
    error_detail: str | None
    run_at: datetime

    model_config = {"from_attributes": True}


class CRMSyncHistoryResponse(BaseModel):
    results: list[CRMSyncLogEntry]
