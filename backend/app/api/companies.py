import csv
import io
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_any_role
from app.db.session import get_db
from app.models.company import Company
from app.models.enums import EnrichmentStatus
from app.models.raw_document import RawDocument
from app.models.signal import Signal
from app.models.user import User
from app.schemas.company import (
    BulkUploadResponse,
    BulkUploadRowError,
    CompanyCreateRequest,
    CompanyDetailResponse,
    CompanyListResponse,
    CompanyResponse,
    EnrichTriggerResponse,
    RawDocumentResponse,
)
from app.schemas.organization import CompanyDiscoverRequest, CompanyDiscoverResponse
from app.schemas.signal import SignalListResponse, SignalResponse
from app.worker import enrich_company_task

router = APIRouter(prefix="/api/companies", tags=["companies"])
logger = logging.getLogger(__name__)


def _get_company_or_404(db: Session, company_id: uuid.UUID, organization_id: uuid.UUID | None) -> Company:
    company = (
        db.query(Company)
        .filter(Company.id == company_id, Company.organization_id == organization_id)
        .first()
    )
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "COMPANY_NOT_FOUND", "message": "No company with this id exists."}},
        )
    return company


@router.get("", response_model=CompanyListResponse)
def list_companies(
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> CompanyListResponse:
    q = db.query(Company).filter(Company.organization_id == current_user.organization_id)
    if search:
        q = q.filter(Company.name.ilike(f"%{search}%"))
    total = q.count()
    results = q.order_by(Company.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return CompanyListResponse(total=total, page=page, page_size=page_size, results=results)


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Company:
    company = Company(
        name=payload.name,
        website=payload.website,
        industry=payload.industry,
        organization_id=current_user.organization_id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    try:
        enrich_company_task.delay(str(company.id))
    except Exception:
        logger.exception("Could not queue enrichment for company %s", company.id)
    return company


@router.post("/bulk-upload", response_model=BulkUploadResponse)
def bulk_upload_companies(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> BulkUploadResponse:
    raw = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))

    accepted = 0
    errors: list[BulkUploadRowError] = []

    companies: list[Company] = []
    for row_number, row in enumerate(reader, start=2):  # header is row 1
        name = (row.get("name") or "").strip()
        if not name:
            errors.append(BulkUploadRowError(row=row_number, reason="Missing required field 'name'"))
            continue

        company = Company(
            name=name,
            website=(row.get("website") or "").strip() or None,
            industry=(row.get("industry") or "").strip() or None,
            organization_id=current_user.organization_id,
        )
        db.add(company)
        companies.append(company)
        accepted += 1

    db.commit()
    for company in companies:
        try:
            enrich_company_task.delay(str(company.id))
        except Exception:
            logger.exception("Could not queue enrichment for company %s", company.id)
    return BulkUploadResponse(accepted=accepted, rejected=len(errors), errors=errors)


@router.get("/{company_id}", response_model=CompanyDetailResponse)
def get_company(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> Company:
    company = _get_company_or_404(db, company_id, current_user.organization_id)
    company.latest_nlp_features = sorted(company.nlp_features, key=lambda f: f.processed_at, reverse=True)[
        :10
    ]
    return company


@router.post(
    "/{company_id}/enrich", response_model=EnrichTriggerResponse, status_code=status.HTTP_202_ACCEPTED
)
def trigger_enrichment(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> EnrichTriggerResponse:
    company = _get_company_or_404(db, company_id, current_user.organization_id)
    company.enrichment_status = EnrichmentStatus.PENDING.value
    db.add(company)
    db.commit()

    enrich_company_task.delay(str(company.id))

    return EnrichTriggerResponse(company_id=company.id, enrichment_status=company.enrichment_status)


@router.get("/{company_id}/documents", response_model=list[RawDocumentResponse])
def list_company_documents(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> list[RawDocument]:
    _get_company_or_404(db, company_id, current_user.organization_id)
    return (
        db.query(RawDocument)
        .filter(RawDocument.company_id == company_id)
        .order_by(RawDocument.scraped_at.desc())
        .all()
    )


@router.get("/{company_id}/signals", response_model=SignalListResponse)
def list_company_signals(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> SignalListResponse:
    """Business Signal Engine timeline — every typed, directional signal detected
    for this company (hiring, expansion, funding, technology adoption, leadership
    change, layoffs, hiring freeze), newest first.
    """
    _get_company_or_404(db, company_id, current_user.organization_id)
    signals = (
        db.query(Signal)
        .filter(Signal.company_id == company_id)
        .order_by(Signal.detected_at.desc())
        .limit(100)
        .all()
    )
    return SignalListResponse(
        total=len(signals),
        results=[
            SignalResponse(
                id=s.id,
                signal_type=s.signal_type,
                direction=s.direction,
                confidence=float(s.confidence or 0),
                headline=s.headline,
                detected_at=s.detected_at,
            )
            for s in signals
        ],
    )


@router.post("/discover", response_model=CompanyDiscoverResponse, status_code=status.HTTP_202_ACCEPTED)
def discover_companies(
    payload: CompanyDiscoverRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role),
) -> CompanyDiscoverResponse:
    """ICP-based lead discovery: "give us your company info, we'll find leads."

    The candidate pool is every distinct company profile already known to the
    platform (added/enriched by any organization that has used LeadIntel) —
    this is the realistic implementation of cross-tenant discovery without a
    paid third-party data provider: as more organizations onboard and add
    real companies, the shared directory of company profiles (name/industry/
    size/revenue/location — no scores, deals, or other tenants' proprietary
    data) grows, and every new organization benefits from it immediately.
    Each match is imported as the caller's OWN company row and independently
    enriched + scored against the caller's own service catalog and ICP —
    nothing about another organization's scoring, deals, or NLP results is
    ever shared.
    """
    directory_query = db.query(Company).filter(Company.organization_id != current_user.organization_id)
    if payload.industries:
        directory_query = directory_query.filter(Company.industry.in_(payload.industries))
    if payload.employee_count_bands:
        directory_query = directory_query.filter(Company.employee_count_band.in_(payload.employee_count_bands))
    if payload.revenue_bands:
        directory_query = directory_query.filter(Company.revenue_band.in_(payload.revenue_bands))

    existing_names = {
        name
        for (name,) in db.query(Company.name).filter(Company.organization_id == current_user.organization_id).all()
    }

    seen_names: set[str] = set()
    created: list[Company] = []
    for candidate in directory_query.order_by(Company.created_at.desc()).limit(payload.max_results * 5):
        if len(created) >= payload.max_results:
            break
        if candidate.name in existing_names or candidate.name in seen_names:
            continue
        seen_names.add(candidate.name)

        new_company = Company(
            organization_id=current_user.organization_id,
            name=candidate.name,
            website=candidate.website,
            industry=candidate.industry,
            employee_count_band=candidate.employee_count_band,
            revenue_band=candidate.revenue_band,
            location_city=candidate.location_city,
            location_state=candidate.location_state,
            location_country=candidate.location_country,
            source="discovered",
        )
        db.add(new_company)
        created.append(new_company)

    db.commit()
    for company in created:
        db.refresh(company)
        try:
            enrich_company_task.delay(str(company.id))
        except Exception:
            logger.exception("Could not queue enrichment for discovered company %s", company.id)

    return CompanyDiscoverResponse(discovered=len(created), company_ids=[c.id for c in created])

