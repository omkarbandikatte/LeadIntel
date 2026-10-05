import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ServiceOfferingCreate(BaseModel):
    key: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ServiceOfferingResponse(BaseModel):
    id: uuid.UUID
    key: str
    label: str
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class OrganizationSignupRequest(BaseModel):
    """Everything a new company needs to give us to start getting leads
    generated for itself — the "any company can use this" onboarding flow."""

    organization_name: str = Field(min_length=1, max_length=500)
    industry: str | None = None
    employee_count_band: str | None = None
    website: str | None = None

    admin_full_name: str
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)

    # What this company sells — replaces the old hardcoded 4 service lines.
    # Must list at least one; label/description describe it for the
    # NLP classifier and the UI.
    service_offerings: list[ServiceOfferingCreate] = Field(min_length=1)


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    industry: str | None
    employee_count_band: str | None
    website: str | None
    created_at: datetime
    service_offerings: list[ServiceOfferingResponse] = []

    model_config = {"from_attributes": True}


class OrganizationSignupResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    organization: OrganizationResponse


class CompanyDiscoverRequest(BaseModel):
    """ICP filters for POST /api/companies/discover — finds companies already
    known to the platform (added by any organization) that match and aren't
    already in the caller's own company list, then imports fresh,
    independently-scored copies into the caller's organization."""

    industries: list[str] | None = None
    employee_count_bands: list[str] | None = None
    revenue_bands: list[str] | None = None
    max_results: int = Field(default=25, ge=1, le=200)


class CompanyDiscoverResponse(BaseModel):
    discovered: int
    company_ids: list[uuid.UUID]
