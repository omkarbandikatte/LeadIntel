import uuid
from datetime import date, datetime

from pydantic import BaseModel


class CompanyCreateRequest(BaseModel):
    name: str
    website: str | None = None
    industry: str | None = None


class CompanyResponse(BaseModel):
    id: uuid.UUID
    name: str
    website: str | None
    industry: str | None
    employee_count_band: str | None
    revenue_band: str | None
    location_city: str | None
    location_state: str | None
    location_country: str | None
    incorporation_date: date | None
    source: str | None
    enrichment_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NLPFeatureSummary(BaseModel):
    predicted_need_category: str | None
    confidence: float | None
    processed_at: datetime

    model_config = {"from_attributes": True}


class CompanyDetailResponse(CompanyResponse):
    latest_nlp_features: list[NLPFeatureSummary] = []


class BulkUploadRowError(BaseModel):
    row: int
    reason: str


class BulkUploadResponse(BaseModel):
    accepted: int
    rejected: int
    errors: list[BulkUploadRowError] = []


class EnrichTriggerResponse(BaseModel):
    company_id: uuid.UUID
    enrichment_status: str
    message: str = "Enrichment queued"


class RawDocumentResponse(BaseModel):
    id: uuid.UUID
    doc_type: str
    source_url: str | None
    raw_text: str | None
    scraped_at: datetime

    model_config = {"from_attributes": True}
